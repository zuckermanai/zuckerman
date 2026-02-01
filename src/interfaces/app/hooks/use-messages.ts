import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { GatewayClient } from "../infrastructure/gateway/client";
import type { Message } from "../infrastructure/types/message";
import { MessageService } from "../services/message-service";
import { AgentService } from "../services/agent-service";
import { SessionService } from "../services/session-service";

export interface UseMessagesReturn {
  messages: Message[];
  isSending: boolean;
  sendMessage: (message: string) => Promise<void>;
  loadMessages: () => Promise<void>;
}

/**
 * Hook for managing messages - handles loading, sending, polling, and deduplication
 */
export function useMessages(
  gatewayClient: GatewayClient | null,
  sessionId: string | null,
  agentId: string | null
): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageCountRef = useRef<number>(0);
  const currentSessionIdRef = useRef<string | null>(sessionId);
  const streamingMessageRef = useRef<{ runId: string; content: string } | null>(null);

  // Update ref when sessionId changes
  useEffect(() => {
    currentSessionIdRef.current = sessionId;
  }, [sessionId]);

  // Memoize services
  const messageService = useMemo(
    () => (gatewayClient ? new MessageService(gatewayClient) : null),
    [gatewayClient]
  );
  const agentService = useMemo(
    () => (gatewayClient ? new AgentService(gatewayClient) : null),
    [gatewayClient]
  );
  const sessionService = useMemo(
    () => (gatewayClient ? new SessionService(gatewayClient) : null),
    [gatewayClient]
  );

  /**
   * Load messages from the session
   */
  const loadMessages = useCallback(async () => {
    // Use sessionId prop directly, fallback to ref for backwards compatibility
    const currentSession = sessionId || currentSessionIdRef.current;
    if (!currentSession || !gatewayClient?.isConnected() || !messageService) {
      setMessages([]);
      return;
    }

    try {
      const loadedMessages = await messageService.loadMessages(currentSession);
      const deduplicated = messageService.deduplicateMessages(loadedMessages);
      
      // Best practice: Only update state if messages actually changed to prevent scroll jumps
      setMessages((prev) => {
        // If count changed, definitely update
        if (deduplicated.length !== prev.length) {
          lastMessageCountRef.current = deduplicated.length;
          return deduplicated;
        }
        
        // If count is same, check if content changed (for streaming/polling updates)
        // Compare messages by ID/timestamp to detect actual changes
        if (deduplicated.length > 0 && prev.length > 0) {
          const prevLast = prev[prev.length - 1];
          const newLast = deduplicated[deduplicated.length - 1];
          
          // If last message changed (timestamp or content), update
          if (!prevLast || !newLast || 
              prevLast.timestamp !== newLast.timestamp || 
              prevLast.content !== newLast.content) {
            return deduplicated;
          }
        }
        
        // No changes detected - keep previous state to avoid unnecessary re-renders and scroll jumps
        return prev;
      });
      
      // Update count ref if we actually updated
      if (deduplicated.length !== lastMessageCountRef.current) {
        lastMessageCountRef.current = deduplicated.length;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isSessionNotFound = errorMessage.includes("not found") || errorMessage.includes("Session");
      
      if (isSessionNotFound) {
        setMessages([]);
        lastMessageCountRef.current = 0;
      }
      // Silently handle other errors - keep existing messages
    }
  }, [gatewayClient, messageService, sessionId]);

  /**
   * Stop polling for message updates
   */
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  /**
   * Start polling for message updates
   */
  const startPolling = useCallback(() => {
    if (pollingRef.current) return; // Already polling

    pollingRef.current = setInterval(async () => {
      const currentSession = currentSessionIdRef.current;
      if (!currentSession || !gatewayClient?.isConnected() || !sessionService) {
        return;
      }

      // Don't poll during sending - sendMessage handles its own polling
      // Also don't poll if streaming is active (streaming events handle updates)
      if (isSending || streamingMessageRef.current) {
        return;
      }

      try {
        const sessionState = await sessionService.getSession(currentSession);
        const currentCount = sessionState.messages?.length || 0;
        
        // Best practice: Only reload if count changed (new messages added)
        // This prevents unnecessary updates that cause scroll jumps
        if (currentCount !== lastMessageCountRef.current) {
          await loadMessages();
        }
        // If count is same, skip reload to preserve scroll position
      } catch (error) {
        // Silently handle polling errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isSessionNotFound = errorMessage.includes("not found") || errorMessage.includes("Session");
        
        if (isSessionNotFound) {
          stopPolling();
          setMessages([]);
          lastMessageCountRef.current = 0;
        }
      }
    }, 5000); // Poll every 5 seconds when not sending (reduced frequency)
  }, [gatewayClient, sessionService, loadMessages, isSending, stopPolling]);

  // Load messages when session changes (but not if we're currently sending)
  useEffect(() => {
    if (!isSending && sessionId) {
      // Clear messages immediately when session changes to avoid showing stale data
      setMessages([]);
      loadMessages();
    } else if (!sessionId) {
      // Clear messages if no session selected
      setMessages([]);
    }
  }, [sessionId, loadMessages, isSending]);

  // Set up streaming event listener
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
        response?: string;
        tokensUsed?: number;
        toolsUsed?: string[];
      };

      // Only handle events for current session
      if (payload.sessionId !== currentSessionIdRef.current) return;

      if (eventType === "token" && payload.token) {
        const token = payload.token;
        // Update streaming message with new token
        setMessages((prev) => {
          const newMessages = [...prev];
          // Find or create the streaming assistant message
          let streamingIndex = newMessages.findIndex(
            (msg) => msg.role === "assistant" && (msg as any).streamingRunId === payload.runId
          );
          
          if (streamingIndex === -1) {
            // Remove thinking indicator and add new assistant message
            const thinkingIndex = newMessages.findIndex((msg) => msg.role === "thinking");
            if (thinkingIndex !== -1) {
              newMessages.splice(thinkingIndex, 1);
            }
            
            const runId = payload.runId || `stream-${Date.now()}`;
            // Initialize ref with first token
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
            // Update existing streaming message
            const existingMessage = newMessages[streamingIndex];
            const currentContent = existingMessage.content || "";
            
            // Ensure ref is initialized and matches current message content
            if (!streamingMessageRef.current || streamingMessageRef.current.runId !== payload.runId) {
              streamingMessageRef.current = {
                runId: payload.runId || `stream-${Date.now()}`,
                content: currentContent,
              };
            }
            
            // Append new token to ref
            streamingMessageRef.current.content += token;
            
            // Update message with ref content (single source of truth)
            newMessages[streamingIndex] = {
              ...existingMessage,
              content: streamingMessageRef.current.content,
            };
          }
          return newMessages;
        });
      } else if (eventType === "tool.call" && payload.tool) {
        // Add tool call indicator
        setMessages((prev) => {
          const newMessages = [...prev];
          // Remove thinking indicator if present
          const thinkingIndex = newMessages.findIndex((msg) => msg.role === "thinking");
          if (thinkingIndex !== -1) {
            newMessages.splice(thinkingIndex, 1);
          }
          // Add tool call message
          newMessages.push({
            role: "assistant",
            content: `🔧 Calling tool: ${payload.tool}${payload.toolArgs ? ` with args: ${JSON.stringify(payload.toolArgs)}` : ""}`,
            timestamp: Date.now(),
          });
          return newMessages;
        });
      } else if (eventType === "tool.result" && payload.tool) {
        // Update tool result
        setMessages((prev) => {
          const newMessages = [...prev];
          // Find the last tool call message and update it
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
        // Finalize the message
        streamingMessageRef.current = null;
        setIsSending(false);
        // Reload messages to get the final state
        loadMessages();
      }
    };

    // Add event listener
    const removeListener = gatewayClient.addEventListener(handleStreamEvent);

    return () => {
      removeListener();
    };
  }, [gatewayClient, loadMessages]);

  // Manage polling based on connection and session
  useEffect(() => {
    if (gatewayClient?.isConnected() && sessionId) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [gatewayClient, sessionId, startPolling, stopPolling]);

  /**
   * Send a message and wait for response
   */
  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!gatewayClient || !messageService || !agentService || !sessionService) {
        throw new Error("Services not initialized");
      }

      if (!gatewayClient.isConnected()) {
        throw new Error("Gateway not connected");
      }

      // Resolve agent ID
      let currentAgentId = agentId;
      if (!currentAgentId) {
        const agents = await agentService.listAgents();
        if (agents.length === 0) {
          throw new Error("No agents available");
        }
        currentAgentId = agents[0];
      }

      // Resolve session ID
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        const newSession = await sessionService.createSession("main", currentAgentId);
        currentSessionId = newSession.id;
        currentSessionIdRef.current = currentSessionId;
      }

      // Set sending state
      setIsSending(true);
      const userMessageTimestamp = Date.now();

      // Optimistically add user message
      const userMessage: Message = {
        role: "user",
        content: messageText,
        timestamp: userMessageTimestamp,
      };
      setMessages((prev) => [...prev, userMessage]);

      // Add thinking indicator
      const thinkingMessage: Message = {
        role: "thinking",
        content: "",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, thinkingMessage]);

      try {
        // Send message to backend
        await messageService.sendMessage(currentSessionId, currentAgentId, messageText);

        // Poll for response (no timeout - wait indefinitely)
        let attempts = 0;
        const maxAttempts = Infinity; // No timeout limit
        const pollInterval = 300; // 300ms

        const checkForResponse = async (): Promise<void> => {
          return new Promise((resolve) => {
            const interval = setInterval(async () => {
              attempts++;

              try {
                // Check connection
                if (!gatewayClient?.isConnected()) {
                  // Don't timeout on connection loss - keep trying
                  return;
                }

                // Load messages
                const loadedMessages = await messageService.loadMessages(currentSessionId);
                const deduplicated = messageService.deduplicateMessages(loadedMessages);

                // Check for assistant response after user message
                const hasResponse = deduplicated.some((msg) => {
                  if (msg.role !== "assistant") return false;
                  const msgTimestamp = msg.timestamp || 0;
                  return msgTimestamp >= userMessageTimestamp - 500; // 500ms buffer
                });

                if (hasResponse) {
                  // Update messages (replaces thinking indicator)
                  setMessages(deduplicated);
                  lastMessageCountRef.current = deduplicated.length;
                  
                  clearInterval(interval);
                  
                  // Clear sending state after render
                  requestAnimationFrame(() => {
                    setIsSending(false);
                  });
                  
                  resolve();
                }
                // No timeout - keep polling until response arrives
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const isSessionNotFound = errorMessage.includes("not found") || errorMessage.includes("Session");
                
                // Only stop on session not found, not on timeout
                if (isSessionNotFound) {
                  clearInterval(interval);
                  setIsSending(false);
                  setMessages((prev) => prev.filter((msg) => msg.role !== "thinking"));
                  resolve();
                }
                // Otherwise keep polling
              }
            }, pollInterval);
          });
        };

        await checkForResponse();
      } catch (error) {
        // Error sending message
        setIsSending(false);
        setMessages((prev) =>
          prev.filter(
            (msg) =>
              msg.role !== "thinking" &&
              !(msg.role === "user" && msg.content === messageText && Math.abs(msg.timestamp - userMessageTimestamp) < 5000)
          )
        );
        throw error;
      }
    },
    [gatewayClient, messageService, agentService, sessionService, sessionId, agentId, loadMessages]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
      setIsSending(false);
    };
  }, [stopPolling]);

  return {
    messages,
    isSending,
    sendMessage,
    loadMessages,
  };
}
