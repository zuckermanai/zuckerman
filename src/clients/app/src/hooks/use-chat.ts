import { useState, useEffect, useRef, useCallback } from "react";
import type { Conversation, ConversationType } from "../types/conversation";
import type { Message } from "../types/message";
import { useConversationService, useMessageService, useAgentService } from "../core/gateway/use-services";
import { useGatewayContext } from "../core/gateway/use-gateway-context";
import { getStorageItem, setStorageItem } from "../core/storage/local-storage";

const ACTIVE_CONVERSATIONS_STORAGE_KEY = "zuckerman:active-conversations";

export interface UseChatReturn {
  // Conversations
  conversations: Conversation[];
  currentConversationId: string | null;
  setCurrentConversationId: (conversationId: string | null) => void;
  createConversation: (type: ConversationType, agentId: string, label?: string) => Promise<Conversation>;
  loadConversations: () => Promise<void>;

  // Active conversations (UI state)
  activeConversationIds: Set<string>;
  addToActiveConversations: (conversationId: string) => void;
  removeFromActiveConversations: (conversationId: string) => void;

  // Messages
  messages: Message[];
  isSending: boolean;
  sendMessage: (message: string) => Promise<void>;
  loadMessages: () => Promise<void>;
}

/**
 * Consolidated hook for chat feature:
 * - Conversation management
 * - Active conversations UI state
 * - Message loading and sending
 * Uses gateway client from context (no props needed)
 */
export function useChat(
  currentAgentId: string | null,
  agentId: string | null
): UseChatReturn {
  const { gatewayClient, connectionStatus } = useGatewayContext();
  const conversationService = useConversationService();
  const messageService = useMessageService();
  const agentService = useAgentService();

  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);

  // Active conversations state (UI)
  const [activeConversationIds, setActiveConversationIds] = useState<Set<string>>(() => {
    const stored = getStorageItem<string[]>(ACTIVE_CONVERSATIONS_STORAGE_KEY, []);
    if (stored.length > 0) {
      return new Set(stored);
    }
    return currentConversationId ? new Set([currentConversationId]) : new Set<string>();
  });

  // Messages state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Refs for messages
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const lastMessageCountRef = useRef<number>(0);
  const currentConversationIdRef = useRef<string | null>(currentConversationId);
  const streamingMessageRef = useRef<{ runId: string; content: string } | null>(null);
  // Track pending tool calls: maps toolCallId -> tool name
  // Used to match tool results with their corresponding tool calls
  const pendingToolCallsRef = useRef<Map<string, string>>(new Map());

  // Update refs when conversationId changes - do this synchronously
  useEffect(() => {
    const previousConversationId = currentConversationIdRef.current;
    currentConversationIdRef.current = currentConversationId;
    
    // If conversation changed, clear streaming state and messages
    if (previousConversationId !== currentConversationId) {
      streamingMessageRef.current = null;
      pendingToolCallsRef.current.clear();
      // Clear messages immediately when switching conversations
      setMessages([]);
    }
  }, [currentConversationId]);

  // Sync currentConversationId with active conversations
  useEffect(() => {
    if (currentConversationId) {
      setActiveConversationIds((prev) => {
        if (prev.has(currentConversationId)) return prev;
        const updated = new Set(prev);
        updated.add(currentConversationId);
        return updated;
      });
    }
  }, [currentConversationId]);

  // Persist active conversations to localStorage
  useEffect(() => {
    setStorageItem(ACTIVE_CONVERSATIONS_STORAGE_KEY, Array.from(activeConversationIds));
  }, [activeConversationIds]);

  // Conversation management
  const createConversation = useCallback(
    async (type: ConversationType, agentId: string, label?: string): Promise<Conversation> => {
      if (connectionStatus !== "connected" || !conversationService) {
        throw new Error("Gateway not connected");
      }

      const newConversation = await conversationService.createConversation(type, agentId, label);
      setConversations((prev) => [...prev, newConversation]);
      setCurrentConversationId(newConversation.id);
      return newConversation;
    },
    [connectionStatus, conversationService]
  );

  const loadConversations = useCallback(async () => {
    if (connectionStatus !== "connected" || !conversationService) {
      return;
    }

    try {
      const loadedConversations = await conversationService.listConversations();
      setConversations(loadedConversations);

      if (loadedConversations.length > 0 && !currentConversationId) {
        setCurrentConversationId(loadedConversations[0].id);
      }
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  }, [connectionStatus, conversationService, currentConversationId]);

  // React to connection status changes
  useEffect(() => {
    if (connectionStatus === "connected" && currentAgentId) {
      loadConversations();
    } else if (connectionStatus === "connected" && !currentAgentId && conversations.length === 0) {
      loadConversations();
    } else if (connectionStatus === "disconnected") {
      // Clear conversations when disconnected
      setConversations([]);
      setCurrentConversationId(null);
    }
  }, [connectionStatus, currentAgentId, loadConversations, conversations.length]);

  // Active conversations management
  const addToActiveConversations = useCallback((conversationId: string) => {
    setActiveConversationIds((prev) => {
      if (prev.has(conversationId)) return prev;
      const updated = new Set(prev);
      updated.add(conversationId);
      return updated;
    });
  }, []);

  const removeFromActiveConversations = useCallback((conversationId: string) => {
    setActiveConversationIds((prev) => {
      if (!prev.has(conversationId)) return prev;
      const updated = new Set(prev);
      updated.delete(conversationId);
      return updated;
    });
  }, []);

  // Message management
  const loadMessages = useCallback(async () => {
    const currentConversation = currentConversationId || currentConversationIdRef.current;
    if (!currentConversation || connectionStatus !== "connected" || !messageService) {
      setMessages([]);
      return;
    }

    // Store the conversation ID we're loading for
    const loadingConversationId = currentConversation;

    try {
      const loadedMessages = await messageService.loadMessages(loadingConversationId);
      const deduplicated = messageService.deduplicateMessages(loadedMessages);

      // Verify we're still on the same conversation before updating
      if (currentConversationIdRef.current !== loadingConversationId) {
        return; // Conversation changed, don't update messages
      }

      setMessages((prev) => {
        // Double-check conversation hasn't changed
        if (currentConversationIdRef.current !== loadingConversationId) {
          return prev;
        }

        // If we have no previous messages (e.g., just switched conversations), always load
        if (prev.length === 0) {
          lastMessageCountRef.current = deduplicated.length;
          return deduplicated;
        }

        // If we have a streaming message in progress, merge it with loaded messages
        const hasStreamingMessage = prev.some((msg) => (msg as any).streamingRunId);
        if (hasStreamingMessage) {
          // Find the streaming message in prev
          const streamingMsg = prev.find((msg) => (msg as any).streamingRunId);
          if (streamingMsg) {
            // Check if this streaming message exists in loaded messages
            const streamingRunId = (streamingMsg as any).streamingRunId;
            const loadedStreamingIndex = deduplicated.findIndex(
              (msg) => (msg as any).streamingRunId === streamingRunId
            );
            
            if (loadedStreamingIndex === -1) {
              // Streaming message not in loaded messages, append it
              const merged = [...deduplicated, streamingMsg];
              lastMessageCountRef.current = merged.length;
              return merged;
            } else {
              // Streaming message exists in loaded, but might be outdated
              // Keep the streaming version if it has more content
              const loadedStreaming = deduplicated[loadedStreamingIndex];
              if (streamingMsg.content && streamingMsg.content.length > (loadedStreaming.content?.length || 0)) {
                const merged = [...deduplicated];
                merged[loadedStreamingIndex] = streamingMsg;
                lastMessageCountRef.current = merged.length;
                return merged;
              }
            }
          }
        }

        // Standard comparison logic
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
      // Only handle error if still on same conversation
      if (currentConversationIdRef.current !== loadingConversationId) {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isConversationNotFound =
        errorMessage.includes("not found") || errorMessage.includes("Conversation");

      if (isConversationNotFound) {
        setMessages([]);
        lastMessageCountRef.current = 0;
      }
    }
  }, [connectionStatus, messageService, currentConversationId]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollingRef.current) return;

    pollingRef.current = setInterval(async () => {
      const currentConversation = currentConversationIdRef.current;
      if (!currentConversation || connectionStatus !== "connected" || !conversationService) {
        return;
      }

      if (isSending || streamingMessageRef.current) {
        return;
      }

      try {
        const conversationState = await conversationService.getConversation(currentConversation);
        const currentCount = conversationState.messages?.length || 0;

        if (currentCount !== lastMessageCountRef.current) {
          await loadMessages();
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isConversationNotFound =
          errorMessage.includes("not found") || errorMessage.includes("Conversation");

        if (isConversationNotFound) {
          stopPolling();
          setMessages([]);
          lastMessageCountRef.current = 0;
        }
      }
    }, 5000);
  }, [connectionStatus, conversationService, loadMessages, isSending, stopPolling]);

  // Load messages when conversation changes
  // Note: Messages are already cleared in the ref update effect above
  useEffect(() => {
    if (currentConversationId) {
      loadMessages();
    }
  }, [currentConversationId, loadMessages]);

  // Streaming event listener
  useEffect(() => {
    if (!gatewayClient) return;

    const handleStreamEvent = (event: { event: string; payload?: unknown }) => {
      if (!event.event.startsWith("agent.stream.")) return;

      const eventType = event.event.replace("agent.stream.", "");
      const payload = event.payload as {
        conversationId?: string;
        runId?: string;
        token?: string;
        tool?: string;
        toolArgs?: Record<string, unknown>;
        toolResult?: unknown;
        phase?: "start" | "end" | "error";
        error?: string;
      };

      if (payload.conversationId !== currentConversationIdRef.current) return;

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
          pendingToolCallsRef.current.clear();
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
                content: `${newMessages[streamingIndex].content}\n\nError: ${payload.error || "Unknown error"}`,
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
        const toolName = payload.tool; // Type guard: payload.tool is now string
        setMessages((prev) => {
          const newMessages = [...prev];
          
          // Remove thinking indicator if present
          const thinkingIndex = newMessages.findIndex((msg) => msg.role === "thinking");
          if (thinkingIndex !== -1) {
            newMessages.splice(thinkingIndex, 1);
          }
          
          // Generate unique tool call ID
          const toolCallId = `stream-tool-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          const toolArgsStr = payload.toolArgs ? JSON.stringify(payload.toolArgs) : "{}";
          
          // Create assistant message with tool call
          const toolCallMessage: Message = {
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            toolCalls: [{
              id: toolCallId,
              name: toolName,
              arguments: toolArgsStr,
            }],
          };
          
          newMessages.push(toolCallMessage);
          
          // Track this tool call for matching with its result
          pendingToolCallsRef.current.set(toolCallId, toolName);
          
          return newMessages;
        });
      } else if (eventType === "tool.result" && payload.tool) {
        const toolName = payload.tool; // Type guard: payload.tool is now string
        setMessages((prev) => {
          const newMessages = [...prev];
          
          // Format tool result content
          const formatToolResult = (result: unknown): string => {
            if (result === null || result === undefined) return "completed";
            if (typeof result === "string") return result;
            if (typeof result === "object") {
              try {
                return JSON.stringify(result);
              } catch {
                return String(result);
              }
            }
            return String(result);
          };
          
          const resultContent = formatToolResult(payload.toolResult);
          
          // Find the most recent tool call message for this tool name (search backwards)
          let toolCallId: string | undefined;
          let toolCallIndex = -1;
          
          for (let i = newMessages.length - 1; i >= 0; i--) {
            const msg = newMessages[i];
            if (msg.role === "assistant" && msg.toolCalls) {
              for (const toolCall of msg.toolCalls) {
                if (toolCall.name === toolName && pendingToolCallsRef.current.has(toolCall.id)) {
                  toolCallId = toolCall.id;
                  toolCallIndex = i;
                  break;
                }
              }
              if (toolCallId) break;
            }
          }
          
          if (toolCallId !== undefined && toolCallIndex !== -1) {
            // Create tool result message
            const toolResultMessage: Message = {
              role: "tool",
              content: resultContent,
              timestamp: Date.now(),
              toolCallId: toolCallId, // TypeScript now knows this is string
            };
            
            // Insert result message right after the tool call message
            newMessages.splice(toolCallIndex + 1, 0, toolResultMessage);
            
            // Remove from pending calls
            pendingToolCallsRef.current.delete(toolCallId);
          } else {
            // No matching tool call found, append as fallback
            newMessages.push({
              role: "tool",
              content: resultContent,
              timestamp: Date.now(),
              toolCallId: `fallback-${Date.now()}`,
            });
          }
          
          return newMessages;
        });
      } else if (eventType === "done") {
        streamingMessageRef.current = null;
        pendingToolCallsRef.current.clear();
        loadMessages();
      }
    };

    const removeListener = gatewayClient.addEventListener(handleStreamEvent);
    return () => {
      removeListener();
    };
  }, [gatewayClient, loadMessages]);

  useEffect(() => {
    if (connectionStatus === "connected" && currentConversationId) {
      startPolling();
    } else {
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [connectionStatus, currentConversationId, startPolling, stopPolling]);

  const sendMessage = useCallback(
    async (messageText: string) => {
      if (!gatewayClient || !messageService || !agentService || !conversationService) {
        throw new Error("Services not initialized");
      }

      if (connectionStatus !== "connected") {
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

      let currentConversationId = currentConversationIdRef.current;
      if (!currentConversationId) {
        const newConversation = await conversationService.createConversation("main", currentAgentId);
        currentConversationId = newConversation.id;
        currentConversationIdRef.current = currentConversationId;
        setCurrentConversationId(currentConversationId);
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
        // Ensure we have valid IDs (they should be set above, but TypeScript needs this)
        if (!currentConversationId || !currentAgentId) {
          throw new Error("Conversation or agent ID is missing");
        }

        // TypeScript narrowing - assign to const to ensure types
        const conversationId: string = currentConversationId;
        const agentId: string = currentAgentId;

        console.log(`[useChat] Sending message with agentId: "${agentId}", conversationId: "${conversationId}"`);
        await messageService.sendMessage(conversationId, agentId, messageText);
        
        // Allow sending new messages immediately after message is sent
        // Streaming will be handled by the event listener
        setIsSending(false);

        let attempts = 0;
        const pollInterval = 300;

        const checkForResponse = async (): Promise<void> => {
          return new Promise((resolve) => {
            const interval = setInterval(async () => {
              attempts++;

              try {
                // Check if conversation changed - if so, stop polling
                if (currentConversationIdRef.current !== conversationId) {
                  clearInterval(interval);
                  resolve();
                  return;
                }

                if (connectionStatus !== "connected") {
                  return;
                }

                const loadedMessages = await messageService.loadMessages(conversationId);
                const deduplicated = messageService.deduplicateMessages(loadedMessages);

                const hasResponse = deduplicated.some((msg) => {
                  if (msg.role !== "assistant") return false;
                  const msgTimestamp = msg.timestamp || 0;
                  return msgTimestamp >= userMessageTimestamp - 500;
                });

                if (hasResponse) {
                  // Double-check conversation hasn't changed before updating
                  if (currentConversationIdRef.current === conversationId) {
                    setMessages(deduplicated);
                    lastMessageCountRef.current = deduplicated.length;
                  }
                  clearInterval(interval);
                  resolve();
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                const isConversationNotFound =
                  errorMessage.includes("not found") || errorMessage.includes("Conversation");

                if (isConversationNotFound) {
                  clearInterval(interval);
                  // Only clear thinking indicator if still on same conversation
                  if (currentConversationIdRef.current === conversationId) {
                    setMessages((prev) => prev.filter((msg) => msg.role !== "thinking"));
                  }
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
        // Re-throw with more context, but don't double-wrap if already wrapped
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.startsWith("Failed to send message:")) {
          throw error; // Already wrapped, don't wrap again
        }
        throw new Error(`Failed to send message: ${errorMessage}`);
      }
    },
    [gatewayClient, connectionStatus, messageService, agentService, conversationService, agentId, loadMessages]
  );

  useEffect(() => {
    return () => {
      stopPolling();
      setIsSending(false);
    };
  }, [stopPolling]);

  return {
    conversations,
    currentConversationId,
    setCurrentConversationId,
    createConversation,
    loadConversations,
    activeConversationIds,
    addToActiveConversations,
    removeFromActiveConversations,
    messages,
    isSending,
    sendMessage,
    loadMessages,
  };
}
