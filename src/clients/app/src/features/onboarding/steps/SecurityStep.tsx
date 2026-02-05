import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import type { OnboardingState } from "../onboarding-flow";

interface SecurityStepProps {
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
}

const AVAILABLE_TOOLS = [
  { id: "terminal", label: "Terminal", description: "Execute shell commands" },
  { id: "browser", label: "Browser", description: "Web browsing and automation" },
  { id: "filesystem", label: "Filesystem", description: "Read and write files" },
  { id: "cron", label: "Cron", description: "Scheduled tasks" },
];

export function SecurityStep({ state, onUpdate, onNext, onBack }: SecurityStepProps) {
  const handleSandboxChange = (value: string) => {
    onUpdate({
      security: {
        ...state.security,
        sandboxMode: value as "off" | "non-main" | "all",
      },
    });
  };

  const handleToolToggle = (toolId: string) => {
    const enabled = state.security.enabledTools.includes(toolId);
    onUpdate({
      security: {
        ...state.security,
        enabledTools: enabled
          ? state.security.enabledTools.filter((t) => t !== toolId)
          : [...state.security.enabledTools, toolId],
      },
    });
  };

  const handleDeniedCommandsChange = (value: string) => {
    onUpdate({
      security: {
        ...state.security,
        deniedCommands: value,
      },
    });
  };

  const useDefaults = () => {
    onUpdate({
      security: {
        sandboxMode: "all",
        enabledTools: AVAILABLE_TOOLS.map((tool) => tool.id),
        deniedCommands: "rm,sudo,format",
      },
    });
  };

  const handleEnableAllTools = () => {
    onUpdate({
      security: {
        ...state.security,
        enabledTools: AVAILABLE_TOOLS.map((tool) => tool.id),
      },
    });
  };

  return (
    <div className="max-w-[800px] mx-auto space-y-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#c9d1d9] mb-2">
          Security Configuration
        </h1>
        <p className="text-[#8b949e]">
          Configure how your agent interacts with your system and restrict its capabilities.
        </p>
      </div>

      <div className="space-y-6">
        {/* Sandbox Mode */}
        <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
          <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
            <h2 className="text-base font-semibold text-[#c9d1d9]">Sandbox Mode</h2>
            <p className="text-xs text-[#8b949e] mt-1">
              Control how commands are executed
            </p>
          </div>
          <div className="p-6 bg-[#0d1117]">
            <RadioGroup
              value={state.security.sandboxMode}
              onValueChange={handleSandboxChange}
              className="space-y-3"
            >
              <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
                state.security.sandboxMode === "off" 
                  ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                  : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
              }`}>
                <RadioGroupItem value="off" id="sandbox-off" className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-sm text-[#c9d1d9]">Direct Execution (Off)</div>
                  <div className="text-xs text-[#8b949e] mt-1">
                    Run commands directly on your host system. Use only with trusted agents.
                  </div>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
                state.security.sandboxMode === "all" 
                  ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                  : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
              }`}>
                <RadioGroupItem value="all" id="sandbox-all" className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-sm text-[#c9d1d9]">Docker Sandbox (Recommended)</div>
                  <div className="text-xs text-[#8b949e] mt-1">
                    All commands run in an isolated Docker container for maximum security.
                  </div>
                </div>
              </label>
            </RadioGroup>
          </div>
        </div>

        {/* Tool Restrictions */}
        <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
          <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22] flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#c9d1d9]">Tool Restrictions</h2>
              <p className="text-xs text-[#8b949e] mt-1">
                Select which tools your agent can use
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnableAllTools}
              className="text-xs bg-[#21262d] border-[#30363d] text-[#c9d1d9]"
            >
              Enable All
            </Button>
          </div>
          <div className="p-6 bg-[#0d1117]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {AVAILABLE_TOOLS.map((tool) => (
                <label
                  key={tool.id}
                  className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-all ${
                    state.security.enabledTools.includes(tool.id)
                      ? "border-[#1f6feb]/50 bg-[#1f6feb]/5"
                      : "border-[#30363d] bg-[#161b22]"
                  }`}
                >
                  <Checkbox
                    checked={state.security.enabledTools.includes(tool.id)}
                    onCheckedChange={() => handleToolToggle(tool.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-sm text-[#c9d1d9]">{tool.label}</div>
                    <div className="text-[11px] text-[#8b949e] leading-relaxed">{tool.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Command Restrictions */}
        <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
          <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
            <h2 className="text-base font-semibold text-[#c9d1d9]">Command Restrictions</h2>
            <p className="text-xs text-[#8b949e] mt-1">
              Prevent execution of dangerous shell commands
            </p>
          </div>
          <div className="p-6 space-y-6 bg-[#0d1117]">
            <div className="space-y-2">
              <Label htmlFor="denied-commands" className="text-sm font-semibold text-[#c9d1d9]">
                Deny List (Comma separated)
              </Label>
              <Input
                id="denied-commands"
                value={state.security.deniedCommands}
                onChange={(e) => handleDeniedCommandsChange(e.target.value)}
                placeholder="rm,sudo,format"
                className="bg-[#0d1117] border-[#30363d] focus:border-[#1f6feb] focus:ring-1 focus:ring-[#1f6feb]"
              />
              <p className="text-[11px] text-[#8b949e]">
                Examples: <code className="bg-[#21262d] px-1 rounded">rm</code>, <code className="bg-[#21262d] px-1 rounded">sudo</code>, <code className="bg-[#21262d] px-1 rounded">format</code>, <code className="bg-[#21262d] px-1 rounded">mv</code>
              </p>
            </div>
            <div className="pt-4 border-t border-[#30363d]">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={useDefaults}
                className="bg-[#21262d] border-[#30363d] text-[#c9d1d9]"
              >
                Restore recommended defaults
              </Button>
            </div>
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
            className="bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636]"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
