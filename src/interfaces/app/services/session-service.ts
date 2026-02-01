import type { GatewayClient } from "../infrastructure/gateway/client";
import type { Session, SessionState, SessionType } from "../infrastructure/types/session";

/**
 * Session service - handles all session-related operations
 */
export class SessionService {
  constructor(private client: GatewayClient) {}

  async listSessions(): Promise<Session[]> {
    const response = await this.client.request("sessions.list");
    if (!response.ok || !response.result) {
      throw new Error(response.error?.message || "Failed to list sessions");
    }

    const result = response.result as { sessions?: Array<{
      id: string;
      label: string;
      type: string;
      agentId?: string;
    }> };

    return (result.sessions || []).map((session) => ({
      id: session.id,
      label: session.label || session.id,
      type: (session.type || "main") as SessionType,
      agentId: session.agentId,
    }));
  }

  async getSession(id: string): Promise<SessionState> {
    const response = await this.client.request("sessions.get", { id });
    if (!response.ok || !response.result) {
      throw new Error(response.error?.message || "Failed to get session");
    }

    // Response structure is { session: SessionState }
    const result = response.result as { session: SessionState };
    return result.session;
  }

  async createSession(
    type: SessionType,
    agentId: string,
    label?: string
  ): Promise<Session> {
    const response = await this.client.request("sessions.create", {
      type,
      agentId,
      label: label || `session-${Date.now()}`,
    });

    if (!response.ok || !response.result) {
      throw new Error(response.error?.message || "Failed to create session");
    }

    const result = response.result as {
      session: {
        id: string;
        label: string;
        type: string;
        agentId?: string;
      };
    };

    return {
      id: result.session.id,
      label: result.session.label,
      type: result.session.type as SessionType,
      agentId: result.session.agentId,
    };
  }

  async deleteSession(id: string): Promise<void> {
    const response = await this.client.request("sessions.delete", { id });
    if (!response.ok) {
      throw new Error(response.error?.message || "Failed to delete session");
    }
  }
}
