import { GatewayClient } from "../../core/gateway/client";
import { getGatewaySettings } from "../../core/storage/settings-storage";
import type { GatewayClientOptions } from "../../core/gateway/types";

/**
 * Factory for creating GatewayClient instances
 * Single Responsibility: Create and configure GatewayClient
 */
export class GatewayClientFactory {
  /**
   * Create a GatewayClient with default configuration from settings
   */
  static createDefault(): GatewayClient {
    const settings = getGatewaySettings();
    return this.create({
      host: settings.host,
      port: settings.port,
    });
  }

  /**
   * Create a GatewayClient with custom configuration
   */
  static create(options: Partial<GatewayClientOptions>): GatewayClient {
    const settings = getGatewaySettings();
    return new GatewayClient({
      host: options.host ?? settings.host ?? "127.0.0.1",
      port: options.port ?? settings.port ?? 18789,
      onConnect: options.onConnect,
      onDisconnect: options.onDisconnect,
      onError: options.onError,
      onEvent: options.onEvent,
    });
  }

  /**
   * Create a GatewayClient with event handlers for React state management
   */
  static createWithStateHandlers(handlers: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
    onEvent?: (event: any) => void;
  }): GatewayClient {
    const settings = getGatewaySettings();
    return new GatewayClient({
      host: settings.host ?? "127.0.0.1",
      port: settings.port ?? 18789,
      onConnect: handlers.onConnect,
      onDisconnect: handlers.onDisconnect,
      onError: handlers.onError,
      onEvent: handlers.onEvent,
    });
  }
}
