import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import type { OnboardingState } from "../onboarding-flow";
import logo from "@/assets/logo.png";

interface CompleteStepProps {
  state: OnboardingState;
  onComplete: () => void;
  onBack: () => void;
}

export function CompleteStep({ state, onComplete, onBack }: CompleteStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <img src={logo} alt="Zuckerman" className="h-20 w-20" />
        </div>
        <h1 className="text-2xl font-semibold">Setup Complete!</h1>
        <p className="text-muted-foreground">
          Your Zuckerman environment is ready to use.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Summary</CardTitle>
          <CardDescription>
            Here's what we've configured for you
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm">LLM Provider</div>
              <div className="text-sm text-muted-foreground">
                {state.llmProvider.provider === "anthropic"
                  ? "Anthropic (Claude)"
                  : state.llmProvider.provider === "openai"
                  ? "OpenAI (GPT)"
                  : state.llmProvider.provider === "openrouter"
                  ? "OpenRouter"
                  : "Mock"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm">Chat Channel</div>
              <div className="text-sm text-muted-foreground">
                {state.channel.type === "none"
                  ? "None selected"
                  : state.channel.type.charAt(0).toUpperCase() + state.channel.type.slice(1)}
                {state.channel.connected && " (Connected)"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm">Agent</div>
              <div className="text-sm text-muted-foreground">
                {state.agent.agentId || "Not selected"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-sm">Security</div>
              <div className="text-sm text-muted-foreground">
                Sandbox: {state.security.sandboxMode === "all" ? "All sessions" : state.security.sandboxMode === "non-main" ? "Non-main only" : "Off"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What's Next?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span>Start chatting with your agent</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span>Explore agent configuration files</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span>Customize tools and skills</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground mt-0.5">•</span>
              <span>Read the documentation</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onComplete}>
          Start using Zuckerman
        </Button>
      </div>
    </div>
  );
}
