import { useState, useEffect, useCallback } from "react";
import type { GatewayClient } from "../infrastructure/gateway/client";
import type { Session, SessionType } from "../infrastructure/types/session";
import { SessionService } from "../services/session-service";

export interface UseSessionsReturn {
  sessions: Session[];
  currentSessionId: string | null;
  setCurrentSessionId: (sessionId: string | null) => void;
  createSession: (type: SessionType, agentId: string, label?: string) => Promise<Session>;
  loadSessions: () => Promise<void>;
}

/**
 * Hook for managing sessions
 */
export function useSessions(
  gatewayClient: GatewayClient | null,
  currentAgentId: string | null
): UseSessionsReturn {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const createSession = useCallback(
    async (type: SessionType, agentId: string, label?: string): Promise<Session> => {
      if (!gatewayClient?.isConnected()) {
        throw new Error("Gateway not connected");
      }

      const service = new SessionService(gatewayClient);
      const newSession = await service.createSession(type, agentId, label);
      setSessions((prev) => [...prev, newSession]);
      setCurrentSessionId(newSession.id);
      return newSession;
    },
    [gatewayClient]
  );

  const loadSessions = useCallback(async () => {
    if (!gatewayClient?.isConnected()) {
      return;
    }

    try {
      const service = new SessionService(gatewayClient);
      const loadedSessions = await service.listSessions();
      setSessions(loadedSessions);

      // Auto-select first session if none selected
      if (loadedSessions.length > 0 && !currentSessionId) {
        setCurrentSessionId(loadedSessions[0].id);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }, [gatewayClient, currentSessionId]);

  useEffect(() => {
    if (gatewayClient?.isConnected() && currentAgentId) {
      loadSessions();
    } else if (gatewayClient?.isConnected() && !currentAgentId && sessions.length === 0) {
      // If no agent selected but connected, still try to load sessions
      loadSessions();
    }
  }, [gatewayClient, currentAgentId, loadSessions, sessions.length]);

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    createSession,
    loadSessions,
  };
}
