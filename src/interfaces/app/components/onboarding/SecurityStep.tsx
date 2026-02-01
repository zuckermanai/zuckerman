import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import type { OnboardingState } from "../../features/onboarding/onboarding-flow";

interface SecurityStepProps {
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
}

const AVAILABLE_TOOLS = [
  { id: "terminal", label: "Terminal", description: "Execute shell commands" },
  { id: "browser", label: "Browser", description: "Web browsing and automation" },
  { id: "canvas", label: "Canvas", description: "UI rendering and interaction" },
  { id: "cron", label: "Cron", description: "Scheduled tasks" },
  { id: "device", label: "Device", description: "Device access and control" },
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
          ? state.security.enabledTools.filter((t: string) => t !== toolId)
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
        enabledTools: ["terminal", "browser", "canvas"],
        deniedCommands: "rm,sudo,format",
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Security Configuration</h1>
        <p className="text-muted-foreground">
          Optional: Configure security settings for your agent. You can change these later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sandbox Mode</CardTitle>
          <CardDescription>
            Control how commands are executed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={state.security.sandboxMode}
            onValueChange={handleSandboxChange}
            className="space-y-3"
          >
            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="off" id="sandbox-off" className="mt-1" />
              <div className="flex-1">
                <div className="font-medium text-sm">Off</div>
                <div className="text-sm text-muted-foreground">
                  Run commands directly on host system (less secure)
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="non-main" id="sandbox-non-main" className="mt-1" />
              <div className="flex-1">
                <div className="font-medium text-sm">Non-main sessions only</div>
                <div className="text-sm text-muted-foreground">
                  Sandbox non-main sessions, run main sessions on host
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="all" id="sandbox-all" className="mt-1" />
              <div className="flex-1">
                <div className="font-medium text-sm">All sessions</div>
                <div className="text-sm text-muted-foreground">
                  All commands run in Docker sandbox (recommended)
                </div>
              </div>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tool Restrictions</CardTitle>
          <CardDescription>
            Select which tools your agent can use
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {AVAILABLE_TOOLS.map((tool) => (
              <label
                key={tool.id}
                className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  checked={state.security.enabledTools.includes(tool.id)}
                  onCheckedChange={() => handleToolToggle(tool.id)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-medium text-sm">{tool.label}</div>
                  <div className="text-sm text-muted-foreground">{tool.description}</div>
                </div>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Command Restrictions</CardTitle>
          <CardDescription>
            Commands to deny (comma-separated)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="denied-commands">Deny List</Label>
            <Input
              id="denied-commands"
              value={state.security.deniedCommands}
              onChange={(e) => handleDeniedCommandsChange(e.target.value)}
              placeholder="rm,sudo,format"
            />
            <p className="text-xs text-muted-foreground">
              Commands that will be blocked from execution
            </p>
          </div>
          <Button variant="outline" onClick={useDefaults} className="w-full">
            Use recommended defaults
          </Button>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        You can change these settings later in Settings → Security
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  );
}
