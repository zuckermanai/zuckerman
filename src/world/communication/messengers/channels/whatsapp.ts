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
import type { WhatsAppConfig } from "@world/config/types.js";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import pino from "pino";
// qrcode-terminal is CommonJS, needs special handling in ESM
import qrcodeTerminal from "qrcode-terminal";

const AUTH_DIR = join(homedir(), ".zuckerman", "credentials", "whatsapp");

export class WhatsAppChannel implements Channel {
  id: string = "whatsapp";
  type = "whatsapp" as const;
  private socket: WASocket | null = null;
  private config: WhatsAppConfig;
  private messageHandlers: Array<(message: ChannelMessage) => void> = [];
  private isRunning = false;
  private qrCodeCallback?: (qr: string) => void;
  private connectionStatusCallback?: (connected: boolean) => void;

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
    if (this.isRunning) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[WhatsApp] Channel is disabled in config");
      return;
    }

    try {
      // Ensure auth directory exists
      if (!existsSync(AUTH_DIR)) {
        mkdirSync(AUTH_DIR, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();

      const logger = pino({ level: "silent" }); // Set to "info" for debugging

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

      // Handle credentials update
      this.socket!.ev.on("creds.update", async () => {
        await saveCreds();
      });

      // Handle connection updates
      this.socket!.ev.on("connection.update", (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          // QR code for pairing - callback will broadcast to gateway clients
          // Don't print to terminal when running in Electron/gateway mode
          if (this.qrCodeCallback) {
            this.qrCodeCallback(qr);
          } else {
            // Fallback: print to terminal if no callback (CLI mode)
            console.log("\n[WhatsApp] Scan this QR code with WhatsApp:");
            const qrModule = qrcodeTerminal as any;
            if (qrModule.default?.generate) {
              qrModule.default.generate(qr, { small: true });
            } else {
              console.log("QR Code:", qr);
            }
          }
        }

        if (connection === "close") {
          const statusCode = lastDisconnect?.error ? (lastDisconnect.error as any)?.output?.statusCode : undefined;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          if (shouldReconnect) {
            console.log("[WhatsApp] Connection closed, reconnecting...");
            setTimeout(() => this.start(), 3000);
          } else {
            console.log("[WhatsApp] Logged out, please scan QR code again");
            this.isRunning = false;
          }
        } else if (connection === "open") {
          console.log("[WhatsApp] Connected successfully");
          this.isRunning = true;
          if (this.connectionStatusCallback) {
            this.connectionStatusCallback(true);
          }
        }
      });

      // Handle incoming messages
      this.socket!.ev.on("messages.upsert", async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const message of messages) {
          if (!message.key.fromMe && message.message) {
            await this.handleIncomingMessage(message);
          }
        }
      });

      this.isRunning = true;
    } catch (error) {
      console.error("[WhatsApp] Failed to start:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.socket) {
      await this.socket.end(undefined);
      this.socket = null;
    }
    this.isRunning = false;
  }

  async send(message: string, to: string): Promise<void> {
    if (!this.socket || !this.isRunning) {
      throw new Error("WhatsApp channel is not connected");
    }

    // Normalize JID (add @s.whatsapp.net if needed)
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
      return; // Skip non-text messages for now
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
    // Add @s.whatsapp.net for personal, @g.us for groups
    if (jid.includes("-")) {
      return `${jid}@g.us`;
    }
    return `${jid.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
  }

  private extractPhoneNumber(jid: string): string {
    return jid.split("@")[0];
  }

  /**
   * Get QR code for pairing (if available)
   */
  getQrCode(): string | null {
    // QR code is handled in connection.update event
    return null;
  }

  /**
   * Check if channel is connected
   */
  isConnected(): boolean {
    return this.isRunning && this.socket !== null;
  }
}
