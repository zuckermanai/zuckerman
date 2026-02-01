import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { JsonViewer } from "./json-viewer";
import { Send, Loader2, AlertCircle, X } from "lucide-react";
import { GatewayClient } from "../core/gateway/client";

interface GatewayInspectorProps {
  gatewayClient: GatewayClient | null;
  onClose?: () => void;
}

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

export function GatewayInspector({ gatewayClient, onClose }: GatewayInspectorProps) {
  const [method, setMethod] = useState("");
  const [paramsJson, setParamsJson] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<RequestHistory[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!gatewayClient || !method.trim()) {
      setError("Gateway client not connected or method is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let params: Record<string, unknown> = {};
      if (paramsJson.trim()) {
        params = JSON.parse(paramsJson);
      }

      const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const request: RequestHistory = {
        id: requestId,
        method,
        params,
        timestamp: Date.now(),
      };

      setHistory((prev) => [request, ...prev]);

      const response = await gatewayClient.request(method, params);

      setHistory((prev) =>
        prev.map((req) =>
          req.id === requestId
            ? { ...req, response: { ok: response.ok, result: response.result, error: response.error } }
            : req
        )
      );
    } catch (err: any) {
      setError(err.message || "Request failed");
      const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      setHistory((prev) => [
        {
          id: requestId,
          method,
          params: paramsJson ? JSON.parse(paramsJson) : {},
          response: {
            ok: false,
            error: { code: "ERROR", message: err.message || "Unknown error" },
          },
          timestamp: Date.now(),
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleTimeString();
  };

  return (
    <div className="space-y-4 p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Gateway Inspector</CardTitle>
              <CardDescription>
                Send JSON requests to the gateway and view responses
              </CardDescription>
            </div>
            {onClose && (
              <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="method">Method</Label>
            <Input
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="e.g., agents.list, sessions.get, health"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="params">Parameters (JSON)</Label>
            <Textarea
              id="params"
              value={paramsJson}
              onChange={(e) => setParamsJson(e.target.value)}
              placeholder='{"id": "session-id"}'
              className="font-mono text-sm min-h-[100px]"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm text-destructive">{error}</div>
            </div>
          )}

          <Button
            onClick={handleSend}
            disabled={loading || !gatewayClient?.isConnected() || !method.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Request
              </>
            )}
          </Button>

          {!gatewayClient?.isConnected() && (
            <div className="text-sm text-muted-foreground text-center">
              Gateway not connected
            </div>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Request History</h3>
          {history.map((req) => (
            <Card key={req.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm font-medium">{req.method}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatTimestamp(req.timestamp)}
                  </div>
                </div>

                {Object.keys(req.params).length > 0 && (
                  <JsonViewer data={req.params} title="Request Parameters" />
                )}

                {req.response && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          req.response.ok ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <span className="text-xs font-medium">
                        {req.response.ok ? "Success" : "Error"}
                      </span>
                    </div>
                    {req.response.ok ? (
                      <JsonViewer
                        data={req.response.result}
                        title="Response"
                        defaultExpanded={true}
                      />
                    ) : (
                      <JsonViewer
                        data={req.response.error}
                        title="Error"
                        defaultExpanded={true}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
