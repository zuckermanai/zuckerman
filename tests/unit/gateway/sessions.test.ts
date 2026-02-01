import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { startGatewayServer } from "@world/communication/gateway/server/index.js";

describe("Gateway Sessions", () => {
  let server: Awaited<ReturnType<typeof startGatewayServer>>;
  const port = 18791;

  beforeAll(async () => {
    server = await startGatewayServer({ port, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await server.close();
  });

  function createClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
  }

  function sendRequest(ws: WebSocket, method: string, params?: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = `test-${Date.now()}-${Math.random()}`;
      
      ws.once("message", (data) => {
        const message = JSON.parse(data.toString());
        if (message.id === id) {
          resolve(message);
        }
      });

      ws.send(JSON.stringify({ id, method, params }));

      setTimeout(() => {
        reject(new Error(`Timeout waiting for ${method} response`));
      }, 5000);
    });
  }

  it("should create a session", async () => {
    const ws = await createClient();
    const response = await sendRequest(ws, "sessions.create", {
      label: "test-session",
      type: "main",
    });

    expect(response.ok).toBe(true);
    expect(response.result.session).toHaveProperty("id");
    expect(response.result.session.label).toBe("test-session");
    expect(response.result.session.type).toBe("main");
    
    ws.close();
  });

  it("should list sessions", async () => {
    const ws = await createClient();
    
    // Create a session first
    const createResponse = await sendRequest(ws, "sessions.create", {
      label: "list-test",
      type: "main",
    });
    expect(createResponse.ok).toBe(true);

    // List sessions
    const listResponse = await sendRequest(ws, "sessions.list");
    expect(listResponse.ok).toBe(true);
    expect(Array.isArray(listResponse.result.sessions)).toBe(true);
    expect(listResponse.result.sessions.length).toBeGreaterThan(0);
    
    ws.close();
  });

  it("should get a session by id", async () => {
    const ws = await createClient();
    
    // Create a session
    const createResponse = await sendRequest(ws, "sessions.create", {
      label: "get-test",
      type: "main",
    });
    const sessionId = createResponse.result.session.id;

    // Get the session
    const getResponse = await sendRequest(ws, "sessions.get", { id: sessionId });
    expect(getResponse.ok).toBe(true);
    expect(getResponse.result.session.session.id).toBe(sessionId);
    expect(getResponse.result.session).toHaveProperty("messages");
    
    ws.close();
  });

  it("should delete a session", async () => {
    const ws = await createClient();
    
    // Create a session
    const createResponse = await sendRequest(ws, "sessions.create", {
      label: "delete-test",
      type: "main",
    });
    const sessionId = createResponse.result.session.id;

    // Delete the session
    const deleteResponse = await sendRequest(ws, "sessions.delete", { id: sessionId });
    expect(deleteResponse.ok).toBe(true);
    expect(deleteResponse.result.deleted).toBe(true);

    // Verify it's deleted
    const getResponse = await sendRequest(ws, "sessions.get", { id: sessionId });
    expect(getResponse.ok).toBe(false);
    expect(getResponse.error?.code).toBe("NOT_FOUND");
    
    ws.close();
  });
});
