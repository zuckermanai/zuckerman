import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import type { GatewayWsClient, GatewayRequestHandlers } from "./types.js";
import { GatewayRequest, GatewayResponse, GatewayEvent } from "../protocol/schema.js";
import { Value } from "@sinclair/typebox/value";

export function handleConnection(
  socket: WebSocket,
  clients: Set<GatewayWsClient>,
  handlers: GatewayRequestHandlers,
  onConnect: (client: GatewayWsClient) => void,
  onDisconnect: (client: GatewayWsClient) => void,
): GatewayWsClient {
  const clientId = randomUUID();
  const connectedAt = Date.now();

  const client: GatewayWsClient = {
    id: clientId,
    socket,
    connectedAt,
    lastActivity: Date.now(),
  };

  // Check if this socket is already in the clients set (shouldn't happen, but safety check)
  const existingClient = Array.from(clients).find(c => c.socket === socket);
  if (existingClient) {
    console.warn(`[Gateway] Socket already registered, removing old client: ${existingClient.id}`);
    clients.delete(existingClient);
  }

  clients.add(client);
  onConnect(client);
  console.log(`[Gateway] Client connected: ${clientId} (total: ${clients.size})`);

  // Send connection challenge
  const connectNonce = randomUUID();
  sendEvent(socket, {
    type: "event",
    event: "connect.challenge",
    payload: { nonce: connectNonce, ts: Date.now() },
  });

  socket.on("message", (data: Buffer) => {
    client.lastActivity = Date.now();
    try {
      const message = JSON.parse(data.toString());
      handleMessage(client, message, handlers);
    } catch (err) {
      sendResponse(socket, {
        id: randomUUID(),
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: err instanceof Error ? err.message : "Invalid JSON",
        },
      });
    }
  });

  socket.on("close", (code, reason) => {
    const wasRemoved = clients.delete(client);
    if (wasRemoved) {
      onDisconnect(client);
      console.log(`[Gateway] Client disconnected: ${clientId} (code: ${code}, reason: ${reason?.toString() || "none"}, total: ${clients.size})`);
    }
  });

  socket.on("error", (err) => {
    console.error(`WebSocket error for client ${clientId}:`, err);
  });

  return client;
}

function handleMessage(
  client: GatewayWsClient,
  message: unknown,
  handlers: GatewayRequestHandlers,
): void {
  // Validate request schema
  if (!Value.Check(GatewayRequest, message)) {
    sendResponse(client.socket, {
      id: randomUUID(),
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Request does not match schema",
      },
    });
    return;
  }

  const request = message as GatewayRequest;
  const handler = handlers[request.method];

  if (!handler) {
    sendResponse(client.socket, {
      id: request.id,
      ok: false,
      error: {
        code: "METHOD_NOT_FOUND",
        message: `Unknown method: ${request.method}`,
      },
    });
    return;
  }

  // Call handler
  const respond = (
    ok: boolean,
    result?: unknown,
    error?: { code: string; message: string },
    meta?: Record<string, unknown>,
  ) => {
    sendResponse(client.socket, {
      id: request.id,
      ok,
      result,
      error,
    });
  };

  try {
    const context = {
      client,
      request,
      params: request.params,
      respond,
    };
    void Promise.resolve(handler(context)).catch((err) => {
      respond(false, undefined, {
        code: "HANDLER_ERROR",
        message: err instanceof Error ? err.message : "Handler error",
      });
    });
  } catch (err) {
    respond(false, undefined, {
      code: "HANDLER_ERROR",
      message: err instanceof Error ? err.message : "Handler error",
    });
  }
}

function sendResponse(socket: WebSocket, response: Omit<GatewayResponse, "type">): void {
  try {
    const fullResponse: GatewayResponse = {
      type: "res",
      ...response,
    };
    socket.send(JSON.stringify(fullResponse));
  } catch (err) {
    console.error("Failed to send response:", err);
  }
}

function sendEvent(socket: WebSocket, event: GatewayEvent): void {
  try {
    socket.send(JSON.stringify(event));
  } catch (err) {
    console.error("Failed to send event:", err);
  }
}
