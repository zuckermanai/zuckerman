import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { JsonViewer } from "@/components/json-viewer";

interface RequestHistory {
  id: string;
  method: string;
  params: Record<string, unknown>;
  response?: {
    ok: boolean;
    result?: unknown;
    error?: { code: string; message: string };
  };
  timestamp: number;
}

interface RequestHistoryItemProps {
  request: RequestHistory;
}

const formatTimestamp = (ts: number) => {
  return new Date(ts).toLocaleTimeString();
};

export function RequestHistoryItem({ request }: RequestHistoryItemProps) {
  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-mono text-sm font-medium">{request.method}</div>
          <div className="text-xs text-muted-foreground">
            {formatTimestamp(request.timestamp)}
          </div>
        </div>

        {Object.keys(request.params).length > 0 && (
          <JsonViewer data={request.params} title="Request Parameters" />
        )}

        {request.response && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  request.response.ok ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-xs font-medium">
                {request.response.ok ? "Success" : "Error"}
              </span>
            </div>
            {request.response.ok ? (
              <JsonViewer
                data={request.response.result}
                title="Response"
                defaultExpanded={true}
              />
            ) : (
              <JsonViewer
                data={request.response.error}
                title="Error"
                defaultExpanded={true}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
