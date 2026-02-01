import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Trash2, Download, ChevronDown, MessageSquare, CheckCircle2, Bot, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JsonViewer } from "@/components/json-viewer";
import { useMessages } from "../../hooks/use-messages";
import type { Message } from "../../infrastructure/types/message";
import type { AppState } from "../../infrastructure/types/app-state";

interface ChatViewProps {
  state: AppState;
  onAction: (action: string, data: any) => void;
}

export function ChatView({ state, onAction }: ChatViewProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, isSending, sendMessage } = useMessages(
    state.gatewayClient,
    state.currentSessionId,
    state.currentAgentId
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
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
      alert(errorMessage); // TODO: Replace with a proper toast/notification component
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

  const currentSession = state.sessions.find((s) => s.id === state.currentSessionId);

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden bg-background"
      style={{
        minWidth: 0,
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        className="h-12 border-b border-border bg-background flex items-center justify-between sticky top-0 z-10"
        style={{
          paddingLeft: "0px",
          paddingRight: "16px",
        }}
      >
        <div className="flex items-center gap-3" style={{ paddingLeft: "16px" }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-sm text-foreground hover:text-foreground/80 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent transition-colors font-medium">
                {state.currentAgentId || "Select agent"}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
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

          <div className="h-4 w-px bg-border" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-sm text-foreground hover:text-foreground/80 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent transition-colors font-medium">
                {currentSession?.label || state.currentSessionId || "Select session"}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {state.sessions.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No sessions</div>
              ) : (
                state.sessions.map((session) => (
                  <DropdownMenuItem
                    key={session.id}
                    onClick={() => onAction("select-session", { sessionId: session.id })}
                    className={session.id === state.currentSessionId ? "bg-accent" : ""}
                  >
                    {session.label || session.id}
                    {session.id === state.currentSessionId && (
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
            className="h-8 w-8 p-0 hover:bg-accent text-muted-foreground hover:text-foreground"
            onClick={() => onAction("clear-conversation", {})}
            title="Clear conversation"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Export conversation"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-auto" ref={scrollRef}>
        <div className="max-w-4xl mx-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <MessageSquare className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-1 text-foreground">No messages yet</h3>
              <p className="text-sm text-muted-foreground">Start a conversation with your agent</p>
            </div>
          ) : (
            <div className="space-y-0">
              {messages.map((msg, idx) => {
                if (msg.role === "thinking") {
                  return (
                    <div
                      key={`thinking-${idx}`}
                      className="flex gap-3 py-4 border-b border-border last:border-b-0 animate-pulse"
                    >
                      <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-foreground">
                            {state.currentAgentId || "Assistant"}
                          </span>
                          <span className="text-[11px] text-muted-foreground italic">thinking...</span>
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                          <div
                            className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
                            style={{ animationDelay: "0ms" }}
                          />
                          <div
                            className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
                            style={{ animationDelay: "150ms" }}
                          />
                          <div
                            className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
                            style={{ animationDelay: "300ms" }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${msg.role}-${idx}-${msg.timestamp}`}
                    className="flex gap-3 py-4 border-b border-border last:border-b-0 transition-opacity duration-200 animate-in fade-in"
                  >
                    <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5">
                      {msg.role === "assistant" ? (
                        <Bot className="h-4 w-4 text-muted-foreground" />
                      ) : msg.role === "user" ? (
                        <User className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-foreground">
                          {msg.role === "user"
                            ? "You"
                            : msg.role === "assistant"
                            ? state.currentAgentId || "Assistant"
                            : "System"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {msg.isStreaming && (
                          <span className="text-[10px] text-muted-foreground/60 italic">typing...</span>
                        )}
                      </div>
                      <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                        {msg.content || (msg.role === "assistant" && isSending ? "..." : "")}
                      </div>
                      {msg.rawResponse ? (
                        <div className="mt-2">
                          <JsonViewer data={msg.rawResponse} title="Raw JSON Response" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-background">
        <div className="max-w-4xl mx-auto px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring relative">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isSending ? "Sending..." : "Message..."}
              disabled={isSending}
              className="flex-1 min-h-[36px] max-h-[120px] resize-none text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2 pr-20"
              style={{
                height: "auto",
              }}
            />
            <div className="absolute right-10 bottom-2 flex items-center gap-1 text-[11px] text-muted-foreground pointer-events-none">
              <kbd className="px-1 py-0.5">Enter</kbd>
              <span className="text-muted-foreground/60">to send</span>
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 mr-1 text-muted-foreground hover:text-foreground hover:bg-transparent disabled:opacity-30 shrink-0"
              title={isSending ? "Sending..." : "Send message"}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
