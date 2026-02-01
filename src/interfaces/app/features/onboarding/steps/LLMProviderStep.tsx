import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import type { OnboardingState } from "../onboarding-flow";
import { GatewayClient } from "../../../infrastructure/gateway/client";

interface LLMProviderStepProps {
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
  gatewayClient: GatewayClient | null;
}

export function LLMProviderStep({
  state,
  onUpdate,
  onNext,
  onBack,
  gatewayClient,
}: LLMProviderStepProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);

  const validateApiKey = (key: string, provider: string): boolean => {
    if (provider === "anthropic") {
      return key.startsWith("sk-ant-");
    } else if (provider === "openai") {
      return key.startsWith("sk-");
    } else if (provider === "openrouter") {
      return key.startsWith("sk-or-");
    }
    return false;
  };

  const testApiKey = async () => {
    if (!state.llmProvider.provider || !state.llmProvider.apiKey) return;

    if (state.llmProvider.provider === "mock") {
      onUpdate({
        llmProvider: { ...state.llmProvider, validated: true },
      });
      return;
    }

    if (!validateApiKey(state.llmProvider.apiKey, state.llmProvider.provider)) {
      onUpdate({
        llmProvider: {
          ...state.llmProvider,
          validated: false,
          error: "Invalid API key format",
        },
      });
      return;
    }

    setTesting(true);
    onUpdate({
      llmProvider: { ...state.llmProvider, error: undefined },
    });

    try {
      // In a real implementation, you'd test the API key via gateway
      // For now, we'll just validate format
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      onUpdate({
        llmProvider: {
          ...state.llmProvider,
          validated: true,
          error: undefined,
        },
      });
    } catch (error: any) {
      onUpdate({
        llmProvider: {
          ...state.llmProvider,
          validated: false,
          error: error.message || "API key validation failed",
        },
      });
    } finally {
      setTesting(false);
    }
  };

  const handleProviderChange = (provider: "anthropic" | "openai" | "openrouter" | "mock") => {
    onUpdate({
      llmProvider: {
        provider,
        apiKey: "",
        validated: false,
        error: undefined,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Choose Your LLM Provider</h1>
        <p className="text-muted-foreground">
          Select which AI model provider you want to use for your agent.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Provider Selection</CardTitle>
          <CardDescription>
            Choose your preferred AI model provider
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={state.llmProvider.provider || ""}
            onValueChange={(value) =>
              handleProviderChange(value as "anthropic" | "openai" | "openrouter" | "mock")
            }
            className="space-y-3"
          >
            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="anthropic" id="anthropic" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm">Anthropic (Claude)</div>
                <div className="text-sm text-muted-foreground">
                  Recommended for best performance and reliability
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="openai" id="openai" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm">OpenAI (GPT)</div>
                <div className="text-sm text-muted-foreground">
                  Widely compatible with many applications
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="openrouter" id="openrouter" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm">OpenRouter</div>
                <div className="text-sm text-muted-foreground">
                  Access to multiple AI models from one API
                </div>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="mock" id="mock" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm">Mock (Testing)</div>
                <div className="text-sm text-muted-foreground">
                  For development and testing only
                </div>
              </div>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {state.llmProvider.provider && state.llmProvider.provider !== "mock" && (
        <Card>
          <CardHeader>
            <CardTitle>API Key Configuration</CardTitle>
            <CardDescription>
              Enter your API key for {
                state.llmProvider.provider === "anthropic" ? "Anthropic" :
                state.llmProvider.provider === "openai" ? "OpenAI" :
                state.llmProvider.provider === "openrouter" ? "OpenRouter" :
                ""
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  value={state.llmProvider.apiKey}
                  onChange={(e) =>
                    onUpdate({
                      llmProvider: {
                        ...state.llmProvider,
                        apiKey: e.target.value,
                        validated: false,
                      },
                    })
                  }
                  placeholder={
                    state.llmProvider.provider === "anthropic"
                      ? "sk-ant-..."
                      : state.llmProvider.provider === "openrouter"
                      ? "sk-or-..."
                      : "sk-..."
                  }
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your API key is stored securely and never sent to our servers.
              </p>
            </div>
            <Button 
              onClick={testApiKey} 
              disabled={testing || !state.llmProvider.apiKey} 
              className="w-full"
            >
              {testing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing API key...
                </>
              ) : (
                "Test API key"
              )}
            </Button>

            {state.llmProvider.validated && (
              <div className="flex items-center gap-2 text-sm text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                <span>API key validated successfully</span>
              </div>
            )}

            {state.llmProvider.error && !testing && (
              <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="font-medium">Validation failed</div>
                  <div className="text-muted-foreground mt-1">{state.llmProvider.error}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {state.llmProvider.provider === "mock" && (
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm">Mock provider selected</div>
                <div className="text-sm text-muted-foreground">
                  The mock provider is for testing only and will not make real API calls.
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
        <Button
          onClick={onNext}
          disabled={
            !state.llmProvider.provider ||
            (state.llmProvider.provider !== "mock" && !state.llmProvider.validated)
          }
        >
          Next
        </Button>
      </div>
    </div>
  );
}
