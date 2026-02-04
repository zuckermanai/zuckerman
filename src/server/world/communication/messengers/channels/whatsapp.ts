import {
  makeWASocket,
  ConnectionState,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type AnyMessageContent,
} from "@whiskeysockets/baileys";
import type { Channel, ChannelMessage } from "./types.js";
import type { WhatsAppConfig } from "@server/world/config/types.js";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { getWhatsAppAuthDir } from "@server/world/homedir/paths.js";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";

const AUTH_DIR = getWhatsAppAuthDir();

enum ChannelState {
  IDLE = "idle",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  STOPPING = "stopping",
  RESTARTING = "restarting",
}

export class WhatsAppChannel implements Channel {
  id: string = "whatsapp";
  type = "whatsapp" as const;
  
  private socket: WASocket | null = null;
  private config: WhatsAppConfig;
  private messageHandlers: Array<(message: ChannelMessage) => void> = [];
  private state: ChannelState = ChannelState.IDLE;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private statusCallback?: (status: {
    status: "connected" | "connecting" | "disconnected" | "waiting_for_scan";
    qr?: string | null;
  }) => void;
  private saveCreds: (() => Promise<void>) | null = null;
  private currentQrCode: string | null = null;
  private lastState: ChannelState | null = null;
  private stateUpdateDebounce: NodeJS.Timeout | null = null;

  constructor(
    config: WhatsAppConfig,
    statusCallback?: (status: {
      status: "connected" | "connecting" | "disconnected" | "waiting_for_scan";
      qr?: string | null;
    }) => void,
  ) {
    this.config = config;
    this.statusCallback = statusCallback;
  }

  async start(): Promise<void> {
    if (this.state === ChannelState.CONNECTED) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[WhatsApp] Channel is disabled in config");
      return;
    }

    // Reset to IDLE if stopped, then transition to CONNECTING
    if (this.state === ChannelState.STOPPING || this.state === ChannelState.IDLE) {
      this.state = ChannelState.IDLE;
    }

    try {
      await this.connect();
    } catch (error) {
      console.error("[WhatsApp] Failed to start:", error);
      this.state = ChannelState.IDLE;
      throw error;
    }
  }

  private async connect(): Promise<void> {
    // Don't connect if stopping, stopped, or disabled
    if (this.state === ChannelState.STOPPING || !this.config.enabled) {
      console.log("[WhatsApp] Cannot connect - channel stopped or disabled");
      this.state = ChannelState.IDLE;
      return;
    }

    // Don't connect if already connecting or connected
    if (this.state === ChannelState.CONNECTING || this.state === ChannelState.CONNECTED) {
      return;
    }

    this.state = ChannelState.CONNECTING;

    try {
      // Clean up old socket if exists - remove ALL event listeners first
      if (this.socket) {
        try {
          // Remove all event listeners before ending
          this.socket.ev.removeAllListeners("creds.update");
          this.socket.ev.removeAllListeners("connection.update");
          this.socket.ev.removeAllListeners("messages.upsert");
          await this.socket.end(undefined);
        } catch (error) {
          // Ignore errors when ending old socket
        }
        this.socket = null;
      }

      // Ensure auth directory exists
      if (!existsSync(AUTH_DIR)) {
        mkdirSync(AUTH_DIR, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      // Wrap saveCreds to ensure directory exists before saving
      this.saveCreds = async () => {
        if (!existsSync(AUTH_DIR)) {
          mkdirSync(AUTH_DIR, { recursive: true });
        }
        await saveCreds();
      };
      const { version } = await fetchLatestBaileysVersion();

      const logger = pino({ level: "silent" });

      this.socket = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        version,
        logger,
        printQRInTerminal: false,
        browser: ["Zuckerman", "CLI", "1.0"],
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      this.setupEventHandlers();
      // State is already set to CONNECTING above
    } catch (error) {
      this.state = ChannelState.IDLE;
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    // Handle credentials update - CRITICAL: must save credentials immediately
    this.socket.ev.on("creds.update", async () => {
      try {
        console.log("[WhatsApp] Credentials updated, saving...");
        if (this.saveCreds) {
          await this.saveCreds();
        }
        console.log("[WhatsApp] Credentials saved successfully");
      } catch (error) {
        console.error("[WhatsApp] Failed to save credentials:", error);
      }
    });

    // Handle connection updates
    this.socket.ev.on("connection.update", (update: Partial<ConnectionState>) => {
      this.handleConnectionUpdate(update);
    });

    // Handle incoming messages
    this.socket.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const message of messages) {
        if (!message.key.fromMe && message.message) {
          await this.handleIncomingMessage(message);
        }
      }
    });
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    // Handle QR code FIRST - before clearing, to avoid clearing new QR codes
    if (qr) {
      // Don't show QR if already connected or restarting
      if (this.state === ChannelState.CONNECTED || this.state === ChannelState.RESTARTING) {
        console.log("[WhatsApp] Ignoring QR code - already connected or restarting");
        return;
      }
      this.handleQrCode(qr);
      // Don't clear QR code if we just received a new one
      // Continue to handle connection state below
    } else {
      // Clear QR code on connection state change (but only if no new QR code)
      // This ensures QR doesn't persist when connection state changes
      if (this.currentQrCode && connection !== undefined) {
        const wasConnecting = connection === "connecting";
        this.clearQrCode();
        // If QR was cleared and we're connecting, broadcast connecting state
        if (wasConnecting) {
          this.handleConnecting();
        }
      }
    }

    // Handle connection state changes with debouncing
    // Only process connection state if we didn't just handle a QR code (or if QR was handled, continue)
    if (connection === "open") {
      this.handleConnected();
    } else if (connection === "connecting") {
      // Only call handleConnecting if we didn't already handle it above
      if (!this.currentQrCode || this.state !== ChannelState.CONNECTING) {
        this.handleConnecting();
      }
    } else if (connection === "close") {
      this.handleDisconnected(lastDisconnect);
    }
  }

  private handleQrCode(qr: string): void {
    // Store current QR code
    this.currentQrCode = qr;
    
    if (this.statusCallback) {
      this.statusCallback({
        status: "waiting_for_scan",
        qr: qr,
      });
    } else {
      // Fallback: print to terminal (CLI mode)
      console.log("\n[WhatsApp] Scan this QR code with WhatsApp:");
      const qrModule = qrcodeTerminal as any;
      if (qrModule.default?.generate) {
        qrModule.default.generate(qr, { small: true });
      } else if (qrModule.generate) {
        qrModule.generate(qr, { small: true });
      } else {
        console.log("QR Code:", qr);
      }
      console.log("\n");
    }
  }

  private clearQrCode(): void {
    if (this.currentQrCode) {
      this.currentQrCode = null;
    }
  }

  private handleConnected(): void {
    // Debounce state updates to prevent rapid toggles
    if (this.stateUpdateDebounce) {
      clearTimeout(this.stateUpdateDebounce);
    }

    this.stateUpdateDebounce = setTimeout(() => {
      // Check current state before updating
      const previousState = this.state;
      
      if (previousState === ChannelState.CONNECTED) {
        return; // Already connected
      }

      // Clear QR code when connected
      this.clearQrCode();

      // Ensure credentials are saved before marking as connected
      if (this.saveCreds) {
        this.saveCreds().catch((error) => {
          console.error("[WhatsApp] Failed to save credentials on connect:", error);
        });
      }

      console.log("[WhatsApp] Connected successfully - device should appear in WhatsApp linked devices");
      this.state = ChannelState.CONNECTED;
      
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }

      // Always notify connection callback (state changed from non-connected to connected)
      if (this.statusCallback) {
        this.statusCallback({
          status: "connected",
          qr: null,
        });
      }
      this.lastState = this.state;
    }, 300); // 300ms debounce
  }

  private handleConnecting(): void {
    if (this.state !== ChannelState.CONNECTING && this.state !== ChannelState.RESTARTING) {
      console.log("[WhatsApp] Connecting...");
      this.state = ChannelState.CONNECTING;
      // Broadcast connecting state
      if (this.statusCallback) {
        this.statusCallback({
          status: "connecting",
          qr: null,
        });
      }
    }
  }

  private handleDisconnected(lastDisconnect?: ConnectionState["lastDisconnect"]): void {
    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;

    // Handle restart required (normal after QR scan)
    // WhatsApp disconnects after QR scan to present auth credentials
    // We MUST create a new socket - the old one is useless
    if (statusCode === DisconnectReason.restartRequired) {
      console.log("[WhatsApp] Restart required after QR scan - creating new socket...");
      this.state = ChannelState.RESTARTING;
      // Don't update connection status callback during restart - it's temporary
      // Keep the state as CONNECTING to prevent UI flicker
      // Don't notify disconnect during restart - it's temporary
      
      // Ensure credentials are saved before reconnecting
      if (this.saveCreds) {
        this.saveCreds()
          .then(() => {
            console.log("[WhatsApp] Credentials saved, reconnecting with new socket...");
            // Clean up old socket - remove event listeners first
            if (this.socket) {
              try {
                this.socket.ev.removeAllListeners("creds.update");
                this.socket.ev.removeAllListeners("connection.update");
                this.socket.ev.removeAllListeners("messages.upsert");
                this.socket.end(undefined);
              } catch {
                // Ignore errors when ending socket
              }
              this.socket = null;
            }
            
            // Wait a bit longer to ensure credentials are fully persisted
            // Check if still enabled before reconnecting
            // State could have changed if stop() was called
            // Use type assertion to prevent TypeScript from narrowing the type
            const currentState = this.state as ChannelState;
            if (currentState !== ChannelState.STOPPING && this.config.enabled) {
              this.reconnectTimeout = setTimeout(() => {
                // State could have changed during timeout
                const stateAtTimeout = this.state as ChannelState;
                if (stateAtTimeout !== ChannelState.STOPPING && this.config.enabled) {
                  this.connect().catch((error) => {
                    console.error("[WhatsApp] Reconnection after restart failed:", error);
                    this.state = ChannelState.IDLE;
                  });
                } else {
                  console.log("[WhatsApp] Skipping reconnect - channel stopped or disabled");
                  this.state = ChannelState.IDLE;
                }
              }, 5000);
            } else {
              console.log("[WhatsApp] Skipping reconnect - channel stopped or disabled");
              this.state = ChannelState.IDLE;
            }
          })
          .catch((error) => {
            console.error("[WhatsApp] Failed to save credentials before restart:", error);
            this.state = ChannelState.IDLE;
          });
      } else {
        // No saveCreds function, just reconnect if still enabled
        if (this.socket) {
          try {
            this.socket.ev.removeAllListeners("creds.update");
            this.socket.ev.removeAllListeners("connection.update");
            this.socket.ev.removeAllListeners("messages.upsert");
            this.socket.end(undefined);
          } catch {
            // Ignore errors when ending socket
          }
          this.socket = null;
        }
        // Check state - could have changed if stop() was called
        // Use type assertion to prevent TypeScript from narrowing the type
        const currentState = this.state as ChannelState;
        if (currentState !== ChannelState.STOPPING && this.config.enabled) {
          this.reconnectTimeout = setTimeout(() => {
            // State could have changed during timeout
            const stateAtTimeout = this.state as ChannelState;
            if (stateAtTimeout !== ChannelState.STOPPING && this.config.enabled) {
              this.connect().catch((error) => {
                console.error("[WhatsApp] Reconnection failed:", error);
                this.state = ChannelState.IDLE;
              });
            } else {
              this.state = ChannelState.IDLE;
            }
          }, 5000);
        } else {
          this.state = ChannelState.IDLE;
        }
      }
      return;
    }

    // Handle connection replaced (440) - another device connected
    if (statusCode === DisconnectReason.connectionReplaced) {
      console.log("[WhatsApp] Connection replaced by another device - clearing credentials and stopping");
      this.clearQrCode();
      this.state = ChannelState.STOPPING;
      this.clearCredentials();
      
      // Cancel any pending reconnection
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // Don't reconnect automatically - user needs to scan QR again
      if (this.statusCallback) {
        this.statusCallback({
          status: "disconnected",
          qr: null,
        });
      }
      this.lastState = this.state;
      this.state = ChannelState.IDLE;
      return;
    }

    // Handle logout
    if (statusCode === DisconnectReason.loggedOut) {
      console.log("[WhatsApp] Logged out, please scan QR code again");
      this.clearQrCode();
      this.state = ChannelState.STOPPING;
      this.clearCredentials();
      
      // Cancel any pending reconnection
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // Only notify if state actually changed
      if (this.lastState !== ChannelState.IDLE && this.statusCallback) {
        this.statusCallback({
          status: "disconnected",
          qr: null,
        });
      }
      this.lastState = this.state;
      this.state = ChannelState.IDLE;
      return;
    }

    // Handle other disconnects - only reconnect if channel is still enabled and not stopped
    if (statusCode !== DisconnectReason.connectionClosed) {
      // Don't reconnect if stopping or disabled
      if (this.state === ChannelState.STOPPING || !this.config.enabled) {
        console.log("[WhatsApp] Not reconnecting - channel stopped or disabled");
        this.state = ChannelState.IDLE;
        if (this.statusCallback) {
          this.statusCallback({
            status: "disconnected",
            qr: null,
          });
        }
        return;
      }

      const backoffDelay = 5000;
      console.log(`[WhatsApp] Connection closed (code: ${statusCode}), reconnecting in ${backoffDelay}ms...`);
      
      // Don't immediately set to IDLE - show as CONNECTING during reconnect
      const wasConnected = this.state === ChannelState.CONNECTED;
      this.state = ChannelState.CONNECTING;
      
      // Clean up old socket before reconnecting
      if (this.socket) {
        try {
          this.socket.ev.removeAllListeners("creds.update");
          this.socket.ev.removeAllListeners("connection.update");
          this.socket.ev.removeAllListeners("messages.upsert");
          this.socket.end(undefined);
        } catch {
          // Ignore errors
        }
        this.socket = null;
      }
      
      // Only notify disconnect if we were actually connected
      if (wasConnected && this.statusCallback) {
        this.statusCallback({
          status: "disconnected",
          qr: null,
        });
      }
      
      // Cancel any existing reconnect timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }
      
      this.reconnectTimeout = setTimeout(() => {
        // Double-check before reconnecting
        if (this.state !== ChannelState.STOPPING && this.config.enabled) {
          this.connect().catch((error) => {
            console.error("[WhatsApp] Reconnection failed:", error);
            this.state = ChannelState.IDLE;
            if (this.statusCallback) {
              this.statusCallback({
                status: "disconnected",
                qr: null,
              });
            }
          });
        } else {
          console.log("[WhatsApp] Skipping reconnect - channel stopped or disabled");
          this.state = ChannelState.IDLE;
        }
      }, backoffDelay);
    }
  }

  async stop(): Promise<void> {
    // Transition to STOPPING state to prevent any reconnection attempts
    this.state = ChannelState.STOPPING;

    // Cancel all timeouts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.stateUpdateDebounce) {
      clearTimeout(this.stateUpdateDebounce);
      this.stateUpdateDebounce = null;
    }

    this.clearQrCode();

    // Remove all event listeners and close socket
    if (this.socket) {
      try {
        // Remove all listeners before ending
        this.socket.ev.removeAllListeners("creds.update");
        this.socket.ev.removeAllListeners("connection.update");
        this.socket.ev.removeAllListeners("messages.upsert");
        await this.socket.end(undefined);
      } catch (error) {
        // Ignore errors when stopping
      }
      this.socket = null;
    }

    const previousState = this.state;
    this.state = ChannelState.IDLE;
    
    // Only notify if state actually changed (wasn't already idle)
    if (previousState === ChannelState.STOPPING && this.statusCallback) {
      this.statusCallback({
        status: "disconnected",
        qr: null,
      });
    }
    this.lastState = this.state;
  }

  private clearCredentials(): void {
    try {
      if (existsSync(AUTH_DIR)) {
        rmSync(AUTH_DIR, { recursive: true, force: true });
        console.log("[WhatsApp] Credentials cache cleared");
      }
    } catch (error) {
      console.error("[WhatsApp] Failed to clear credentials cache:", error);
    }
  }

  async send(message: string, to: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error("WhatsApp channel is not connected");
    }

    if (!this.socket) {
      throw new Error("WhatsApp socket is not available");
    }

    const jid = this.normalizeJid(to);

    try {
      await this.socket.sendMessage(jid, { text: message });
    } catch (error) {
      console.error(`[WhatsApp] Failed to send message to ${to}:`, error);
      throw error;
    }
  }

  onMessage(handler: (message: ChannelMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  private async handleIncomingMessage(message: any): Promise<void> {
    const from = message.key.remoteJid || "";
    const messageText = this.extractMessageText(message.message);
    
    if (!messageText) {
      return;
    }

    // Check allowlist if configured
    if (this.config.dmPolicy === "allowlist" && this.config.allowFrom) {
      const senderId = this.extractPhoneNumber(from);
      const isAllowed = this.config.allowFrom.includes("*") || 
                       this.config.allowFrom.some(allowed => 
                         senderId.includes(allowed.replace(/[^0-9]/g, ""))
                       );
      
      if (!isAllowed) {
        console.log(`[WhatsApp] Message from ${from} blocked (not in allowlist)`);
        return;
      }
    }

    const channelMessage: ChannelMessage = {
      id: message.key.id || `${Date.now()}`,
      channelId: this.id,
      from: from,
      content: messageText,
      timestamp: message.messageTimestamp ? message.messageTimestamp * 1000 : Date.now(),
      metadata: {
        peerId: from,
        peerKind: from.includes("@g.us") ? "group" : "dm",
        messageId: message.key.id,
        isGroup: from.includes("@g.us"),
      },
    };

    // Notify all handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(channelMessage);
      } catch (error) {
        console.error("[WhatsApp] Error in message handler:", error);
      }
    }
  }

  private extractMessageText(msg: any): string | null {
    if (msg?.conversation) return msg.conversation;
    if (msg?.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    if (msg?.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg?.videoMessage?.caption) return msg.videoMessage.caption;
    return null;
  }

  private normalizeJid(jid: string): string {
    if (jid.includes("@")) {
      return jid;
    }
    if (jid.includes("-")) {
      return `${jid}@g.us`;
    }
    return `${jid.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  }

  private extractPhoneNumber(jid: string): string {
    return jid.split("@")[0];
  }

  getQrCode(): string | null {
    return null;
  }

  isConnected(): boolean {
    return this.state === ChannelState.CONNECTED && this.socket !== null;
  }
}
