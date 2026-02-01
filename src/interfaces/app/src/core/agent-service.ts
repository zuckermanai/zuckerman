import type { GatewayClient } from "../core/gateway/client";

/**
 * Agent service - handles agent-related operations
 */
export class AgentService {
  constructor(private client: GatewayClient) {}

  async listAgents(): Promise<string[]> {
    const response = await this.client.request("agents.list");
    if (!response.ok || !response.result) {
      throw new Error(response.error?.message || "Failed to list agents");
    }

    const result = response.result as { agents?: string[] };
    return result.agents || [];
  }

  async runAgent(
    sessionId: string,
    agentId: string,
    message: string
  ): Promise<unknown> {
    const response = await this.client.request("agent.run", {
      sessionId,
      agentId,
      message,
    });

    if (!response.ok || !response.result) {
      throw new Error(response.error?.message || "Failed to run agent");
    }

    return response.result;
  }
}
