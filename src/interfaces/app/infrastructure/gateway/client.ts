import type { GatewayRequest, GatewayResponse, GatewayEvent, GatewayClientOptions } from "./types";

export class GatewayClient {
  private ws: WebSocket | null = null;
  private host: string;
  private port: number;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private pendingRequests = new Map<string, {
    resolve: (response: GatewayResponse) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private options: GatewayClientOptions;

  constructor(options: GatewayClientOptions = {}) {
    this.host = options.host || "127.0.0.1";
    this.port = options.port || 18789;
    this.options = options;
  }

  connect(): Promise<void> {
    // If already connected, resolve immediately
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    // If connecting, wait for it
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            clearInterval(checkInterval);
            resolve();
          } else if (this.ws?.readyState === WebSocket.CLOSED) {
            clearInterval(checkInterval);
            reject(new Error("Connection closed"));
          }
        }, 100);
        
        setTimeout(() => {
          clearInterval(checkInterval);
          reject(new Error("Connection timeout"));
        }, 5000);
      });
    }

    // Close existing connection if any
    if (this.ws) {
      try {
        this.ws.close();
      } catch (err) {
        // Ignore errors when closing
      }
      this.ws = null;
    }

    return new Promise((resolve, reject) => {
      try {
        const url = `ws://${this.host}:${this.port}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.options.onConnect?.();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data as string) as GatewayResponse | GatewayEvent;

            if ("type" in data && data.type === "event") {
              const eventData = data as GatewayEvent;
              // Handle connect.challenge event - we can ignore it for now
              // or send a connect request if needed
              if (eventData.event === "connect.challenge") {
                // For now, we'll just acknowledge the challenge
                // In a full implementation, we'd send a connect request here
                console.debug("Received connect.challenge");
              }
              this.options.onEvent?.(eventData);
            } else if ("type" in data && data.type === "res") {
              const response = data as GatewayResponse;
              const pending = this.pendingRequests.get(response.id);
              if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(response.id);
                if (response.ok) {
                  pending.resolve(response);
                } else {
                  pending.reject(new Error(response.error?.message || "Request failed"));
                }
              } else {
                console.warn("Received response for unknown request:", response.id);
              }
            } else {
              // Fallback for responses without type field (backward compatibility)
              const response = data as GatewayResponse;
              const pending = this.pendingRequests.get(response.id);
              if (pending) {
                clearTimeout(pending.timeout);
                this.pendingRequests.delete(response.id);
                if (response.ok) {
                  pending.resolve(response);
                } else {
                  pending.reject(new Error(response.error?.message || "Request failed"));
                }
              }
            }
          } catch (err) {
            console.error("Failed to parse message:", err);
          }
        };

        this.ws.onerror = (error) => {
          const errorObj = error instanceof Error ? error : new Error("WebSocket error");
          this.options.onError?.(errorObj);
          reject(errorObj);
        };

        this.ws.onclose = () => {
          this.options.onDisconnect?.();
          this.attemptReconnect();
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnect attempts reached");
      // Don't auto-reconnect after max attempts - let user manually retry
      return;
    }

    this.reconnectAttempts++;
    setTimeout(() => {
      console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
      this.connect().catch((err) => {
        // Silently handle errors during reconnection attempts
        // The UI will show the connection error state
        console.debug("Reconnection attempt failed:", err);
      });
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  async request(method: string, params?: Record<string, unknown>): Promise<GatewayResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const request: GatewayRequest = {
        type: "req",
        id,
        method,
        params,
      };

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error("Request timeout"));
      }, 30000); // 30 second timeout

      this.pendingRequests.set(id, {
        resolve: (response) => resolve(response),
        reject,
        timeout,
      });

      try {
        this.ws!.send(JSON.stringify(request));
      } catch (err) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error("Failed to send request"));
      }
    });
  }

  disconnect(): void {
    // Cancel all pending requests
    this.pendingRequests.forEach(({ timeout, reject }) => {
      clearTimeout(timeout);
      reject(new Error("Connection closed"));
    });
    this.pendingRequests.clear();

    // Close WebSocket connection
    if (this.ws) {
      try {
        // Remove all event listeners to prevent memory leaks
        this.ws.onopen = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        
        // Close the connection
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close(1000, "Client disconnect");
        }
      } catch (err) {
        // Ignore errors when closing
        console.debug("Error closing WebSocket:", err);
      }
      this.ws = null;
    }

    // Reset reconnect attempts
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
