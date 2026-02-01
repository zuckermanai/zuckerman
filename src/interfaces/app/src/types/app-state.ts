import type { GatewayClient } from "../gateway/client";
import type { Session } from "./session";

export interface AppState {
  currentSessionId: string | null;
  currentAgentId: string | null;
  sessions: Session[];
  agents: string[];
  connectionStatus: "connected" | "disconnected" | "connecting";
  gatewayClient: GatewayClient | null;
}
