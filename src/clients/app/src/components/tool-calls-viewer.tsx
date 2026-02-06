import React, { useState } from "react";
import { Terminal, Globe, Palette, Clock, Sparkles, Wrench, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Card, CardContent } from "./ui/card";

const TOOL_ICONS: Record<string, React.ReactNode> = {
  terminal: <Terminal className="h-4 w-4" />,
  browser: <Globe className="h-4 w-4" />,
  canvas: <Palette className="h-4 w-4" />,
  cron: <Clock className="h-4 w-4" />,
  tts: <Sparkles className="h-4 w-4" />,
};

interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

interface ToolCallsViewerProps {
  toolCalls: ToolCall[];
  className?: string;
}

function formatArgumentValue(value: unknown, depth = 0): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }

  if (typeof value === "string") {
    // If it's a long string, show truncated version
    if (value.length > 100) {
      return (
        <div className="space-y-1">
          <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all">
            {value.substring(0, 100)}...
          </code>
          <div className="text-xs text-muted-foreground">
            ({value.length} characters)
          </div>
        </div>
      );
    }
    return (
      <code className="text-xs font-mono bg-muted px-2 py-1 rounded break-all">
        {value}
      </code>
    );
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-primary font-mono">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground italic">[]</span>;
    }
    return (
      <div className="ml-4 space-y-1">
        {value.map((item, idx) => (
          <div key={idx} className="flex gap-2">
            <span className="text-muted-foreground">[{idx}]:</span>
            <div>{formatArgumentValue(item, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="text-muted-foreground italic">{`{}`}</span>;
    }
    return (
      <div className="ml-4 space-y-1">
        {entries.map(([key, val]) => (
          <div key={key} className="flex gap-2">
            <span className="text-muted-foreground font-medium">{key}:</span>
            <div>{formatArgumentValue(val, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-xs">{String(value)}</span>;
}

export function ToolCallsViewer({ toolCalls, className }: ToolCallsViewerProps) {
  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  return (
    <div className={`mt-3 space-y-2 ${className || ""}`}>
      <div className="text-xs font-medium text-muted-foreground mb-2">
        Tools Used ({toolCalls.length})
      </div>
      {toolCalls.map((toolCall) => (
        <ToolCallItem key={toolCall.id} toolCall={toolCall} />
      ))}
    </div>
  );
}

function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const [isOpen, setIsOpen] = useState(false);
  const toolIcon = TOOL_ICONS[toolCall.name] || <Wrench className="h-4 w-4" />;

  return (
    <Card className="border-border bg-background">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <CardContent className="p-3 hover:bg-accent/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground shrink-0">
                  {toolIcon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground capitalize">
                    {toolCall.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {toolCall.id}
                  </div>
                </div>
                <div className="shrink-0 text-muted-foreground">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              </div>
            </CardContent>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3 px-3 border-t border-border">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Arguments:
              </div>
              <div className="bg-muted/50 rounded-md p-3 text-sm overflow-x-auto">
                {formatArgumentValue(toolCall.arguments)}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
