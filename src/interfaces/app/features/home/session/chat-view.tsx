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
import { useMessages } from "../../../hooks/use-messages";
import type { AppState } from "../../../infrastructure/types/app-state";
import { MessageItem } from "./components/message-item";
import { ThinkingIndicator } from "./components/thinking-indicator";
import { EmptyState } from "./components/empty-state";

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
                {currentSession?.label || state.currentSessionId || "Select session"}
                <ChevronDown className="h-4 w-4 opacity-60" />
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
                return (
                  <MessageItem
                    key={`${msg.role}-${idx}-${msg.timestamp}`}
                    message={msg}
                    agentId={state.currentAgentId}
                    isSending={isSending}
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
              placeholder={isSending ? "Sending..." : "Message..."}
              disabled={isSending}
              className="flex-1 min-h-[36px] max-h-[120px] resize-none text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2 pr-20"
              style={{
                height: "auto",
              }}
            />
            <div className="absolute right-10 bottom-2 flex items-center gap-1 text-[11px] text-muted-foreground pointer-events-none">
              <kbd className="px-1.5 py-0.5">Enter</kbd>
              <span className="text-muted-foreground/60">to send</span>
            </div>
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 mr-1 text-foreground/70 hover:text-foreground hover:bg-transparent disabled:opacity-30 shrink-0 rounded-md"
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
