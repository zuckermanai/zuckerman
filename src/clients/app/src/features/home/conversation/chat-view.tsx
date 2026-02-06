import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, Download, ChevronDown, CheckCircle2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UseAppReturn } from "../../../hooks/use-app";
import { MessageItem } from "./components/message-item";
import { ThinkingIndicator } from "./components/thinking-indicator";
import { EmptyState } from "./components/empty-state";
import { useGatewayContext } from "../../../core/gateway/use-gateway-context";

interface ChatViewProps {
  state: UseAppReturn;
  onAction: (action: string, data: any) => void;
}

export function ChatView({ state, onAction }: ChatViewProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageCountRef = useRef<number>(0);
  const shouldAutoScrollRef = useRef<boolean>(true); // Track if we should auto-scroll
  const isUserScrollingRef = useRef<boolean>(false);

  const { messages, isSending, sendMessage } = state;
  const { gatewayClient } = useGatewayContext();

  // Helper function to check if user is at bottom (best practice: exact check)
  const isAtBottom = (element: HTMLDivElement, threshold = 50): boolean => {
    const { scrollTop, scrollHeight, clientHeight } = element;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  };

  // Track scroll position to detect user scrolling (best practice: only scroll if user is at bottom)
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      if (!scrollElement) return;
      
      // Update auto-scroll preference based on scroll position
      shouldAutoScrollRef.current = isAtBottom(scrollElement);
    };

    // Use passive listener for better performance
    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom only when appropriate (best practice: conditional scrolling)
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const currentMessageCount = messages.length;
    const hasNewMessages = currentMessageCount > lastMessageCountRef.current;
    const wasAtBottom = shouldAutoScrollRef.current;
    
    lastMessageCountRef.current = currentMessageCount;

    // Only auto-scroll if:
    // 1. New messages were added AND user is already at bottom (preserves scroll position)
    // 2. OR user is actively sending (always scroll during send)
    if (hasNewMessages && (isSending || wasAtBottom)) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
          // Update ref after scrolling
          shouldAutoScrollRef.current = isAtBottom(scrollElement);
        }
      });
    }
  }, [messages, isSending]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const messageText = input;
    setInput("");

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "36px";
    }

    try {
      await sendMessage(messageText);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to send message";
      console.error(`[ChatView] Error sending message:`, error);
      // Show error to user
      alert(`Failed to send message: ${errorMessage}`);
      // Restore input if sending failed
      setInput(messageText);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle Cmd/Ctrl+A to select all text in textarea
    if ((e.metaKey || e.ctrlKey) && e.key === "a") {
      e.preventDefault();
      if (textareaRef.current) {
        textareaRef.current.select();
      }
      return;
    }
    
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const currentConversation = state.conversations.find((s) => s.id === state.currentConversationId);

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden bg-background"
      style={{
        minWidth: 0,
        height: "100%",
      }}
    >
      {/* Header - GitHub style */}
      <div
        className="border-b border-border bg-background flex items-center justify-between sticky top-0 z-10 px-6"
        style={{
          backgroundColor: 'hsl(var(--background))',
        }}
      >
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-[13px] text-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent transition-colors font-medium">
                {state.currentAgentId || "Select agent"}
                <ChevronDown className="h-4 w-4 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {state.agents.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No agents</div>
              ) : (
                state.agents.map((agentId) => (
                  <DropdownMenuItem
                    key={agentId}
                    onClick={() => onAction("select-agent", { agentId })}
                    className={agentId === state.currentAgentId ? "bg-accent" : ""}
                  >
                    {agentId}
                    {agentId === state.currentAgentId && (
                      <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />
                    )}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-5 w-px bg-border mx-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-[13px] text-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-accent transition-colors font-medium">
                {currentConversation?.label || state.currentConversationId || "Select conversation"}
                <ChevronDown className="h-4 w-4 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {state.conversations.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No conversations</div>
              ) : (
                [...state.conversations]
                  .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
                  .map((conversation) => (
                    <DropdownMenuItem
                      key={conversation.id}
                      onClick={() => onAction("select-conversation", { conversationId: conversation.id })}
                      className={conversation.id === state.currentConversationId ? "bg-accent" : ""}
                    >
                      {conversation.label || conversation.id}
                      {conversation.id === state.currentConversationId && (
                        <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-accent text-foreground/70 hover:text-foreground rounded-md"
            onClick={() => onAction("clear-conversation", {})}
            title="Clear conversation"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-accent text-foreground/70 hover:text-foreground rounded-md"
            title="Export conversation"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Chat Area - GitHub style */}
      <div className="flex-1 overflow-auto" ref={scrollRef} style={{ backgroundColor: 'hsl(var(--background))' }}>
        <div className="max-w-4xl mx-auto px-6 py-6">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-0">
              {messages.map((msg, idx) => {
                if (msg.role === "thinking") {
                  return <ThinkingIndicator key={`thinking-${idx}`} agentId={state.currentAgentId} />;
                }
                
                // Check if this is a tool result message (should be hidden)
                const isSystemToolResult = msg.role === "system" && 
                  msg.content.trim().startsWith("{") && 
                  msg.content.trim().endsWith("}");
                if (msg.role === "tool" || isSystemToolResult) {
                  return null;
                }
                
                // Collect tool results that belong to this assistant message
                const toolResults: Array<{ toolCallId: string; content: string }> = [];
                if (msg.role === "assistant" && msg.toolCalls) {
                  // Look ahead for tool result messages
                  for (let i = idx + 1; i < messages.length; i++) {
                    const nextMsg = messages[i];
                    const isNextSystemToolResult = nextMsg.role === "system" && 
                      nextMsg.content.trim().startsWith("{") && 
                      nextMsg.content.trim().endsWith("}");
                    
                    // Stop if we hit another assistant or user message
                    if (nextMsg.role === "assistant" || nextMsg.role === "user" || nextMsg.role === "thinking") {
                      break;
                    }
                    
                    // Collect tool results
                    if (nextMsg.role === "tool" || isNextSystemToolResult) {
                      if (nextMsg.toolCallId) {
                        toolResults.push({
                          toolCallId: nextMsg.toolCallId,
                          content: nextMsg.content,
                        });
                      }
                    }
                  }
                }
                
                return (
                  <MessageItem
                    key={`${msg.role}-${idx}-${msg.timestamp}`}
                    message={msg}
                    agentId={state.currentAgentId}
                    isSending={isSending}
                    toolResults={toolResults}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Input Area - GitHub style */}
      <div className="border-t border-border bg-background" style={{ backgroundColor: 'hsl(var(--background))' }}>
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              className="flex-1 min-h-[36px] max-h-[120px] resize-none text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2 pr-20"
              style={{
                height: "auto",
                userSelect: "text",
                WebkitUserSelect: "text",
              }}
            />
            <div className="absolute right-10 bottom-2 flex items-center gap-1 text-[11px] text-muted-foreground pointer-events-none">
              <kbd className="px-1.5 py-0.5">Enter</kbd>
              <span className="text-muted-foreground/60">to send</span>
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim()}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 mr-1 text-foreground/70 hover:text-foreground hover:bg-transparent disabled:opacity-30 shrink-0 rounded-md"
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
