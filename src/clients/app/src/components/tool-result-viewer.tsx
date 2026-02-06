import React, { useState } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Card, CardContent } from "./ui/card";
import { JsonViewer } from "./json-viewer";

interface ToolResultViewerProps {
  content: string;
  toolCallId?: string;
  className?: string;
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

  return (
    <Card className={`border-border bg-background ${className || ""}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            <CardContent className="p-3 hover:bg-accent/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="text-muted-foreground shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground">
                    Tool Result
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {toolCallId || "Result"}
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
            {isJson || looksLikeJson ? (
              <JsonViewer data={parsedContent} defaultExpanded={true} />
            ) : (
              <div className="bg-muted/50 rounded-md p-3 text-sm overflow-x-auto">
                <pre className="whitespace-pre-wrap break-words font-mono text-xs">
                  {content}
                </pre>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
