import type { GatewayClient } from "../core/gateway/client";
import type { GatewayResponse } from "../core/gateway/types";

/**
 * Gateway service - wraps GatewayClient with typed methods
 */
export class GatewayService {
  constructor(private client: GatewayClient) {}

  async request(method: string, params?: Record<string, unknown>): Promise<GatewayResponse> {
    return this.client.request(method, params);
  }

  isConnected(): boolean {
    return this.client.isConnected();
  }
}
