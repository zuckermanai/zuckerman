import { useState, useEffect, useRef, useCallback } from "react";
import { GatewayClient } from "../infrastructure/gateway/client";
import { getGatewaySettings, setGatewaySettings } from "../infrastructure/storage/settings-storage";

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
    const settings = getGatewaySettings();
    const client = new GatewayClient({
      host: settings.host,
      port: settings.port,
      onConnect: () => {
        setConnectionStatus("connected");
      },
      onDisconnect: () => {
        setConnectionStatus("disconnected");
      },
      onError: (error) => {
        console.error("Gateway error:", error);
      },
      onEvent: (event) => {
        // Handle channel events (e.g., WhatsApp QR codes and connection status)
        if (event.event === "channel.whatsapp.qr" && event.payload) {
          const payload = event.payload as { qr: string; channelId: string };
          window.dispatchEvent(new CustomEvent("whatsapp-qr", { detail: payload }));
        } else if (event.event === "channel.whatsapp.connection" && event.payload) {
          const payload = event.payload as { connected: boolean; channelId: string };
          window.dispatchEvent(new CustomEvent("whatsapp-connection", { detail: payload }));
        }
      },
    });

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
    const newClient = new GatewayClient({
      host,
      port,
      onConnect: () => {
        setConnectionStatus("connected");
      },
      onDisconnect: () => {
        setConnectionStatus("disconnected");
      },
      onError: (error) => {
        console.error("Gateway error:", error);
      },
      onEvent: (event) => {
        if (event.event === "channel.whatsapp.qr" && event.payload) {
          const payload = event.payload as { qr: string; channelId: string };
          window.dispatchEvent(new CustomEvent("whatsapp-qr", { detail: payload }));
        } else if (event.event === "channel.whatsapp.connection" && event.payload) {
          const payload = event.payload as { connected: boolean; channelId: string };
          window.dispatchEvent(new CustomEvent("whatsapp-connection", { detail: payload }));
        }
      },
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
