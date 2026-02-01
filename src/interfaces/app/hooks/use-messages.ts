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
    const currentSession = currentSessionIdRef.current;
    if (!currentSession || !gatewayClient?.isConnected() || !messageService) {
      setMessages([]);
      return;
    }

    try {
      const loadedMessages = await messageService.loadMessages(currentSession);
      const deduplicated = messageService.deduplicateMessages(loadedMessages);
      setMessages(deduplicated);
      lastMessageCountRef.current = deduplicated.length;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isSessionNotFound = errorMessage.includes("not found") || errorMessage.includes("Session");
      
      if (isSessionNotFound) {
        setMessages([]);
        lastMessageCountRef.current = 0;
      }
      // Silently handle other errors - keep existing messages
    }
  }, [gatewayClient, messageService]);

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
      if (isSending) {
        return;
      }

      try {
        const sessionState = await sessionService.getSession(currentSession);
        const currentCount = sessionState.messages?.length || 0;
        
        if (currentCount !== lastMessageCountRef.current) {
          await loadMessages();
        }
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
    }, 2000); // Poll every 2 seconds when not sending
  }, [gatewayClient, sessionService, loadMessages, isSending, stopPolling]);

  // Load messages when session changes (but not if we're currently sending)
  useEffect(() => {
    if (!isSending) {
      loadMessages();
    }
  }, [loadMessages, isSending]);

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

        // Poll for response
        let attempts = 0;
        const maxAttempts = 30; // ~9 seconds max
        const pollInterval = 300; // 300ms

        const checkForResponse = async (): Promise<void> => {
          return new Promise((resolve) => {
            const interval = setInterval(async () => {
              attempts++;

              try {
                // Check connection
                if (!gatewayClient?.isConnected()) {
                  if (attempts >= maxAttempts) {
                    clearInterval(interval);
                    resolve();
                  }
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
                } else if (attempts >= maxAttempts) {
                  // Timeout - reload messages anyway
                  await loadMessages();
                  clearInterval(interval);
                  setIsSending(false);
                  resolve();
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const isSessionNotFound = errorMessage.includes("not found") || errorMessage.includes("Session");
                
                if (isSessionNotFound || attempts >= maxAttempts) {
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
