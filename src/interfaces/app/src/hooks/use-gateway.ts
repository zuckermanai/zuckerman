import { useState, useEffect, useRef, useCallback } from "react";
import { GatewayClient } from "../core/gateway/client";
import { setGatewaySettings } from "../core/storage/settings-storage";
import { GatewayClientFactory } from "../core/gateway/gateway-client-factory";
import { GatewayEventHandlers } from "../core/gateway/gateway-event-handlers";

export type ConnectionStatus = "connected" | "disconnected" | "connecting";

export interface UseGatewayReturn {
  gatewayClient: GatewayClient | null;
  connectionStatus: ConnectionStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
  updateConfig: (host: string, port: number) => Promise<void>;
}

/**
 * Hook for managing gateway connection
 */
export function useGateway(): UseGatewayReturn {
  const [gatewayClient, setGatewayClient] = useState<GatewayClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const connectingRef = useRef(false);

  // Initialize gateway client from settings
  useEffect(() => {
    const eventHandlers = GatewayEventHandlers.createStateHandlers({
      onConnect: () => {
        setConnectionStatus("connected");
      },
      onDisconnect: () => {
        setConnectionStatus("disconnected");
      },
      onError: (error) => {
        console.error("Gateway error:", error);
      },
    });

    const client = GatewayClientFactory.createWithStateHandlers(eventHandlers);

    setGatewayClient(client);

    return () => {
      client.disconnect();
    };
  }, []);

  const connect = useCallback(async () => {
    if (!gatewayClient || gatewayClient.isConnected() || connectingRef.current) {
      return;
    }

    connectingRef.current = true;
    setConnectionStatus("connecting");
    try {
      await gatewayClient.connect();
    } catch (error) {
      console.error("Failed to connect:", error);
      setConnectionStatus("disconnected");
    } finally {
      connectingRef.current = false;
    }
  }, [gatewayClient]);

  const disconnect = useCallback(() => {
    if (gatewayClient) {
      gatewayClient.disconnect();
      setConnectionStatus("disconnected");
    }
  }, [gatewayClient]);

  const updateConfig = useCallback(async (host: string, port: number) => {
    // Save new config
    setGatewaySettings({ host, port });

    // Disconnect current client
    if (gatewayClient) {
      gatewayClient.disconnect();
    }

    // Create new client with new config
    const eventHandlers = GatewayEventHandlers.createStateHandlers({
      onConnect: () => {
        setConnectionStatus("connected");
      },
      onDisconnect: () => {
        setConnectionStatus("disconnected");
      },
      onError: (error) => {
        console.error("Gateway error:", error);
      },
    });

    const newClient = GatewayClientFactory.create({
      host,
      port,
      ...eventHandlers,
    });

    setGatewayClient(newClient);

    // Attempt to connect with new config
    setConnectionStatus("connecting");
    try {
      await newClient.connect();
    } catch (error) {
      console.error("Failed to connect:", error);
      setConnectionStatus("disconnected");
    }
  }, [gatewayClient]);

  return {
    gatewayClient,
    connectionStatus,
    connect,
    disconnect,
    updateConfig,
  };
}
