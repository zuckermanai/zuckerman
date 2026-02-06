import React, { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

interface ToolResultViewerProps {
  content: string;
  toolCallId?: string;
  className?: string;
}

function formatJsonValue(value: unknown, depth = 0): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic text-[11px]">null</span>;
  }

  if (typeof value === "string") {
    if (value.length > 80) {
      return (
        <div className="space-y-0.5">
          <code className="text-[11px] font-mono text-foreground break-all">
            {value.substring(0, 80)}...
          </code>
          <div className="text-[10px] text-muted-foreground">
            ({value.length} chars)
          </div>
        </div>
      );
    }
    return (
      <code className="text-[11px] font-mono text-foreground break-all">
        {value}
      </code>
    );
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-primary font-mono text-[11px]">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground italic text-[11px]">[]</span>;
    }
    return (
      <div className="ml-2 space-y-0.5">
        {value.map((item, idx) => (
          <div key={idx} className="flex gap-1.5">
            <span className="text-muted-foreground text-[11px]">[{idx}]:</span>
            <div>{formatJsonValue(item, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="text-muted-foreground italic text-[11px]">{`{}`}</span>;
    }
    return (
      <div className="ml-2 space-y-0.5">
        {entries.map(([key, val]) => (
          <div key={key} className="flex gap-1.5">
            <span className="text-muted-foreground font-medium text-[11px]">{key}:</span>
            <div>{formatJsonValue(val, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-[11px]">{String(value)}</span>;
}

export function ToolResultViewer({ content, toolCallId, className }: ToolResultViewerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Try to parse content as JSON
  let parsedContent: unknown;
  let isJson = false;
  try {
    parsedContent = JSON.parse(content);
    isJson = true;
  } catch {
    parsedContent = content;
  }

  // Check if content looks like JSON (starts with { or [)
  const looksLikeJson = typeof content === "string" && (content.trim().startsWith("{") || content.trim().startsWith("["));
  
  // Truncate content preview for collapsed state
  const previewLength = 50;
  const preview = typeof content === "string" && content.length > previewLength 
    ? content.substring(0, previewLength) + "..." 
    : content;

  return (
    <div className={`inline-flex items-start ${className || ""}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="inline-flex items-center gap-1">
          <CollapsibleTrigger asChild>
            <button className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer text-xs">
              <div className="text-muted-foreground shrink-0">
                <CheckCircle2 className="h-3 w-3 text-green-500" />
              </div>
              <span className="font-medium text-foreground">
                Result
              </span>
              <div className="shrink-0 text-muted-foreground">
                {isOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </div>
            </button>
          </CollapsibleTrigger>
          {!isOpen && (
            <span className="text-[11px] text-muted-foreground ml-1 max-w-[200px] truncate">
              {typeof preview === "string" ? preview : JSON.stringify(preview).substring(0, previewLength)}
            </span>
          )}
        </div>
        <CollapsibleContent>
          <div className="mt-1.5 ml-0 border-l-2 border-border pl-3 py-1">
            <div className="bg-muted/30 rounded border border-border/50 p-2 overflow-x-auto">
              {isJson || looksLikeJson ? (
                <div className="text-[11px]">
                  {formatJsonValue(parsedContent)}
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-foreground">
                  {content}
                </pre>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
