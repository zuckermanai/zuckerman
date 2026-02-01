import WebSocket from "ws";
import { randomUUID } from "node:crypto";
export class GatewayClient {
    ws = null;
    url;
    pendingRequests = new Map();
    eventHandlers = new Map();
    constructor(options = {}) {
        const port = options.port ?? 18789;
        const host = options.host ?? "127.0.0.1";
        this.url = options.url ?? `ws://${host}:${port}`;
    }
    async connect() {
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
            ws.on("message", (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    if ("type" in message && message.type === "event") {
                        const eventData = message;
                        // Handle connect.challenge event
                        if (eventData.event === "connect.challenge") {
                            console.debug("Received connect.challenge");
                        }
                        this.handleEvent(eventData);
                    }
                    else if ("type" in message && message.type === "res") {
                        this.handleResponse(message);
                    }
                    else {
                        // Fallback for responses without type field (backward compatibility)
                        this.handleResponse(message);
                    }
                }
                catch (err) {
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
    async call(options) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            await this.connect();
        }
        const id = randomUUID();
        const request = {
            type: "req",
            id,
            method: options.method,
            params: options.params,
        };
        return new Promise((resolve, reject) => {
            // No timeout - let requests complete naturally
            // Only set timeout if explicitly provided and > 0
            const timeoutId = options.timeout && options.timeout > 0
                ? setTimeout(() => {
                    this.pendingRequests.delete(id);
                    reject(new Error(`Request timeout after ${options.timeout}ms`));
                }, options.timeout)
                : undefined;
            this.pendingRequests.set(id, {
                resolve: (response) => {
                    if (timeoutId)
                        clearTimeout(timeoutId);
                    resolve(response);
                },
                reject: (error) => {
                    if (timeoutId)
                        clearTimeout(timeoutId);
                    reject(error);
                },
                timeout: timeoutId,
            });
            try {
                this.ws.send(JSON.stringify(request));
            }
            catch (err) {
                this.pendingRequests.delete(id);
                if (timeoutId)
                    clearTimeout(timeoutId);
                reject(err instanceof Error ? err : new Error("Failed to send request"));
            }
        });
    }
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
        // Return unsubscribe function
        return () => {
            this.eventHandlers.get(event)?.delete(handler);
        };
    }
    handleResponse(response) {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
            this.pendingRequests.delete(response.id);
            pending.resolve(response);
        }
        else {
            console.warn("Received response for unknown request:", response.id);
        }
    }
    handleEvent(event) {
        const handlers = this.eventHandlers.get(event.event);
        if (handlers) {
            handlers.forEach((handler) => {
                try {
                    handler(event.payload);
                }
                catch (err) {
                    console.error(`Error in event handler for ${event.event}:`, err);
                }
            });
        }
    }
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.pendingRequests.clear();
        this.eventHandlers.clear();
    }
    isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }
}
//# sourceMappingURL=gateway-client.js.map