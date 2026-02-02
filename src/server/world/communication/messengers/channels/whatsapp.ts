import {
  makeWASocket,
  ConnectionState,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type WASocket,
  type AnyMessageContent,
  type Boom,
} from "@whiskeysockets/baileys";
import type { Channel, ChannelMessage } from "./types.js";
import type { WhatsAppConfig } from "@server/world/config/types.js";
import { join } from "node:path";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import pino from "pino";
import qrcodeTerminal from "qrcode-terminal";

const AUTH_DIR = join(homedir(), ".zuckerman", "credentials", "whatsapp");

enum ConnectionStatus {
  DISCONNECTED = "disconnected",
  CONNECTING = "connecting",
  CONNECTED = "connected",
}

export class WhatsAppChannel implements Channel {
  id: string = "whatsapp";
  type = "whatsapp" as const;
  
  private socket: WASocket | null = null;
  private config: WhatsAppConfig;
  private messageHandlers: Array<(message: ChannelMessage) => void> = [];
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private qrCodeCallback?: (qr: string) => void;
  private connectionStatusCallback?: (connected: boolean) => void;
  private saveCreds: (() => Promise<void>) | null = null;
  private isRestarting = false;

  constructor(
    config: WhatsAppConfig,
    qrCallback?: (qr: string) => void,
    connectionStatusCallback?: (connected: boolean) => void,
  ) {
    this.config = config;
    this.qrCodeCallback = qrCallback;
    this.connectionStatusCallback = connectionStatusCallback;
  }

  async start(): Promise<void> {
    if (this.connectionStatus === ConnectionStatus.CONNECTED) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[WhatsApp] Channel is disabled in config");
      return;
    }

    try {
      await this.connect();
    } catch (error) {
      console.error("[WhatsApp] Failed to start:", error);
      this.connectionStatus = ConnectionStatus.DISCONNECTED;
      throw error;
    }
  }

  private async connect(): Promise<void> {
    // Clean up old socket if exists
    if (this.socket) {
      try {
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
    this.saveCreds = saveCreds;
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

    this.setupEventHandlers(saveCreds);
    this.connectionStatus = ConnectionStatus.CONNECTING;
  }

  private setupEventHandlers(saveCreds: () => Promise<void>): void {
    if (!this.socket) return;

    // Handle credentials update - CRITICAL: must save credentials immediately
    this.socket.ev.on("creds.update", async () => {
      try {
        console.log("[WhatsApp] Credentials updated, saving...");
        await saveCreds();
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

    // Handle QR code
    if (qr) {
      this.handleQrCode(qr);
      return;
    }

    // Handle connection state changes
    if (connection === "open") {
      this.handleConnected();
    } else if (connection === "connecting") {
      this.handleConnecting();
    } else if (connection === "close") {
      this.handleDisconnected(lastDisconnect);
    }
  }

  private handleQrCode(qr: string): void {
    if (this.qrCodeCallback) {
      this.qrCodeCallback(qr);
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

  private handleConnected(): void {
    if (this.connectionStatus === ConnectionStatus.CONNECTED) {
      return; // Already connected
    }

    // Ensure credentials are saved before marking as connected
    if (this.saveCreds) {
      this.saveCreds().catch((error) => {
        console.error("[WhatsApp] Failed to save credentials on connect:", error);
      });
    }

    console.log("[WhatsApp] Connected successfully - device should appear in WhatsApp linked devices");
    this.connectionStatus = ConnectionStatus.CONNECTED;
    this.isRestarting = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.connectionStatusCallback) {
      this.connectionStatusCallback(true);
    }
  }

  private handleConnecting(): void {
    if (this.connectionStatus !== ConnectionStatus.CONNECTING) {
      console.log("[WhatsApp] Connecting...");
      this.connectionStatus = ConnectionStatus.CONNECTING;
    }
  }

  private handleDisconnected(lastDisconnect?: ConnectionState["lastDisconnect"]): void {
    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

    // Handle restart required (normal after QR scan)
    // WhatsApp disconnects after QR scan to present auth credentials
    // We MUST create a new socket - the old one is useless
    if (statusCode === DisconnectReason.restartRequired) {
      console.log("[WhatsApp] Restart required after QR scan - creating new socket...");
      this.isRestarting = true;
      this.connectionStatus = ConnectionStatus.DISCONNECTED;
      
      // Ensure credentials are saved before reconnecting
      if (this.saveCreds) {
        this.saveCreds()
          .then(() => {
            console.log("[WhatsApp] Credentials saved, reconnecting with new socket...");
            // Clean up old socket
            if (this.socket) {
              this.socket.end(undefined).catch(() => {});
              this.socket = null;
            }
            
            // Wait a bit longer to ensure credentials are fully persisted
            this.reconnectTimeout = setTimeout(() => {
              this.connect().catch((error) => {
                console.error("[WhatsApp] Reconnection after restart failed:", error);
                this.isRestarting = false;
              });
            }, 5000); // Increased delay to ensure credentials are saved
          })
          .catch((error) => {
            console.error("[WhatsApp] Failed to save credentials before restart:", error);
            // Still try to reconnect
            if (this.socket) {
              this.socket.end(undefined).catch(() => {});
              this.socket = null;
            }
            this.reconnectTimeout = setTimeout(() => {
              this.connect().catch((error) => {
                console.error("[WhatsApp] Reconnection failed:", error);
                this.isRestarting = false;
              });
            }, 5000);
          });
      } else {
        // No saveCreds function, just reconnect
        if (this.socket) {
          this.socket.end(undefined).catch(() => {});
          this.socket = null;
        }
        this.reconnectTimeout = setTimeout(() => {
          this.connect().catch((error) => {
            console.error("[WhatsApp] Reconnection failed:", error);
            this.isRestarting = false;
          });
        }, 5000);
      }
      return;
    }

    // Handle logout
    if (statusCode === DisconnectReason.loggedOut) {
      console.log("[WhatsApp] Logged out, please scan QR code again");
      this.connectionStatus = ConnectionStatus.DISCONNECTED;
      this.clearCredentials();
      
      if (this.connectionStatusCallback) {
        this.connectionStatusCallback(false);
      }
      return;
    }

    // Handle other disconnects (temporary network issues, etc.)
    if (statusCode !== DisconnectReason.connectionClosed) {
      console.log(`[WhatsApp] Connection closed (code: ${statusCode}), reconnecting...`);
      this.connectionStatus = ConnectionStatus.DISCONNECTED;
      this.socket = null;
      
      this.reconnectTimeout = setTimeout(() => {
        this.connect().catch((error) => {
          console.error("[WhatsApp] Reconnection failed:", error);
        });
      }, 5000);
    }
  }

  async stop(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.isRestarting = false;

    if (this.socket) {
      try {
        await this.socket.end(undefined);
      } catch (error) {
        // Ignore errors when stopping
      }
      this.socket = null;
    }

    this.connectionStatus = ConnectionStatus.DISCONNECTED;
    
    if (this.connectionStatusCallback) {
      this.connectionStatusCallback(false);
    }
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
    return this.connectionStatus === ConnectionStatus.CONNECTED && this.socket !== null;
  }
}
