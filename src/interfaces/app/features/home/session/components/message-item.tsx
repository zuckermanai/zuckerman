import React from "react";
import { Bot, User, MessageSquare } from "lucide-react";
import { JsonViewer } from "@/components/json-viewer";
import type { Message } from "../../../../infrastructure/types/message";

interface MessageItemProps {
  message: Message;
  agentId: string | null;
  isSending: boolean;
}

export function MessageItem({ message, agentId, isSending }: MessageItemProps) {
  return (
    <div
      key={`${message.role}-${message.timestamp}`}
      className="flex gap-4 py-4 border-b border-border last:border-b-0 transition-opacity duration-200 animate-in fade-in"
      style={{ borderColor: 'hsl(var(--border))' }}
    >
      <div className="w-10 h-10 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'hsl(var(--muted))' }}>
        {message.role === "assistant" ? (
          <Bot className="h-5 w-5 text-muted-foreground" />
        ) : message.role === "user" ? (
          <User className="h-5 w-5 text-muted-foreground" />
        ) : (
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold text-foreground">
            {message.role === "user"
              ? "You"
              : message.role === "assistant"
              ? agentId || "Assistant"
              : "System"}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
          {message.isStreaming && (
            <span className="text-xs text-muted-foreground/60 italic">typing...</span>
          )}
        </div>
        <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words" style={{ color: 'hsl(var(--foreground))' }}>
          {message.content || (message.role === "assistant" && isSending ? "..." : "")}
        </div>
        {message.rawResponse ? (
          <div className="mt-3">
            <JsonViewer data={message.rawResponse} title="Raw JSON Response" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
