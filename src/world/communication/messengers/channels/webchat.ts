import type { Channel, ChannelMessage } from "./types.js";
import type { WebSocket } from "ws";
import type { WebChatConfig } from "@world/config/types.js";

export class WebChatChannel implements Channel {
  id: string = "webchat";
  type = "webchat" as const;
  private config: WebChatConfig;
  private messageHandlers: Array<(message: ChannelMessage) => void> = [];
  private isRunning = false;
  private clients = new Map<string, WebSocket>();

  constructor(config: WebChatConfig = {}) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[WebChat] Channel is disabled in config");
      return;
    }

    // WebChat doesn't need a separate server - it uses the Gateway WebSocket
    // This channel just handles message routing
    this.isRunning = true;
    console.log("[WebChat] Channel ready (uses Gateway WebSocket)");
  }

  async stop(): Promise<void> {
    // Close all client connections
    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.close();
      } catch (error) {
        console.error(`[WebChat] Error closing client ${clientId}:`, error);
      }
    }
    this.clients.clear();
    this.isRunning = false;
  }

  async send(message: string, to: string): Promise<void> {
    // Find client by ID (to is the client/session ID)
    const client = this.clients.get(to);
    if (!client || client.readyState !== 1) { // 1 = OPEN
      throw new Error(`WebChat client ${to} not found or not connected`);
    }

    try {
      client.send(JSON.stringify({
        type: "message",
        content: message,
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error(`[WebChat] Failed to send message to ${to}:`, error);
      throw error;
    }
  }

  onMessage(handler: (message: ChannelMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Register a WebSocket client for WebChat
   */
  registerClient(clientId: string, socket: WebSocket): void {
    this.clients.set(clientId, socket);

    socket.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "chat" && message.content) {
          const channelMessage: ChannelMessage = {
            id: `${clientId}-${Date.now()}`,
            channelId: this.id,
            from: clientId,
            content: message.content,
            timestamp: message.timestamp || Date.now(),
            metadata: {
              peerId: clientId,
              peerKind: "dm",
              messageId: message.id,
              isGroup: false,
            },
          };

          // Notify all handlers
          for (const handler of this.messageHandlers) {
            try {
              handler(channelMessage);
            } catch (error) {
              console.error("[WebChat] Error in message handler:", error);
            }
          }
        }
      } catch (error) {
        console.error("[WebChat] Error parsing message:", error);
      }
    });

    socket.on("close", () => {
      this.clients.delete(clientId);
    });
  }

  /**
   * Unregister a WebSocket client
   */
  unregisterClient(clientId: string): void {
    this.clients.delete(clientId);
  }

  isConnected(): boolean {
    return this.isRunning;
  }
}
