import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, X } from "lucide-react";
import { GatewayClient } from "../../../infrastructure/gateway/client";
import { RequestHistoryItem } from "./components/request-history-item";
import { ErrorMessage } from "./components/error-message";

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

export function InspectorView({ gatewayClient, onClose }: GatewayInspectorProps) {
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

          {error && <ErrorMessage message={error} />}

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
            <RequestHistoryItem key={req.id} request={req} />
          ))}
        </div>
      )}
    </div>
  );
}
