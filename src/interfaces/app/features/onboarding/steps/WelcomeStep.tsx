import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import logo from "@/assets/logo.png";

interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onNext, onSkip }: WelcomeStepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-3">
        <div className="flex justify-center">
          <img src={logo} alt="Zuckerman" className="h-20 w-20" />
        </div>
        <h1 className="text-2xl font-semibold">Welcome to Zuckerman</h1>
        <p className="text-muted-foreground">
          AI Personal Agent Platform. Let's get you set up in a few simple steps.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What we'll set up</CardTitle>
          <CardDescription>
            We'll guide you through configuring your environment
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium text-sm">Configure LLM Provider</div>
              <div className="text-sm text-muted-foreground">
                Choose your AI model provider and add API key
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium text-sm">Connect Chat Channel</div>
              <div className="text-sm text-muted-foreground">
                Choose how you want to chat (WhatsApp, Telegram, etc.)
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium text-sm">Select Your Agent</div>
              <div className="text-sm text-muted-foreground">
                Choose or create an agent configuration
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-1">
              <div className="font-medium text-sm text-muted-foreground">Security Settings</div>
              <div className="text-sm text-muted-foreground">
                Optional: Configure sandbox and tool restrictions
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onSkip}>
          Skip setup
        </Button>
        <Button onClick={onNext}>
          Get started
        </Button>
      </div>
    </div>
  );
}
