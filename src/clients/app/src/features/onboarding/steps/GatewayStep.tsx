import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertCircle, Terminal } from "lucide-react";
import type { OnboardingState } from "../onboarding-flow";
import { GatewayClient } from "../../core/gateway/client";

interface GatewayStepProps {
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
  gatewayClient: GatewayClient | null;
}

export function GatewayStep({ state, onUpdate, onNext, onBack, gatewayClient }: GatewayStepProps) {
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    // Auto-test connection on mount
    if (!state.gateway.connected && !testing) {
      testConnection();
    }
  }, []);

  const testConnection = async () => {
    setTesting(true);
    onUpdate({
      gateway: { ...state.gateway, error: undefined },
    });

    try {
      const testClient = new GatewayClient({
        host: state.gateway.host,
        port: state.gateway.port,
      });

      await testClient.connect();
      
      // Test health endpoint
      try {
        await testClient.request("health.check");
        testClient.disconnect();
        onUpdate({
          gateway: {
            ...state.gateway,
            connected: true,
            error: undefined,
          },
        });
      } catch (e) {
        testClient.disconnect();
        throw e;
      }
    } catch (error: any) {
      onUpdate({
        gateway: {
          ...state.gateway,
          connected: false,
          error: error.message || "Connection failed",
        },
      });
    } finally {
      setTesting(false);
    }
  };

  const handleHostChange = (host: string) => {
    onUpdate({
      gateway: { ...state.gateway, host, connected: false },
    });
  };

  const handlePortChange = (port: string) => {
    const portNum = parseInt(port, 10);
    if (!isNaN(portNum) && portNum > 0 && portNum <= 65535) {
      onUpdate({
        gateway: { ...state.gateway, port: portNum, connected: false },
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Connect to Gateway</h1>
        <p className="text-muted-foreground">
          The gateway is the control plane that manages your agents and conversations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection Settings</CardTitle>
          <CardDescription>
            Configure how to connect to your gateway server
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gateway-host">Host</Label>
            <Input
              id="gateway-host"
              value={state.gateway.host}
              onChange={(e) => handleHostChange(e.target.value)}
              placeholder="127.0.0.1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gateway-port">Port</Label>
            <Input
              id="gateway-port"
              type="number"
              value={state.gateway.port}
              onChange={(e) => handlePortChange(e.target.value)}
              placeholder="18789"
              min="1"
              max="65535"
            />
          </div>
          <Button 
            onClick={testConnection} 
            disabled={testing} 
            className="w-full"
          >
            {testing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing connection...
              </>
            ) : (
              "Test connection"
            )}
          </Button>

          {state.gateway.connected && (
            <div className="flex items-center gap-2 text-sm text-green-500">
              <CheckCircle2 className="h-4 w-4" />
              <span>Connected successfully</span>
            </div>
          )}

          {state.gateway.error && !testing && (
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-medium">Connection failed</div>
                <div className="text-muted-foreground mt-1">{state.gateway.error}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!state.gateway.connected && (
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Terminal className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="font-medium text-sm">Gateway not running?</div>
                <div className="text-sm text-muted-foreground">
                  Start the gateway server from your terminal:
                </div>
                <code className="block text-xs bg-muted px-3 py-2 rounded mt-2 font-mono">
                  npm run gateway
                </code>
                <div className="text-xs text-muted-foreground mt-2">
                  Or run: <code className="bg-muted px-1.5 py-0.5 rounded font-mono">zuckerman gateway start</code>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!state.gateway.connected}>
          Next
        </Button>
      </div>
    </div>
  );
}
