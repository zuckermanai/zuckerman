import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, ChevronDown, ChevronUp } from "lucide-react";

interface LogEntry {
  timestamp: number;
  type: "stdout" | "stderr";
  message: string;
}

interface GatewayLogsViewerProps {
  limit?: number;
}

export function GatewayLogsViewer({ limit = 200 }: GatewayLogsViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const loadLogs = async () => {
    if (!window.electronAPI) return;
    try {
      const loadedLogs = await window.electronAPI.gatewayLogs(limit);
      setLogs(loadedLogs);
    } catch (error) {
      console.error("Failed to load logs:", error);
    }
  };

  useEffect(() => {
    loadLogs();
    // Poll for new logs every 2 seconds when expanded
    const interval = setInterval(() => {
      if (isExpanded) {
        loadLogs();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isExpanded, limit]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && isExpanded && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll, isExpanded]);

  const handleClearLogs = async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.gatewayClearLogs();
      setLogs([]);
    } catch (error) {
      console.error("Failed to clear logs:", error);
    }
  };

  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 mr-2" />
            ) : (
              <ChevronDown className="h-4 w-4 mr-2" />
            )}
            Gateway Logs {logs.length > 0 && `(${logs.length})`}
          </Button>
        </div>
        {isExpanded && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearLogs}
              className="h-8"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoScroll(!autoScroll)}
              className="h-8"
            >
              {autoScroll ? "Auto-scroll: ON" : "Auto-scroll: OFF"}
            </Button>
          </div>
        )}
      </div>
      {isExpanded && (
        <ScrollArea className="h-[300px] w-full">
          <div className="p-3 font-mono text-xs" ref={scrollAreaRef}>
            {logs.length === 0 ? (
              <div className="text-muted-foreground text-center py-8">
                No logs available. Start the gateway to see logs.
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`mb-1 ${
                    log.type === "stderr"
                      ? "text-destructive"
                      : "text-foreground"
                  }`}
                >
                  <span className="text-muted-foreground mr-2">
                    [{formatTimestamp(log.timestamp)}]
                  </span>
                  <span className="text-muted-foreground mr-2">
                    {log.type === "stderr" ? "[ERR]" : "[OUT]"}
                  </span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
