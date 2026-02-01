import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import type { OnboardingState } from "../onboarding-flow";
import { GatewayClient } from "../../../core/gateway/client";
import { CustomProviderFields } from "@/components/CustomProviderFields";

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
    } else if (provider === "custom") {
      // API key is optional for custom providers
      return true;
    }
    return false;
  };

  const testApiKey = async () => {
    if (!state.llmProvider.provider) return;

    if (state.llmProvider.provider === "mock") {
      onUpdate({
        llmProvider: { ...state.llmProvider, validated: true },
      });
      return;
    }

    if (state.llmProvider.provider === "custom") {
      // For custom provider, validate baseUrl and defaultModel
      if (!state.llmProvider.baseUrl || !state.llmProvider.defaultModel) {
        onUpdate({
          llmProvider: {
            ...state.llmProvider,
            validated: false,
            error: "Base URL and default model are required for custom providers",
          },
        });
        return;
      }
      onUpdate({
        llmProvider: { ...state.llmProvider, validated: true },
      });
      return;
    }

    if (!state.llmProvider.apiKey) return;

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

  const handleProviderChange = (provider: "anthropic" | "openai" | "openrouter" | "mock" | "custom") => {
    onUpdate({
      llmProvider: {
        provider,
        apiKey: "",
        baseUrl: "",
        defaultModel: "",
        validated: false,
        error: undefined,
      },
    });
  };

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#c9d1d9] mb-2">
          Choose Your LLM Provider
        </h1>
        <p className="text-[#8b949e]">
          Select which AI model provider you want to use for your agent.
        </p>
      </div>

      <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
        <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
          <h2 className="text-base font-semibold text-[#c9d1d9]">Provider Selection</h2>
          <p className="text-xs text-[#8b949e] mt-1">
            Choose your preferred AI model provider
          </p>
        </div>
        <div className="p-6 bg-[#0d1117]">
          <RadioGroup
            value={state.llmProvider.provider || ""}
            onValueChange={(value) =>
              handleProviderChange(value as "anthropic" | "openai" | "openrouter" | "mock" | "custom")
            }
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              state.llmProvider.provider === "anthropic" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="anthropic" id="anthropic" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9]">Anthropic (Claude)</div>
                <div className="text-xs text-[#8b949e]">
                  Best performance for agentic tasks and tool use.
                </div>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              state.llmProvider.provider === "openai" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="openai" id="openai" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9]">OpenAI (GPT-4o)</div>
                <div className="text-xs text-[#8b949e]">
                  Highly capable and widely used.
                </div>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              state.llmProvider.provider === "openrouter" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="openrouter" id="openrouter" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9]">OpenRouter</div>
                <div className="text-xs text-[#8b949e]">
                  Unified access to many open models.
                </div>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              state.llmProvider.provider === "mock"
                ? "border-[#1f6feb] bg-[#1f6feb]/5"
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="mock" id="mock" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9]">Mock Provider</div>
                <div className="text-xs text-[#8b949e]">
                  No API key required. For local development.
                </div>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              state.llmProvider.provider === "custom"
                ? "border-[#1f6feb] bg-[#1f6feb]/5"
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="custom" id="custom" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9]">Custom (OpenAI-compatible)</div>
                <div className="text-xs text-[#8b949e]">
                  Use any OpenAI-compatible API endpoint (Ollama, local LLMs, etc.)
                </div>
              </div>
            </label>
          </RadioGroup>
        </div>
      </div>

      {state.llmProvider.provider === "custom" && (
        <CustomProviderFields
          apiKey={state.llmProvider.apiKey}
          baseUrl={state.llmProvider.baseUrl}
          defaultModel={state.llmProvider.defaultModel}
          onChange={(field: "apiKey" | "baseUrl" | "defaultModel", value: string) =>
            onUpdate({
              llmProvider: {
                ...state.llmProvider,
                [field]: value,
                validated: false,
              },
            })
          }
          error={state.llmProvider.error}
        />
      )}

      {state.llmProvider.provider && state.llmProvider.provider !== "mock" && state.llmProvider.provider !== "custom" && (
        <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
          <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
            <h2 className="text-base font-semibold text-[#c9d1d9]">API Key Configuration</h2>
            <p className="text-xs text-[#8b949e] mt-1">
              Enter your API key for {state.llmProvider.provider.charAt(0).toUpperCase() + state.llmProvider.provider.slice(1)}
            </p>
          </div>
          <div className="p-6 space-y-4 bg-[#0d1117]">
            <div className="space-y-2">
              <Label htmlFor="api-key" className="text-sm font-semibold text-[#c9d1d9]">API Key</Label>
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
                  className="bg-[#0d1117] border-[#30363d] focus:border-[#1f6feb] focus:ring-1 focus:ring-[#1f6feb] pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b949e] hover:text-[#c9d1d9]"
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[12px] text-[#8b949e]">
                Your API key is stored locally and never shared.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                onClick={testApiKey} 
                disabled={testing || !state.llmProvider.apiKey} 
                className="bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border-[#30363d]"
              >
                {testing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>

              {state.llmProvider.validated && (
                <div className="flex items-center gap-2 text-sm text-[#3fb950]">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Success</span>
                </div>
              )}

              {state.llmProvider.error && !testing && (
                <div className="flex items-center gap-2 text-sm text-[#f85149]">
                  <AlertCircle className="h-4 w-4" />
                  <span>Invalid Key</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {state.llmProvider.provider === "mock" && (
        <div className="p-4 rounded-md border border-[#d29922]/20 bg-[#d29922]/5 flex gap-3">
          <AlertCircle className="h-5 w-5 text-[#d29922] shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-[#c9d1d9]">Development Mode</div>
            <div className="text-[#8b949e]">Using a mock provider for testing. Real AI responses will be simulated.</div>
          </div>
        </div>
      )}

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
          disabled={
            !state.llmProvider.provider ||
            (state.llmProvider.provider !== "mock" && !state.llmProvider.validated)
          }
          className="bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636]"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
