import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { GatewayClient } from "../core/gateway/client";
import type { Session, SessionType } from "../types/session";
import type { Message } from "../types/message";
import { SessionService } from "../core/sessions/session-service";
import { MessageService } from "../core/messages/message-service";
import { AgentService } from "../core/agents/agent-service";
import { getStorageItem, setStorageItem } from "../core/storage/local-storage";

const ACTIVE_SESSIONS_STORAGE_KEY = "zuckerman:active-sessions";

export interface UseChatReturn {
  // Sessions
  sessions: Session[];
  currentSessionId: string | null;
  setCurrentSessionId: (sessionId: string | null) => void;
  createSession: (type: SessionType, agentId: string, label?: string) => Promise<Session>;
  loadSessions: () => Promise<void>;

  // Active sessions (UI state)
  activeSessionIds: Set<string>;
  addToActiveSessions: (sessionId: string) => void;
  removeFromActiveSessions: (sessionId: string) => void;

  // Messages
  messages: Message[];
  isSending: boolean;
  sendMessage: (message: string) => Promise<void>;
  loadMessages: () => Promise<void>;
}

/**
 * Consolidated hook for chat feature:
 * - Session management
 * - Active sessions UI state
 * - Message loading and sending
 */
export function useChat(
  gatewayClient: GatewayClient | null,
  currentAgentId: string | null,
  agentId: string | null
): UseChatReturn {
  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Active sessions state (UI)
  const [activeSessionIds, setActiveSessionIds] = useState<Set<string>>(() => {
    const stored = getStorageItem<string[]>(ACTIVE_SESSIONS_STORAGE_KEY, []);
    if (stored.length > 0) {
      return new Set(stored);
    }
    return currentSessionId ? new Set([currentSessionId]) : new Set<string>();
  });

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Refs for messages
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageCountRef = useRef<number>(0);
  const currentSessionIdRef = useRef<string | null>(currentSessionId);
  const streamingMessageRef = useRef<{ runId: string; content: string } | null>(null);

  // Update refs when sessionId changes
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  // Sync currentSessionId with active sessions
  useEffect(() => {
    if (currentSessionId) {
      setActiveSessionIds((prev) => {
        if (prev.has(currentSessionId)) return prev;
        const updated = new Set(prev);
        updated.add(currentSessionId);
        return updated;
      });
    }
  }, [currentSessionId]);

  // Persist active sessions to localStorage
  useEffect(() => {
    setStorageItem(ACTIVE_SESSIONS_STORAGE_KEY, Array.from(activeSessionIds));
  }, [activeSessionIds]);

  // Memoize services
  const sessionService = useMemo(
    () => (gatewayClient ? new SessionService(gatewayClient) : null),
    [gatewayClient]
  );
  const messageService = useMemo(
    () => (gatewayClient ? new MessageService(gatewayClient) : null),
    [gatewayClient]
  );
  const agentService = useMemo(
    () => (gatewayClient ? new AgentService(gatewayClient) : null),
    [gatewayClient]
  );

  // Session management
  const createSession = useCallback(
    async (type: SessionType, agentId: string, label?: string): Promise<Session> => {
      if (!gatewayClient?.isConnected() || !sessionService) {
        throw new Error("Gateway not connected");
      }

      const newSession = await sessionService.createSession(type, agentId, label);
      setSessions((prev) => [...prev, newSession]);
      setCurrentSessionId(newSession.id);
      return newSession;
    },
    [gatewayClient, sessionService]
  );

  const loadSessions = useCallback(async () => {
    if (!gatewayClient?.isConnected() || !sessionService) {
      return;
    }

    try {
      const loadedSessions = await sessionService.listSessions();
      setSessions(loadedSessions);

      if (loadedSessions.length > 0 && !currentSessionId) {
        setCurrentSessionId(loadedSessions[0].id);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }, [gatewayClient, sessionService, currentSessionId]);

  useEffect(() => {
    if (gatewayClient?.isConnected() && currentAgentId) {
      loadSessions();
    } else if (gatewayClient?.isConnected() && !currentAgentId && sessions.length === 0) {
      loadSessions();
    }
  }, [gatewayClient, currentAgentId, loadSessions, sessions.length]);

  // Active sessions management
  const addToActiveSessions = useCallback((sessionId: string) => {
    setActiveSessionIds((prev) => {
      if (prev.has(sessionId)) return prev;
      const updated = new Set(prev);
      updated.add(sessionId);
      return updated;
    });
  }, []);

  const removeFromActiveSessions = useCallback((sessionId: string) => {
    setActiveSessionIds((prev) => {
      if (!prev.has(sessionId)) return prev;
      const updated = new Set(prev);
      updated.delete(sessionId);
      return updated;
    });
  }, []);

  // Message management
  const loadMessages = useCallback(async () => {
    const currentSession = currentSessionId || currentSessionIdRef.current;
    if (!currentSession || !gatewayClient?.isConnected() || !messageService) {
      setMessages([]);
      return;
    }

    try {
      const loadedMessages = await messageService.loadMessages(currentSession);
      const deduplicated = messageService.deduplicateMessages(loadedMessages);

      setMessages((prev) => {
        if (deduplicated.length !== prev.length) {
          lastMessageCountRef.current = deduplicated.length;
          return deduplicated;
        }

        if (deduplicated.length > 0 && prev.length > 0) {
          const prevLast = prev[prev.length - 1];
          const newLast = deduplicated[deduplicated.length - 1];

          if (
            !prevLast ||
            !newLast ||
            prevLast.timestamp !== newLast.timestamp ||
            prevLast.content !== newLast.content
          ) {
            return deduplicated;
          }
        }

        return prev;
      });

      if (deduplicated.length !== lastMessageCountRef.current) {
        lastMessageCountRef.current = deduplicated.length;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isSessionNotFound =
        errorMessage.includes("not found") || errorMessage.includes("Session");

      if (isSessionNotFound) {
        setMessages([]);
        lastMessageCountRef.current = 0;
      }
    }
  }, [gatewayClient, messageService, currentSessionId]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;

    pollingRef.current = setInterval(async () => {
      const currentSession = currentSessionIdRef.current;
      if (!currentSession || !gatewayClient?.isConnected() || !sessionService) {
        return;
      }

      if (isSending || streamingMessageRef.current) {
        return;
      }

      try {
        const sessionState = await sessionService.getSession(currentSession);
        const currentCount = sessionState.messages?.length || 0;

        if (currentCount !== lastMessageCountRef.current) {
          await loadMessages();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isSessionNotFound =
          errorMessage.includes("not found") || errorMessage.includes("Session");

        if (isSessionNotFound) {
          stopPolling();
          setMessages([]);
          lastMessageCountRef.current = 0;
        }
      }
    }, 5000);
  }, [gatewayClient, sessionService, loadMessages, isSending, stopPolling]);

  useEffect(() => {
    if (!isSending && currentSessionId) {
      setMessages([]);
      loadMessages();
    } else if (!currentSessionId) {
      setMessages([]);
    }
  }, [currentSessionId, loadMessages, isSending]);

  // Streaming event listener
  useEffect(() => {
    if (!gatewayClient) return;

    const handleStreamEvent = (event: { event: string; payload?: unknown }) => {
      if (!event.event.startsWith("agent.stream.")) return;

      const eventType = event.event.replace("agent.stream.", "");
      const payload = event.payload as {
        sessionId?: string;
        runId?: string;
        token?: string;
        tool?: string;
        toolArgs?: Record<string, unknown>;
        toolResult?: unknown;
        phase?: "start" | "end" | "error";
        error?: string;
      };

      if (payload.sessionId !== currentSessionIdRef.current) return;

      if (eventType === "lifecycle") {
        if (payload.phase === "start") {
          // Run started - ensure thinking indicator is shown
          // Don't remove it here, let it stay until first token arrives
          setMessages((prev) => {
            const newMessages = [...prev];
            // Check if thinking indicator already exists
            const thinkingIndex = newMessages.findIndex((msg) => msg.role === "thinking");
            if (thinkingIndex === -1) {
              // Add thinking indicator if it doesn't exist
              const thinkingMessage: Message = {
                role: "thinking",
                content: "",
                timestamp: Date.now(),
              };
              newMessages.push(thinkingMessage);
            }
            return newMessages;
          });
        } else if (payload.phase === "end") {
          // Run completed - finalize streaming message
          streamingMessageRef.current = null;
        } else if (payload.phase === "error") {
          // Run error - show error message
          streamingMessageRef.current = null;
          setMessages((prev) => {
            const newMessages = [...prev];
            const streamingIndex = newMessages.findIndex(
              (msg) => msg.role === "assistant" && (msg as any).streamingRunId === payload.runId
            );
            if (streamingIndex !== -1) {
              newMessages[streamingIndex] = {
                ...newMessages[streamingIndex],
                content: `${newMessages[streamingIndex].content}\n\n❌ Error: ${payload.error || "Unknown error"}`,
              };
            }
            return newMessages;
          });
        }
      } else if (eventType === "token" && payload.token) {
        const token = payload.token;
        setMessages((prev) => {
          const newMessages = [...prev];
          let streamingIndex = newMessages.findIndex(
            (msg) => msg.role === "assistant" && (msg as any).streamingRunId === payload.runId
          );

          if (streamingIndex === -1) {
            const thinkingIndex = newMessages.findIndex((msg) => msg.role === "thinking");
            if (thinkingIndex !== -1) {
              newMessages.splice(thinkingIndex, 1);
            }

            const runId = payload.runId || `stream-${Date.now()}`;
            streamingMessageRef.current = {
              runId,
              content: token,
            };
            newMessages.push({
              role: "assistant",
              content: token,
              timestamp: Date.now(),
              streamingRunId: runId,
            } as Message & { streamingRunId?: string });
          } else {
            const existingMessage = newMessages[streamingIndex];
            const currentContent = existingMessage.content || "";

            if (
              !streamingMessageRef.current ||
              streamingMessageRef.current.runId !== payload.runId
            ) {
              streamingMessageRef.current = {
                runId: payload.runId || `stream-${Date.now()}`,
                content: currentContent,
              };
            }

            streamingMessageRef.current.content += token;
            newMessages[streamingIndex] = {
              ...existingMessage,
              content: streamingMessageRef.current.content,
            };
          }
          return newMessages;
        });
      } else if (eventType === "tool.call" && payload.tool) {
        setMessages((prev) => {
          const newMessages = [...prev];
          const thinkingIndex = newMessages.findIndex((msg) => msg.role === "thinking");
          if (thinkingIndex !== -1) {
            newMessages.splice(thinkingIndex, 1);
          }
          newMessages.push({
            role: "assistant",
            content: `🔧 Calling tool: ${payload.tool}${payload.toolArgs ? ` with args: ${JSON.stringify(payload.toolArgs)}` : ""}`,
            timestamp: Date.now(),
          });
          return newMessages;
        });
      } else if (eventType === "tool.result" && payload.tool) {
        setMessages((prev) => {
          const newMessages = [...prev];
          for (let i = newMessages.length - 1; i >= 0; i--) {
            if (newMessages[i].content.includes(`Calling tool: ${payload.tool}`)) {
              const resultStr = payload.toolResult
                ? JSON.stringify(payload.toolResult).substring(0, 200)
                : "completed";
              newMessages[i] = {
                ...newMessages[i],
                content: `🔧 Tool ${payload.tool} result: ${resultStr}`,
              };
              break;
            }
          }
          return newMessages;
        });
      } else if (eventType === "done") {
        streamingMessageRef.current = null;
        setIsSending(false);
        loadMessages();
      }
    };

    const removeListener = gatewayClient.addEventListener(handleStreamEvent);
    return () => {
      removeListener();
    };
  }, [gatewayClient, loadMessages]);

  useEffect(() => {
    if (gatewayClient?.isConnected() && currentSessionId) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [gatewayClient, currentSessionId, startPolling, stopPolling]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!gatewayClient || !messageService || !agentService || !sessionService) {
        throw new Error("Services not initialized");
      }

      if (!gatewayClient.isConnected()) {
        throw new Error("Gateway not connected");
      }

      let currentAgentId = agentId;
      if (!currentAgentId) {
        const agents = await agentService.listAgents();
        if (agents.length === 0) {
          throw new Error("No agents available");
        }
        currentAgentId = agents[0];
      }

      let currentSessionId = currentSessionIdRef.current;
      if (!currentSessionId) {
        const newSession = await sessionService.createSession("main", currentAgentId);
        currentSessionId = newSession.id;
        currentSessionIdRef.current = currentSessionId;
        setCurrentSessionId(currentSessionId);
      }

      setIsSending(true);
      const userMessageTimestamp = Date.now();

      const userMessage: Message = {
        role: "user",
        content: messageText,
        timestamp: userMessageTimestamp,
      };
      setMessages((prev) => [...prev, userMessage]);

      const thinkingMessage: Message = {
        role: "thinking",
        content: "",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, thinkingMessage]);

      try {
        console.log(`[useChat] Sending message with agentId: "${currentAgentId}", sessionId: "${currentSessionId}"`);
        await messageService.sendMessage(currentSessionId, currentAgentId, messageText);

        let attempts = 0;
        const pollInterval = 300;

        const checkForResponse = async (): Promise<void> => {
          return new Promise((resolve) => {
            const interval = setInterval(async () => {
              attempts++;

              try {
                if (!gatewayClient?.isConnected()) {
                  return;
                }

                const loadedMessages = await messageService.loadMessages(currentSessionId);
                const deduplicated = messageService.deduplicateMessages(loadedMessages);

                const hasResponse = deduplicated.some((msg) => {
                  if (msg.role !== "assistant") return false;
                  const msgTimestamp = msg.timestamp || 0;
                  return msgTimestamp >= userMessageTimestamp - 500;
                });

                if (hasResponse) {
                  setMessages(deduplicated);
                  lastMessageCountRef.current = deduplicated.length;
                  clearInterval(interval);
                  requestAnimationFrame(() => {
                    setIsSending(false);
                  });
                  resolve();
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const isSessionNotFound =
                  errorMessage.includes("not found") || errorMessage.includes("Session");

                if (isSessionNotFound) {
                  clearInterval(interval);
                  setIsSending(false);
                  setMessages((prev) => prev.filter((msg) => msg.role !== "thinking"));
                  resolve();
                }
              }
            }, pollInterval);
          });
        };

        await checkForResponse();
      } catch (error) {
        console.error(`[useChat] Error sending message:`, error);
        setIsSending(false);
        setMessages((prev) =>
          prev.filter(
            (msg) =>
              msg.role !== "thinking" &&
              !(
                msg.role === "user" &&
                msg.content === messageText &&
                Math.abs(msg.timestamp - userMessageTimestamp) < 5000
              )
          )
        );
        // Re-throw with more context
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to send message: ${errorMessage}`);
      }
    },
    [gatewayClient, messageService, agentService, sessionService, agentId, loadMessages]
  );

  useEffect(() => {
    return () => {
      stopPolling();
      setIsSending(false);
    };
  }, [stopPolling]);

  return {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    createSession,
    loadSessions,
    activeSessionIds,
    addToActiveSessions,
    removeFromActiveSessions,
    messages,
    isSending,
    sendMessage,
    loadMessages,
  };
}
