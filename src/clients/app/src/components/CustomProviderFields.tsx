import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

interface CustomProviderFieldsProps {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  onChange: (field: "apiKey" | "baseUrl" | "defaultModel", value: string) => void;
  error?: string;
}

export function CustomProviderFields({
  apiKey,
  baseUrl,
  defaultModel,
  onChange,
  error,
}: CustomProviderFieldsProps) {
  const handleBaseUrlChange = (value: string) => {
    onChange("baseUrl", value);
  };

  const handleDefaultModelChange = (value: string) => {
    onChange("defaultModel", value);
  };

  const handleApiKeyChange = (value: string) => {
    onChange("apiKey", value);
  };

  return (
    <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22] dark:bg-card dark:border-border">
      <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22] dark:bg-card dark:border-border">
        <h2 className="text-base font-semibold text-[#c9d1d9] dark:text-foreground">Custom Provider Configuration</h2>
        <p className="text-xs text-[#8b949e] dark:text-muted-foreground mt-1">
          Configure your OpenAI-compatible API endpoint
        </p>
      </div>
      <div className="p-6 space-y-4 bg-[#0d1117] dark:bg-card">
        <div className="space-y-2">
          <Label htmlFor="base-url" className="text-sm font-semibold text-[#c9d1d9] dark:text-foreground">
            Base URL <span className="text-[#f85149]">*</span>
          </Label>
          <Input
            id="base-url"
            type="text"
            value={baseUrl}
            onChange={(e) => handleBaseUrlChange(e.target.value)}
            placeholder="https://api.example.com/v1"
            className="bg-[#0d1117] border-[#30363d] focus:border-[#1f6feb] focus:ring-1 focus:ring-[#1f6feb] dark:bg-background dark:border-border"
          />
          <p className="text-[12px] text-[#8b949e] dark:text-muted-foreground">
            The base URL for your OpenAI-compatible API endpoint (e.g., http://localhost:11434/v1 for Ollama)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="default-model" className="text-sm font-semibold text-[#c9d1d9] dark:text-foreground">
            Default Model <span className="text-[#f85149]">*</span>
          </Label>
          <Input
            id="default-model"
            type="text"
            value={defaultModel}
            onChange={(e) => handleDefaultModelChange(e.target.value)}
            placeholder="llama2, gpt-4, etc."
            className="bg-[#0d1117] border-[#30363d] focus:border-[#1f6feb] focus:ring-1 focus:ring-[#1f6feb] dark:bg-background dark:border-border"
          />
          <p className="text-[12px] text-[#8b949e] dark:text-muted-foreground">
            The default model to use for this provider (e.g., llama2, codellama, mistral)
          </p>
        </div>

        {apiKey !== undefined && (
          <div className="space-y-2">
            <Label htmlFor="custom-api-key" className="text-sm font-semibold text-[#c9d1d9] dark:text-foreground">
              API Key <span className="text-[#8b949e]">(Optional)</span>
            </Label>
            <Input
              id="custom-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder="sk-... (leave empty if not required)"
              className="bg-[#0d1117] border-[#30363d] focus:border-[#1f6feb] focus:ring-1 focus:ring-[#1f6feb] dark:bg-background dark:border-border"
            />
            <p className="text-[12px] text-[#8b949e] dark:text-muted-foreground">
              API key if required by your provider (optional for local deployments)
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-[#f85149] p-3 rounded-md border border-[#f85149]/20 bg-[#f85149]/5">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="p-3 rounded-md border border-[#1f6feb]/20 bg-[#1f6feb]/5">
          <p className="text-xs text-[#8b949e] dark:text-muted-foreground">
            <span className="text-[#58a6ff] font-semibold">Tip:</span> For Ollama, use{" "}
            <code className="bg-[#21262d] dark:bg-muted px-1.5 py-0.5 rounded text-[#c9d1d9] dark:text-foreground">
              http://localhost:11434/v1
            </code>{" "}
            as the Base URL. Make sure Ollama is running and has the model pulled.
          </p>
        </div>
      </div>
    </div>
  );
}
