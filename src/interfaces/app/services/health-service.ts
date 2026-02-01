import type { GatewayClient } from "../infrastructure/gateway/client";

export interface HealthStatus {
  status: string;
  uptime: number;
  version: string;
}

/**
 * Health service - handles health checks and status
 */
export class HealthService {
  constructor(private client: GatewayClient) {}

  async checkHealth(): Promise<HealthStatus | null> {
    try {
      const response = await this.client.request("health");
      if (response.ok && response.result) {
        return response.result as HealthStatus;
      }
      return null;
    } catch (error) {
      console.error("Failed to get health:", error);
      return null;
    }
  }

  formatUptime(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  }
}
