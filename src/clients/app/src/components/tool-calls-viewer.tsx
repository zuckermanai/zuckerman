import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";

interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

interface ToolResult {
  toolCallId: string;
  content: string;
}

interface ToolCallsViewerProps {
  toolCalls: ToolCall[];
  toolResults?: ToolResult[];
  className?: string;
}

function formatArgumentValue(value: unknown, depth = 0): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic text-[11px]">null</span>;
  }

  if (typeof value === "string") {
    // If it's a long string, show truncated version
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
            <div>{formatArgumentValue(item, depth + 1)}</div>
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
            <div>{formatArgumentValue(val, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-[11px]">{String(value)}</span>;
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

export function ToolCallsViewer({ toolCalls, toolResults = [], className }: ToolCallsViewerProps) {
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  // Create a map of tool results by toolCallId
  const resultsMap = new Map<string, ToolResult>();
  toolResults.forEach(result => {
    resultsMap.set(result.toolCallId, result);
  });

  return (
    <div className={`mt-1.5 space-y-1 ${className || ""}`}>
      {toolCalls.map((toolCall) => {
        const result = resultsMap.get(toolCall.id);
        return (
          <ToolCallItem 
            key={toolCall.id} 
            toolCall={toolCall} 
            toolResult={result}
          />
        );
      })}
    </div>
  );
}

function ToolCallItem({ toolCall, toolResult }: { toolCall: ToolCall; toolResult?: ToolResult }) {
  const [isOpen, setIsOpen] = useState(false);
  const hasArgs = toolCall.arguments && 
    (typeof toolCall.arguments === 'object' ? Object.keys(toolCall.arguments).length > 0 : true);
  
  // Parse tool result content
  let parsedResult: unknown = null;
  let isJsonResult = false;
  if (toolResult) {
    try {
      parsedResult = JSON.parse(toolResult.content);
      isJsonResult = true;
    } catch {
      parsedResult = toolResult.content;
    }
  }

  const hasContent = hasArgs || toolResult;
  
  // Create preview text
  const previewLength = 60;
  let previewText = "";
  if (toolResult) {
    if (typeof parsedResult === "string") {
      previewText = parsedResult.length > previewLength 
        ? parsedResult.substring(0, previewLength) + "..." 
        : parsedResult;
    } else {
      const jsonStr = JSON.stringify(parsedResult);
      previewText = jsonStr.length > previewLength 
        ? jsonStr.substring(0, previewLength) + "..." 
        : jsonStr;
    }
  } else if (hasArgs) {
    const argsStr = JSON.stringify(toolCall.arguments);
    previewText = argsStr.length > previewLength 
      ? argsStr.substring(0, previewLength) + "..." 
      : argsStr;
  }

  return (
    <div className="text-sm">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left hover:bg-muted/30 rounded px-1 py-0.5 -mx-1 transition-colors cursor-pointer">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 inline" />
                ) : (
                  <ChevronRight className="h-3 w-3 inline" />
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {toolCall.name}
              </span>
              {toolResult && (
                <span className="text-[10px] text-green-500">✓</span>
              )}
              {previewText && !isOpen && (
                <span className="text-xs text-muted-foreground/70 truncate flex-1">
                  {previewText}
                </span>
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        {hasContent && (
          <CollapsibleContent>
            <div className="mt-1 ml-4 border-l border-border pl-3 space-y-2">
              {hasArgs && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-medium">
                    Arguments
                  </div>
                  <div className="bg-muted/30 rounded border border-border/50 p-1.5 text-xs overflow-x-auto">
                    {formatArgumentValue(toolCall.arguments)}
                  </div>
                </div>
              )}
              {toolResult && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1 font-medium">
                    Result
                  </div>
                  <div className="bg-muted/30 rounded border border-border/50 p-1.5 text-xs overflow-x-auto">
                    {isJsonResult ? (
                      <div className="text-[11px]">
                        {formatJsonValue(parsedResult)}
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-foreground">
                        {toolResult.content}
                      </pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}
