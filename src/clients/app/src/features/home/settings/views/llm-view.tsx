import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { CustomProviderFields } from "@/components/CustomProviderFields";

interface LLMViewProps {
  llmProvider: {
    provider: "anthropic" | "openai" | "openrouter" | "mock" | "custom" | null;
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
    validated: boolean;
    error?: string;
  };
  testingApiKey: boolean;
  onProviderChange: (provider: "anthropic" | "openai" | "openrouter" | "mock" | "custom") => void;
  onApiKeyChange: (apiKey: string) => void;
  onCustomConfigChange?: (config: { baseUrl?: string; defaultModel?: string }) => void;
  onTestApiKey: () => void;
}

export function LLMView({
  llmProvider,
  testingApiKey,
  onProviderChange,
  onApiKeyChange,
  onCustomConfigChange,
  onTestApiKey,
}: LLMViewProps) {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <React.Fragment>
      <div className="border border-border rounded-md bg-card">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Provider Selection</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose your preferred AI model provider
          </p>
        </div>
        <div className="px-6 py-4">
          <RadioGroup
            value={llmProvider.provider || ""}
            onValueChange={(value) =>
              onProviderChange(value as "anthropic" | "openai" | "openrouter" | "mock" | "custom")
            }
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              llmProvider.provider === "anthropic" 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-muted-foreground bg-card"
            }`}>
              <RadioGroupItem value="anthropic" id="anthropic" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-foreground">Anthropic (Claude)</div>
                <div className="text-xs text-muted-foreground">
                  Best performance for agentic tasks and tool use.
                </div>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              llmProvider.provider === "openai" 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-muted-foreground bg-card"
            }`}>
              <RadioGroupItem value="openai" id="openai" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-foreground">OpenAI (GPT-4o)</div>
                <div className="text-xs text-muted-foreground">
                  Highly capable and widely used.
                </div>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              llmProvider.provider === "openrouter" 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-muted-foreground bg-card"
            }`}>
              <RadioGroupItem value="openrouter" id="openrouter" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-foreground">OpenRouter</div>
                <div className="text-xs text-muted-foreground">
                  Unified access to many open models.
                </div>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              llmProvider.provider === "mock" 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-muted-foreground bg-card"
            }`}>
              <RadioGroupItem value="mock" id="mock" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-foreground">Mock Provider</div>
                <div className="text-xs text-muted-foreground">
                  No API key required. For local development.
                </div>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              llmProvider.provider === "custom" 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-muted-foreground bg-card"
            }`}>
              <RadioGroupItem value="custom" id="custom" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-foreground">Custom (OpenAI-compatible)</div>
                <div className="text-xs text-muted-foreground">
                  Connect to any OpenAI-compatible API endpoint.
                </div>
              </div>
            </label>
          </RadioGroup>
        </div>
      </div>

      {llmProvider.provider && llmProvider.provider !== "mock" && (
        <div className="border border-border rounded-md bg-card">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-base font-semibold text-foreground">API Key Configuration</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your API key for {llmProvider.provider.charAt(0).toUpperCase() + llmProvider.provider.slice(1)}
            </p>
          </div>
          <div className="px-6 py-4 space-y-4">
            {llmProvider.provider === "custom" && onCustomConfigChange && (
              <CustomProviderFields
                baseUrl={llmProvider.baseUrl || ""}
                defaultModel={llmProvider.defaultModel || ""}
                onChange={onCustomConfigChange}
                errors={llmProvider.error ? { general: llmProvider.error } : undefined}
              />
            )}
            <div className="space-y-2">
              <Label htmlFor="api-key" className="text-sm font-semibold text-foreground">API Key</Label>
              <div className="relative">
                <Input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  value={llmProvider.apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  placeholder={
                    llmProvider.provider === "anthropic"
                      ? "sk-ant-..."
                      : llmProvider.provider === "openrouter"
                      ? "sk-or-..."
                      : llmProvider.provider === "custom"
                      ? "Enter your API key..."
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
                Your API key is stored locally and never shared.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                onClick={onTestApiKey} 
                disabled={testingApiKey || !llmProvider.apiKey} 
                variant="outline"
              >
                {testingApiKey ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Validating...
                  </>
                ) : (
                  "Test Connection"
                )}
              </Button>

              {llmProvider.validated && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Success</span>
                </div>
              )}

              {llmProvider.error && !testingApiKey && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{llmProvider.error}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {llmProvider.provider === "mock" && (
        <div className="p-4 rounded-md border border-yellow-500/20 bg-yellow-500/5 flex gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-semibold text-foreground">Development Mode</div>
            <div className="text-muted-foreground">Using a mock provider for testing. Real AI responses will be simulated.</div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}
