import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { startGatewayServer } from "@world/communication/gateway/server/index.js";

describe("Gateway Connection", () => {
  let server: Awaited<ReturnType<typeof startGatewayServer>>;
  const port = 18790; // Use different port for tests

  beforeAll(async () => {
    server = await startGatewayServer({ port, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await server.close();
  });

  it("should connect and receive challenge event", async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      let challengeReceived = false;

      ws.on("open", () => {
        // Wait for challenge event
        setTimeout(() => {
          if (!challengeReceived) {
            reject(new Error("Challenge event not received"));
          } else {
            ws.close();
            resolve();
          }
        }, 1000);
      });

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === "event" && message.event === "connect.challenge") {
          challengeReceived = true;
          expect(message.payload).toHaveProperty("nonce");
          expect(message.payload).toHaveProperty("ts");
        }
      });

      ws.on("error", reject);
    });
  });

  it("should handle ping request", async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const requestId = "test-ping-1";

      ws.on("open", () => {
        ws.send(JSON.stringify({
          id: requestId,
          method: "ping",
        }));
      });

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.id === requestId) {
          expect(message.ok).toBe(true);
          expect(message.result).toHaveProperty("pong");
          ws.close();
          resolve();
        }
      });

      ws.on("error", reject);

      setTimeout(() => {
        ws.close();
        reject(new Error("Timeout waiting for ping response"));
      }, 5000);
    });
  });

  it("should handle health request", async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const requestId = "test-health-1";

      ws.on("open", () => {
        ws.send(JSON.stringify({
          id: requestId,
          method: "health",
        }));
      });

      ws.on("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.id === requestId) {
          expect(message.ok).toBe(true);
          expect(message.result).toHaveProperty("ts");
          expect(message.result).toHaveProperty("uptime");
          expect(message.result).toHaveProperty("version");
          expect(message.result).toHaveProperty("status");
          ws.close();
          resolve();
        }
      });

      ws.on("error", reject);

      setTimeout(() => {
        ws.close();
        reject(new Error("Timeout waiting for health response"));
      }, 5000);
    });
  });
});
