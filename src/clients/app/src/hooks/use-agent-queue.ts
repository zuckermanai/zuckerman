import { useState, useEffect, useRef } from "react";
import { GatewayClient } from "../core/gateway/client";
import type { GatewayEvent } from "../core/gateway/types";

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: "immediate" | "strategic" | "scheduled";
  source: "user" | "prospective" | "self-generated";
  priority: number;
  urgency: "low" | "medium" | "high" | "critical";
  status: "pending" | "active" | "completed" | "cancelled" | "failed";
  createdAt: number;
  updatedAt: number;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
  progress?: number;
  result?: unknown;
  error?: string;
  prospectiveMemoryId?: string;
}

export interface TaskQueue {
  pending: Task[];
  active: Task | null;
  completed: Task[];
  strategic: Task[];
}

export interface PlanningStats {
  totalCompleted: number;
  totalFailed: number;
  totalCancelled: number;
  averageCompletionTime: number;
  lastCompletedAt?: number;
}

export interface PlanningState {
  agentId: string;
  queue: TaskQueue;
  currentTask: Task | null;
  lastSwitched: number;
  stats: PlanningStats;
}

/**
 * SWR Pattern Hook: Stale-While-Revalidate
 * - Shows loading only on initial mount when no data exists
 * - All subsequent updates happen silently via events
 * - Background refetches don't trigger loading states
 */
export function useAgentQueue(agentId: string | null, gatewayClient: GatewayClient | null, enabled: boolean = true) {
  const [queueState, setQueueState] = useState<PlanningState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  
  const mountedRef = useRef(true);
  const loadedAgentsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !agentId || !gatewayClient?.isConnected()) {
      return;
    }

    mountedRef.current = true;
    let cleanup: (() => void) | null = null;

    // SWR: Check if we need initial load using functional state update
    let needsInitialLoad = false;
    setQueueState((current) => {
      const hasDataForAgent = current?.agentId === agentId;
      const hasLoadedBefore = loadedAgentsRef.current.has(agentId);
      needsInitialLoad = !hasDataForAgent && !hasLoadedBefore;

      // Reset state when switching to a different agent
      if (current && current.agentId !== agentId) {
        needsInitialLoad = true;
        return null;
      }
      return current;
    });

    if (needsInitialLoad) {
      setLoading(true);
      setError(null);
    }

    const fetchQueue = async () => {
      // Re-check current state to determine if initial load
      let isInitialLoad = false;
      setQueueState((current) => {
        isInitialLoad = !current || current.agentId !== agentId;
        return current;
      });
      
      if (!isInitialLoad) {
        setError(null); // Clear error on background refresh
      }

      try {
        // Start streaming mode
        const response = await gatewayClient.request("agent.queue", {
          agentId,
          stream: true,
        });

        if (!mountedRef.current) return;

        if (response.ok && response.result) {
          const result = response.result as { queue: PlanningState; streaming: boolean };
          setQueueState(result.queue);
          setLastFetchedAt(Date.now());
          loadedAgentsRef.current.add(agentId);
        } else {
          // SWR: Only set error if we don't have existing data (keep showing stale data)
          if (isInitialLoad) {
            setError(response.error?.message || "Failed to fetch queue");
          }
        }
      } catch (err) {
        if (!mountedRef.current) return;
        
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch queue";
        // SWR: Only set error if we don't have existing data (keep showing stale data)
        if (isInitialLoad) {
          setError(errorMessage);
        }
        console.error("[useAgentQueue] Error fetching queue:", err);
      } finally {
        if (isInitialLoad && mountedRef.current) {
          setLoading(false);
        }
      }
    };

    // Set up event listener for queue updates (primary update mechanism)
    const handleEvent = (event: GatewayEvent) => {
      if (event.event === "agent.queue.update") {
        const payload = event.payload as { agentId: string; queue: PlanningState; timestamp: number };
        if (payload.agentId === agentId && mountedRef.current) {
          setQueueState(payload.queue);
          setLastFetchedAt(payload.timestamp || Date.now());
          loadedAgentsRef.current.add(agentId);
          // Clear error when we receive successful updates via events
          setError(null);
        }
      }
    };

    if (gatewayClient) {
      cleanup = gatewayClient.addEventListener(handleEvent);
      fetchQueue();
    }

    return () => {
      mountedRef.current = false;
      if (cleanup) {
        cleanup();
      }
    };
  }, [agentId, gatewayClient, enabled]);

  return {
    queueState,
    loading,
    error,
    lastFetchedAt,
    refetch: async () => {
      if (!agentId || !gatewayClient?.isConnected()) return;
      
      // SWR: Silent background refetch, don't set loading
      setError(null);
      try {
        const response = await gatewayClient.request("agent.queue", { agentId });
        if (response.ok && response.result) {
          const result = response.result as { agentId: string; queue: PlanningState; timestamp: number };
          setQueueState(result.queue);
          setLastFetchedAt(result.timestamp || Date.now());
          loadedAgentsRef.current.add(agentId);
        } else {
          // Only set error if we don't have existing data
          if (!queueState || queueState.agentId !== agentId) {
            setError(response.error?.message || "Failed to fetch queue");
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to fetch queue";
        // Only set error if we don't have existing data
        if (!queueState || queueState.agentId !== agentId) {
          setError(errorMessage);
        }
      }
    },
  };
}
