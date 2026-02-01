import WebSocket from "ws";

export class TestWebSocketClient {
  private ws: WebSocket;
  private messageQueue: Array<{ resolve: (value: any) => void; reject: (error: Error) => void }> = [];
  private eventHandlers: Map<string, Array<(data: any) => void>> = new Map();

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.setupMessageHandler();
  }

  private setupMessageHandler() {
    this.ws.on("message", (data) => {
      const message = JSON.parse(data.toString());
      
      // Handle events
      if (message.type === "event") {
        const handlers = this.eventHandlers.get(message.event) || [];
        handlers.forEach((handler) => handler(message.payload));
        return;
      }

      // Handle responses
      if (this.messageQueue.length > 0) {
        const { resolve } = this.messageQueue.shift()!;
        resolve(message);
      }
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.on("open", () => resolve());
      this.ws.on("error", reject);
    });
  }

  send(method: string, params?: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = `test-${Date.now()}-${Math.random()}`;
      
      this.messageQueue.push({ resolve, reject });

      this.ws.send(JSON.stringify({ id, method, params }));

      setTimeout(() => {
        const index = this.messageQueue.findIndex((q) => q.resolve === resolve);
        if (index !== -1) {
          this.messageQueue.splice(index, 1);
          reject(new Error(`Timeout waiting for ${method} response`));
        }
      }, 5000);
    });
  }

  on(event: string, handler: (data: any) => void) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  close() {
    this.ws.close();
  }
}
