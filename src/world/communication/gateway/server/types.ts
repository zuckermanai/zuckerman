import type { WebSocket } from "ws";
import type { GatewayRequest, GatewayResponse } from "../protocol/schema.js";

export interface GatewayWsClient {
  id: string;
  socket: WebSocket;
  connectedAt: number;
  lastActivity: number;
}

export interface GatewayRequestContext {
  client: GatewayWsClient;
  request: GatewayRequest;
}

export type GatewayRequestHandler = (
  context: GatewayRequestContext & {
    params?: Record<string, unknown>;
    respond: (
      ok: boolean,
      result?: unknown,
      error?: { code: string; message: string },
      meta?: Record<string, unknown>,
    ) => void;
  },
) => Promise<void> | void;

export interface GatewayRequestHandlers {
  [method: string]: GatewayRequestHandler;
}

export interface GatewayServer {
  close: (reason?: string) => Promise<void>;
  port: number;
}
