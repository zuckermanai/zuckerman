import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import type { GatewayRequest, GatewayResponse, GatewayEvent } from "@world/communication/gateway/protocol/schema.js";

export interface GatewayClientOptions {
  host?: string;
  port?: number;
  url?: string;
}

export interface GatewayCallOptions {
  method: string;
  params?: Record<string, unknown>;
  timeout?: number;
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private pendingRequests = new Map<string, {
    resolve: (response: GatewayResponse) => void;
    reject: (error: Error) => void;
    timeout?: NodeJS.Timeout;
  }>();
  private eventHandlers = new Map<string, Set<(payload: unknown) => void>>();

  constructor(options: GatewayClientOptions = {}) {
    const port = options.port ?? 18789;
    const host = options.host ?? "127.0.0.1";
    this.url = options.url ?? `ws://${host}:${port}`;
  }

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);

      ws.on("open", () => {
        this.ws = ws;
        resolve();
      });

      ws.on("error", (err) => {
        reject(new Error(`Failed to connect to gateway at ${this.url}: ${err.message}`));
      });

      ws.on("message", (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString()) as GatewayResponse | GatewayEvent;

          if ("type" in message && message.type === "event") {
            const eventData = message as GatewayEvent;
            // Handle connect.challenge event
            if (eventData.event === "connect.challenge") {
              console.debug("Received connect.challenge");
            }
            this.handleEvent(eventData);
          } else if ("type" in message && message.type === "res") {
            this.handleResponse(message as GatewayResponse);
          } else {
            // Fallback for responses without type field (backward compatibility)
            this.handleResponse(message as GatewayResponse);
          }
        } catch (err) {
          console.error("Failed to parse message:", err);
        }
      });

      ws.on("close", () => {
        this.ws = null;
        // Reject all pending requests
        for (const [id, { reject }] of this.pendingRequests) {
          reject(new Error("Connection closed"));
        }
        this.pendingRequests.clear();
      });
    });
  }

  async call(options: GatewayCallOptions): Promise<GatewayResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }

    const id = randomUUID();
    const request: GatewayRequest = {
      type: "req",
      id,
      method: options.method,
      params: options.params,
    };

    return new Promise((resolve, reject) => {
      const timeout = options.timeout ?? 30000;
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (response) => {
          clearTimeout(timeoutId);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        timeout: timeoutId,
      });

      try {
        this.ws!.send(JSON.stringify(request));
      } catch (err) {
        this.pendingRequests.delete(id);
        clearTimeout(timeoutId);
        reject(err instanceof Error ? err : new Error("Failed to send request"));
      }
    });
  }

  on(event: string, handler: (payload: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  private handleResponse(response: GatewayResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      this.pendingRequests.delete(response.id);
      pending.resolve(response);
    } else {
      console.warn("Received response for unknown request:", response.id);
    }
  }

  private handleEvent(event: GatewayEvent): void {
    const handlers = this.eventHandlers.get(event.event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event.payload);
        } catch (err) {
          console.error(`Error in event handler for ${event.event}:`, err);
        }
      });
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingRequests.clear();
    this.eventHandlers.clear();
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
