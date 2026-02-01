import { useGateway } from "./use-gateway";
import { useAgents } from "./use-agents";
import { useSessions } from "./use-sessions";
import { useEffect, useCallback } from "react";
import type { AppState } from "../infrastructure/types/app-state";

export interface UseAppStateReturn extends AppState {
  // Actions
  setCurrentAgentId: (agentId: string | null) => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  createSession: (type: "main" | "group" | "channel", agentId: string, label?: string) => Promise<void>;
  connect: () => Promise<void>;
  updateGatewayConfig: (host: string, port: number) => Promise<void>;
}

/**
 * Combined hook that manages all app state
 */
export function useAppState(): UseAppStateReturn {
  const { gatewayClient, connectionStatus, connect, updateConfig } = useGateway();
  const { agents, currentAgentId, setCurrentAgentId, loadAgents } = useAgents(gatewayClient);
  const {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    createSession: createSessionInternal,
    loadSessions,
  } = useSessions(gatewayClient, currentAgentId);

  // Auto-connect when gateway client is ready
  useEffect(() => {
    if (gatewayClient && !gatewayClient.isConnected() && connectionStatus === "disconnected") {
      connect();
    }
  }, [gatewayClient, connectionStatus, connect]);

  // Define createSession before using it
  const createSession = useCallback(
    async (
      type: "main" | "group" | "channel",
      agentId: string,
      label?: string
    ): Promise<void> => {
      await createSessionInternal(type, agentId, label);
    },
    [createSessionInternal]
  );

  // Load agents when connected
  useEffect(() => {
    if (gatewayClient?.isConnected()) {
      loadAgents();
    }
  }, [gatewayClient, connectionStatus, loadAgents]);

  // Load sessions when agent is selected
  useEffect(() => {
    if (gatewayClient?.isConnected() && currentAgentId) {
      loadSessions();
      // Create default session if none exist
      if (sessions.length === 0) {
        createSession("main", currentAgentId).catch(console.error);
      }
    }
  }, [gatewayClient, currentAgentId, sessions.length, loadSessions, createSession]);

  return {
    currentSessionId,
    currentAgentId,
    sessions,
    agents,
    connectionStatus,
    gatewayClient,
    setCurrentAgentId,
    setCurrentSessionId,
    createSession,
    connect,
    updateGatewayConfig: updateConfig,
  };
}
