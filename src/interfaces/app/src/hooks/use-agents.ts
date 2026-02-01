import { useState, useEffect, useCallback } from "react";
import type { GatewayClient } from "../core/gateway/client";
import { AgentService } from "../core/agent-service";

export interface UseAgentsReturn {
  agents: string[];
  currentAgentId: string | null;
  setCurrentAgentId: (agentId: string | null) => void;
  loadAgents: () => Promise<void>;
}

/**
 * Hook for managing agents
 */
export function useAgents(
  gatewayClient: GatewayClient | null
): UseAgentsReturn {
  const [agents, setAgents] = useState<string[]>([]);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    if (!gatewayClient?.isConnected()) {
      return;
    }

    try {
      const service = new AgentService(gatewayClient);
      const loadedAgents = await service.listAgents();
      setAgents(loadedAgents);

      // Auto-select first agent if none selected or current selection is invalid
      if (loadedAgents.length > 0) {
        if (!currentAgentId || !loadedAgents.includes(currentAgentId)) {
          setCurrentAgentId(loadedAgents[0]);
        }
      }
    } catch (error) {
      console.error("Failed to load agents:", error);
    }
  }, [gatewayClient, currentAgentId]);

  useEffect(() => {
    if (gatewayClient?.isConnected()) {
      loadAgents();
    }
  }, [gatewayClient, loadAgents]);

  return {
    agents,
    currentAgentId,
    setCurrentAgentId,
    loadAgents,
  };
}
