import { getGatewaySettings } from "../../core/storage/settings-storage";

export interface GatewayStartupOptions {
  host?: string;
  port?: number;
  autoStart?: boolean;
}

export interface GatewayStartupResult {
  success: boolean;
  error?: string;
  alreadyRunning?: boolean;
}

/**
 * Service responsible for gateway startup orchestration
 * Single Responsibility: Manage gateway server lifecycle
 */
export class GatewayStartupService {
  constructor(private electronAPI: typeof window.electronAPI) {}

  /**
   * Get gateway configuration from settings
   */
  private getGatewayConfig(): { host: string; port: number; autoStart: boolean } {
    const settings = getGatewaySettings();
    return {
      host: settings.host ?? "127.0.0.1",
      port: settings.port ?? 18789,
      autoStart: settings.autoStart !== false, // Default to true
    };
  }

  /**
   * Check if gateway is running
   */
  async checkGatewayStatus(host: string, port: number): Promise<{ running: boolean; address?: string; error?: string }> {
    if (!this.electronAPI) {
      return { running: false, error: "electronAPI not available" };
    }
    return await this.electronAPI.gatewayStatus(host, port);
  }

  /**
   * Start the gateway server
   */
  async startGateway(host: string, port: number): Promise<GatewayStartupResult> {
    if (!this.electronAPI) {
      return { success: false, error: "electronAPI not available" };
    }

    try {
      const result = await this.electronAPI.gatewayStart(host, port);
      return { success: result.success, error: result.error };
    } catch (error: any) {
      // Handle EADDRINUSE error - port might be in use
      if (error?.message?.includes("EADDRINUSE") || error?.error?.includes("EADDRINUSE")) {
        // Wait a bit and check if gateway is actually running
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const statusAfterError = await this.checkGatewayStatus(host, port);
        if (statusAfterError.running) {
          return { success: true, alreadyRunning: true };
        } else {
          return { success: false, error: `Port ${port} is in use but gateway is not responding` };
        }
      }
      return { success: false, error: error?.message || "Unknown error" };
    }
  }

  /**
   * Wait for gateway to become ready
   */
  async waitForGatewayReady(
    host: string,
    port: number,
    maxAttempts: number = 10,
    delayMs: number = 500
  ): Promise<{ ready: boolean; attempts: number }> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status = await this.checkGatewayStatus(host, port);
      if (status.running) {
        return { ready: true, attempts: attempt };
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return { ready: false, attempts: maxAttempts };
  }

  /**
   * Auto-start gateway if enabled
   */
  async autoStartGateway(options?: GatewayStartupOptions): Promise<GatewayStartupResult> {
    if (!this.electronAPI) {
      return { success: false, error: "electronAPI not available" };
    }

    const config = this.getGatewayConfig();
    const host = options?.host ?? config.host;
    const port = options?.port ?? config.port;
    const autoStart = options?.autoStart ?? config.autoStart;

    if (!autoStart) {
      return { success: true, alreadyRunning: false };
    }

    // Check current status
    const status = await this.checkGatewayStatus(host, port);
    if (status.running) {
      return { success: true, alreadyRunning: true };
    }

    // Start gateway
    const startResult = await this.startGateway(host, port);
    if (!startResult.success) {
      return startResult;
    }

    // Wait for gateway to be ready
    const readyResult = await this.waitForGatewayReady(host, port);
    if (!readyResult.ready) {
      return { success: false, error: "Gateway did not become ready after multiple attempts" };
    }

    return { success: true, alreadyRunning: false };
  }
}
