import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CheckCircle2, Terminal, Globe, Palette, Clock, Cpu } from "lucide-react";
import type { OnboardingState } from "../onboarding-flow";
import { GatewayClient } from "../../../core/gateway/client";

interface AgentStepProps {
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
  gatewayClient: GatewayClient | null;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  terminal: <Terminal className="h-4 w-4" />,
  browser: <Globe className="h-4 w-4" />,
  canvas: <Palette className="h-4 w-4" />,
  cron: <Clock className="h-4 w-4" />,
  device: <Cpu className="h-4 w-4" />,
};

export function AgentStep({
  state,
  onUpdate,
  onNext,
  onBack,
  gatewayClient,
}: AgentStepProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    if (!gatewayClient || !gatewayClient.isConnected()) {
      setLoading(false);
      return;
    }

    try {
      const response = await gatewayClient.request("agents.list");
      const agents = (response.ok && response.result ? (response.result as { agents: string[] }).agents : []) || [];
      
      onUpdate({
        agent: {
          agents,
          agentId: agents.length > 0 ? agents[0] : null,
        },
      });
    } catch (error) {
      console.error("Failed to load agents:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAgentSelect = (agentId: string) => {
    onUpdate({
      agent: { ...state.agent, agentId },
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">Select Your Agent</h2>
          <p className="text-muted-foreground">Loading available agents...</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Select Your Agent</h1>
        <p className="text-muted-foreground">
          Choose which agent configuration to use for your sessions.
        </p>
      </div>

      {state.agent.agents.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8 space-y-4">
              <div className="text-muted-foreground">No agents available</div>
              <p className="text-sm text-muted-foreground">
                The default agent "zuckerman" should be available. Make sure the gateway is running
                and agents are configured.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Available Agents</CardTitle>
            <CardDescription>
              Select an agent configuration to use
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={state.agent.agentId || ""}
              onValueChange={handleAgentSelect}
              className="space-y-3"
            >
              {state.agent.agents.map((agentId) => (
                <label
                  key={agentId}
                  className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <RadioGroupItem value={agentId} id={agentId} className="mt-1" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{agentId}</div>
                    {agentId === "zuckerman" && (
                      <div className="text-sm text-muted-foreground mt-1">
                        Base agent configuration (recommended)
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {["terminal", "browser", "canvas", "cron", "device"].map((tool) => (
                        <div
                          key={tool}
                          className="flex items-center gap-1 text-xs text-muted-foreground"
                        >
                          {TOOL_ICONS[tool]}
                          <span className="capitalize">{tool}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {state.agent.agentId && (
        <Card>
          <CardHeader>
            <CardTitle>Agent Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-sm font-medium">Name:</span>
              <span className="text-sm text-muted-foreground ml-2">{state.agent.agentId}</span>
            </div>
            <div>
              <span className="text-sm font-medium">Tools Available:</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {["terminal", "browser", "canvas", "cron", "nodes"].map((tool) => (
                  <div
                    key={tool}
                    className="flex items-center gap-1 px-2 py-1 rounded bg-muted text-xs"
                  >
                    {TOOL_ICONS[tool]}
                    <span className="capitalize">{tool}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!state.agent.agentId}>
          Next
        </Button>
      </div>
    </div>
  );
}
