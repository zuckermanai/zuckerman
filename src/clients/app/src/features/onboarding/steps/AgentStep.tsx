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
      <div className="max-w-[800px] mx-auto flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-[#58a6ff]" />
        <p className="text-sm text-[#8b949e]">Scanning for available agents...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#c9d1d9] mb-2">
          Select Your Agent
        </h1>
        <p className="text-[#8b949e]">
          Choose which agent configuration to use for your conversations.
        </p>
      </div>

      <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
        <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
          <h2 className="text-base font-semibold text-[#c9d1d9]">Available Agents</h2>
          <p className="text-xs text-[#8b949e] mt-1">
            Configurations detected on your gateway
          </p>
        </div>
        <div className="p-6 bg-[#0d1117]">
          {state.agent.agents.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <Terminal className="h-10 w-10 text-[#30363d] mx-auto" />
              <div className="space-y-1">
                <div className="font-semibold text-[#c9d1d9]">No agents found</div>
                <p className="text-xs text-[#8b949e] max-w-[300px] mx-auto">
                  Make sure your gateway is running and has agent configurations in `config.json` or the `src/agents/` directory.
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadAgents}
                className="mt-4 border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d]"
              >
                Refresh List
              </Button>
            </div>
          ) : (
            <RadioGroup
              value={state.agent.agentId || ""}
              onValueChange={handleAgentSelect}
              className="space-y-3"
            >
              {state.agent.agents.map((agentId) => (
                <label
                  key={agentId}
                  className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
                    state.agent.agentId === agentId 
                      ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                      : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
                  }`}
                >
                  <RadioGroupItem value={agentId} id={agentId} className="mt-1" />
                  <div className="flex-1">
                    <div className="font-semibold text-sm text-[#c9d1d9] flex items-center gap-2">
                      {agentId}
                      {agentId === "zuckerman" && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-[#238636]/10 text-[#3fb950] border border-[#238636]/20">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#8b949e] mt-1">
                      Full-featured agent with multi-tool capabilities.
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3">
                      {["terminal", "browser", "canvas", "cron"].map((tool) => (
                        <div
                          key={tool}
                          className="flex items-center gap-1.5 text-[11px] text-[#8b949e]"
                        >
                          <span className="text-[#58a6ff]">{TOOL_ICONS[tool]}</span>
                          <span className="capitalize">{tool}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-6 border-t border-[#30363d]">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="text-[#8b949e] hover:text-[#c9d1d9]"
        >
          Back
        </Button>
        <Button 
          onClick={onNext} 
          disabled={!state.agent.agentId}
          className="bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636]"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
