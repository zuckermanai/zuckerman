import React from "react";
import { Bot } from "lucide-react";

interface ThinkingIndicatorProps {
  agentId: string | null;
}

export function ThinkingIndicator({ agentId }: ThinkingIndicatorProps) {
  return (
    <div className="flex gap-3 py-4 border-b border-border last:border-b-0 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-muted border border-border flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-foreground">{agentId || "Assistant"}</span>
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
