import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MessageSquare, Send, Loader2, Plus, History, ChevronDown, CheckCircle2 } from "lucide-react";
import type { UseAppReturn } from "../../../../hooks/use-app";

interface ChatPanelProps {
  agentId: string;
  state: UseAppReturn;
}

export function ChatPanel({ agentId, state }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageCountRef = useRef<number>(0);
  const shouldAutoScrollRef = useRef<boolean>(true);

  const { messages, isSending, sendMessage, createConversation } = state;
  const currentConversation = state.conversations.find((s) => s.id === state.currentConversationId && s.agentId === agentId);
  
  // Get conversations for this agent, sorted by lastActivity
  const agentConversations = state.conversations
    .filter((c) => c.agentId === agentId)
    .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));

  // Debug logging
  useEffect(() => {
    console.log("[ChatPanel] Debug:", {
      agentId,
      currentConversationId: state.currentConversationId,
      currentConversation: currentConversation?.id,
      messagesCount: messages.length,
      messagesWithConversationId: messages.filter(m => m.conversationId).length,
      conversationMessagesCount: currentConversation 
        ? messages.filter((msg) => !msg.conversationId || msg.conversationId === currentConversation.id).length
        : 0,
    });
  }, [agentId, state.currentConversationId, currentConversation?.id, messages.length]);

  const handleNewChat = async () => {
    try {
      const newConv = await createConversation("main", agentId);
      if (newConv) {
        state.setCurrentConversationId(newConv.id);
        state.addToActiveConversations(newConv.id);
      }
    } catch (error) {
      console.error("[ChatPanel] Failed to create conversation:", error);
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    state.setCurrentConversationId(conversationId);
    state.addToActiveConversations(conversationId);
  };

  const formatConversationTime = (timestamp?: number): string => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 24) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (hours < 48) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    }
  };

  // Helper function to check if user is at bottom
  const isAtBottom = (element: HTMLDivElement, threshold = 50): boolean => {
    const { scrollTop, scrollHeight, clientHeight } = element;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  };

  // Track scroll position
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const handleScroll = () => {
      if (!scrollElement) return;
      shouldAutoScrollRef.current = isAtBottom(scrollElement);
    };

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollElement.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const currentMessageCount = messages.length;
    const hasNewMessages = currentMessageCount > lastMessageCountRef.current;
    const wasAtBottom = shouldAutoScrollRef.current;
    
    lastMessageCountRef.current = currentMessageCount;

    if (hasNewMessages && (isSending || wasAtBottom)) {
      requestAnimationFrame(() => {
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
          shouldAutoScrollRef.current = isAtBottom(scrollElement);
        }
      });
    }
  }, [messages, isSending]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const messageText = input;
    setInput("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "36px";
    }

    try {
      await sendMessage(messageText);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to send message";
      console.error(`[ChatPanel] Error sending message:`, error);
      setInput(messageText);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  // Filter messages for current conversation
  // Include messages that match the current conversation ID, or messages without conversationId (backwards compatibility)
  const conversationMessages = currentConversation 
    ? messages.filter((msg) => !msg.conversationId || msg.conversationId === currentConversation.id)
    : [];

  return (
    <div className="flex flex-col h-full bg-background border-l border-border overflow-hidden relative">
      {/* Chat Header */}
      <div className="flex-none border-b border-border bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">Chat</span>
          </div>
          
          <div className="flex items-center gap-2 flex-1 max-w-[200px]">
            {/* Conversation Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex-1 flex items-center justify-between px-2 py-1.5 text-xs rounded-md hover:bg-accent transition-colors text-left min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <History className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate text-foreground text-xs">
                      {currentConversation?.label || "Select"}
                    </span>
                  </div>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {agentConversations.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">No conversations</div>
                ) : (
                  <>
                    {agentConversations.map((conversation) => (
                      <DropdownMenuItem
                        key={conversation.id}
                        onClick={() => handleSelectConversation(conversation.id)}
                        className={`${conversation.id === state.currentConversationId ? "bg-accent" : ""} flex flex-col items-start`}
                      >
                        <div className="flex items-center justify-between w-full min-w-0">
                          <span className="truncate text-xs">{conversation.label || conversation.id}</span>
                          {conversation.id === state.currentConversationId && (
                            <CheckCircle2 className="h-3.5 w-3.5 ml-2 text-primary shrink-0" />
                          )}
                        </div>
                        {conversation.lastActivity && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatConversationTime(conversation.lastActivity)}
                          </div>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleNewChat} className="text-xs">
                  <Plus className="h-3.5 w-3.5 mr-2" />
                  New Conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Button
              onClick={handleNewChat}
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto min-h-0" ref={scrollRef}>
        <div className="px-4 py-4">
          {conversationMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <MessageSquare className="h-8 w-8 text-muted-foreground mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start a conversation with {agentId}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {conversationMessages.map((msg, idx) => {
                if (msg.role === "thinking" || msg.role === "tool") {
                  return null;
                }
                
                const isSystemToolResult = msg.role === "system" && 
                  msg.content.trim().startsWith("{") && 
                  msg.content.trim().endsWith("}");
                if (isSystemToolResult) {
                  return null;
                }
                
                return (
                  <div
                    key={`${msg.role}-${idx}-${msg.timestamp}`}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    </div>
                  </div>
                );
              })}
              {isSending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="flex-none border-t border-border bg-background p-4">
        <div className="flex items-end gap-2 rounded-md border border-border bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message..."
            className="flex-1 min-h-[36px] max-h-[120px] resize-none text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2"
            style={{
              height: "auto",
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
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
  );
}
