import { useState, useEffect, useCallback, useRef } from "react";
import { GatewayClient } from "../core/gateway/client";
import { clearStorageByPrefix } from "../core/storage/local-storage";
import { useLLMProvider, type LLMModel } from "./use-llm-provider";

export interface SettingsState {
  gateway: {
    host: string;
    port: number;
    autoStart: boolean;
  };
  llmProvider: {
    provider: "anthropic" | "openai" | "openrouter" | "mock" | null;
    apiKey: string;
    validated: boolean;
    error?: string;
    model?: LLMModel;
  };
  advanced: {
    autoReconnect: boolean;
    reconnectAttempts: number;
  };
}

export interface ToolRestrictions {
  profile: "minimal" | "coding" | "messaging" | "full";
  enabledTools: Set<string>;
}

// LLMModel is now exported from use-llm-provider
export type { LLMModel } from "./use-llm-provider";

type ModelTrait = "fastCheap" | "cheap" | "fast" | "highQuality" | "largeContext";

export interface UseSettingsReturn {
  // State
  settings: SettingsState;
  hasChanges: boolean;
  testingApiKey: boolean;
  connectionStatus: "idle" | "testing" | "success" | "error";
  toolRestrictions: ToolRestrictions;
  isLoadingTools: boolean;
  showResetDialog: boolean;
  isResetting: boolean;
  availableModels: LLMModel[];
  isLoadingModels: boolean;
  traitMappings?: Record<string, Record<ModelTrait, string>>;

  // Actions
  updateSettings: <K extends keyof SettingsState>(
    section: K,
    updates: Partial<SettingsState[K]>
  ) => void;
  saveSettings: () => Promise<void>;
  testConnection: () => Promise<void>;
  validateApiKey: (key: string, provider: string) => boolean;
  testApiKey: () => Promise<void>;
  handleProviderChange: (provider: "anthropic" | "openai" | "openrouter" | "mock") => void;
  handleModelChange: (model: LLMModel) => void;
  handleToolToggle: (toolId: string) => Promise<void>;
  handleEnableAllTools: () => Promise<void>;
  handleReset: () => Promise<void>;
  setShowResetDialog: (show: boolean) => void;
}

const SETTINGS_STORAGE_KEY = "zuckerman:settings";

const defaultSettings: SettingsState = {
  gateway: {
    host: "127.0.0.1",
    port: 18789,
    autoStart: true,
  },
  llmProvider: {
    provider: null,
    apiKey: "",
    validated: false,
  },
  advanced: {
    autoReconnect: true,
    reconnectAttempts: 5,
  },
};

export function useSettings(
  gatewayClient: GatewayClient | null,
  onGatewayConfigChange?: (host: string, port: number) => void,
  startServer?: (host: string, port: number) => Promise<boolean>,
  stopServer?: (host: string, port: number) => Promise<boolean>
): UseSettingsReturn {
  const [settings, setSettings] = useState<SettingsState>(() => {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as any;
        // Migrate old string model to object format if needed
        if (parsed.llmProvider?.model && typeof parsed.llmProvider.model === "string") {
          parsed.llmProvider.model = { id: parsed.llmProvider.model, name: parsed.llmProvider.model };
        }
        return parsed as SettingsState;
      } catch {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [toolRestrictions, setToolRestrictions] = useState<ToolRestrictions>({
    profile: "full",
    enabledTools: new Set(["terminal", "browser", "cron", "filesystem"]),
  });
  const [isLoadingTools, setIsLoadingTools] = useState(false);

  const [traitMappings, setTraitMappings] = useState<Record<string, Record<ModelTrait, string>>>({});

  // Load API keys from Electron API on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getApiKeys().then((keys) => {
        let provider: "anthropic" | "openai" | "openrouter" | "mock" | null = null;
        let apiKey = "";

        if (keys.anthropic) {
          provider = "anthropic";
          apiKey = keys.anthropic;
        } else if (keys.openai) {
          provider = "openai";
          apiKey = keys.openai;
        } else if (keys.openrouter) {
          provider = "openrouter";
          apiKey = keys.openrouter;
        }

        if (provider) {
          setSettings((prev) => ({
            ...prev,
            llmProvider: {
              provider,
              apiKey,
              validated: true,
            },
          }));
        }
      }).catch(() => {
        // Ignore errors
      });
    }
  }, []);

  // Load default provider and model from config when gateway connects
  useEffect(() => {
    const loadDefaultsFromConfig = async () => {
      if (!gatewayClient?.isConnected()) return;

      try {
        const response = await gatewayClient.request("config.get", {});
        if (response.ok && response.result) {
          const config = (response.result as { config: any }).config;
          const defaultProvider = config?.agents?.defaults?.defaultProvider;
          const defaultModel = config?.agents?.defaults?.defaultModel;

          // Load trait mappings from config
          const mappings: Record<string, Record<ModelTrait, string>> = {};
          for (const provider of ["anthropic", "openai", "openrouter"] as const) {
            if (config?.llm?.[provider]?.traits) {
              mappings[provider] = config.llm[provider].traits!;
            }
          }
          if (Object.keys(mappings).length > 0) {
            setTraitMappings(mappings);
          }

          if (!defaultProvider) return;

          // Load API keys first if available
          let apiKey = "";
          let hasApiKey = false;

          if (window.electronAPI) {
            try {
              const keys = await window.electronAPI.getApiKeys();
              if (defaultProvider === "anthropic" && keys.anthropic) {
                apiKey = keys.anthropic;
                hasApiKey = true;
              } else if (defaultProvider === "openai" && keys.openai) {
                apiKey = keys.openai;
                hasApiKey = true;
              } else if (defaultProvider === "openrouter" && keys.openrouter) {
                apiKey = keys.openrouter;
                hasApiKey = true;
              }
            } catch {
              // Ignore errors
            }
          }

          // Determine model - prioritize provider-specific, then global default
          const providerModel = config?.llm?.[defaultProvider]?.defaultModel;
          const modelFromConfig = providerModel || defaultModel;

          // Handle both old format (string) and new format (object)
          let modelObj: LLMModel | undefined;
          if (modelFromConfig) {
            if (typeof modelFromConfig === "string") {
              // Old format: just ID string, create minimal object
              modelObj = { id: modelFromConfig, name: modelFromConfig };
            } else if (typeof modelFromConfig === "object" && modelFromConfig.id) {
              // New format: full object - extract only needed fields
              modelObj = {
                id: modelFromConfig.id,
                name: modelFromConfig.name || modelFromConfig.id,
              };
              if ((modelFromConfig as any).createdAt) {
                (modelObj as any).createdAt = (modelFromConfig as any).createdAt;
              }
            }
          }

          // Update settings with provider and model in a single update
          setSettings((prev) => {
            // Only update if provider is different or model needs to be set
            const providerChanged = prev.llmProvider.provider !== defaultProvider;
            const modelNeedsUpdate = modelObj && (!prev.llmProvider.model || prev.llmProvider.model.id !== modelObj.id);

            if (providerChanged || modelNeedsUpdate) {
              return {
                ...prev,
                llmProvider: {
                  ...prev.llmProvider,
                  ...(providerChanged && {
                    provider: defaultProvider as "anthropic" | "openai" | "openrouter" | "mock",
                    apiKey: hasApiKey ? apiKey : prev.llmProvider.apiKey,
                    validated: hasApiKey,
                  }),
                  ...(modelNeedsUpdate && modelObj && { model: modelObj }),
                },
              };
            }
            return prev;
          });
        }
      } catch (error) {
        console.error("Failed to load defaults from config:", error);
      }
    };

    loadDefaultsFromConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gatewayClient?.isConnected()]);

  // Load tool restrictions from config
  useEffect(() => {
    const loadToolRestrictions = async () => {
      if (!gatewayClient?.isConnected()) return;

      setIsLoadingTools(true);
      try {
        const response = await gatewayClient.request("config.get", {});

        if (response.ok && response.result) {
          const config = (response.result as { config: any }).config;
          const securityConfig = config?.security;
          const toolsConfig = securityConfig?.tools;

          if (toolsConfig) {
            const profile = toolsConfig.profile || "full";
            const enabledTools = new Set<string>();

            if (profile === "full") {
              enabledTools.add("terminal");
              enabledTools.add("browser");
              enabledTools.add("cron");
              enabledTools.add("filesystem");
            } else if (toolsConfig.allow) {
              toolsConfig.allow.forEach((tool: string) => {
                if (!tool.startsWith("group:")) {
                  enabledTools.add(tool);
                }
              });
            }

            setToolRestrictions({ profile, enabledTools });
          }
        }
      } catch (error) {
        console.error("Failed to load tool restrictions:", error);
      } finally {
        setIsLoadingTools(false);
      }
    };

    if (gatewayClient?.isConnected()) {
      loadToolRestrictions();
    }
  }, [gatewayClient]);

  const updateSettings = useCallback(<K extends keyof SettingsState>(
    section: K,
    updates: Partial<SettingsState[K]>
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
    setHasChanges(true);
  }, []);

  // Use shared LLM provider hook
  const llmProviderHook = useLLMProvider({
    gatewayClient,
    provider: settings.llmProvider.provider,
    apiKey: settings.llmProvider.apiKey,
    validated: settings.llmProvider.validated,
    model: settings.llmProvider.model,
    onUpdate: (updates) => {
      updateSettings("llmProvider", updates);
    },
    autoFetchModels: true,
  });

  const saveSettings = useCallback(async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));

    // Note: Gateway config changes require app restart to take effect
    // GatewayProvider reads settings on mount

    // Save API keys if LLM provider is configured
    if (
      window.electronAPI &&
      settings.llmProvider.provider &&
      settings.llmProvider.provider !== "mock" &&
      settings.llmProvider.apiKey &&
      settings.llmProvider.apiKey.trim().length > 0
    ) {
      const keys: { anthropic?: string; openai?: string; openrouter?: string } = {};
      if (settings.llmProvider.provider === "anthropic") {
        keys.anthropic = settings.llmProvider.apiKey.trim();
      } else if (settings.llmProvider.provider === "openai") {
        keys.openai = settings.llmProvider.apiKey.trim();
      } else if (settings.llmProvider.provider === "openrouter") {
        keys.openrouter = settings.llmProvider.apiKey.trim();
      }

      try {
        const result = await window.electronAPI.saveApiKeys(keys);
        if (!result.success) {
          alert(`Failed to save API keys: ${result.error || "Unknown error"}`);
        }
      } catch (error) {
        alert(`Error saving API keys: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    // Update config.json with default provider and model
    if (gatewayClient?.isConnected() && settings.llmProvider.provider && settings.llmProvider.provider !== "mock") {
      try {
        // Use selected model or fetch first available model from gateway
        let selectedModel: LLMModel | undefined = settings.llmProvider.model;
        
        console.log(`[Settings] Saving model for provider ${settings.llmProvider.provider}, selectedModel:`, selectedModel);
        
        if (!selectedModel) {
          // Try to use first available model from already fetched models
          if (llmProviderHook.availableModels.length > 0) {
            selectedModel = llmProviderHook.availableModels[0];
            console.log(`[Settings] Using first available model:`, selectedModel);
          } else {
            // Fetch models from gateway to get the first available model
            try {
              console.log(`[Settings] Fetching models for provider ${settings.llmProvider.provider}`);
              const modelsResponse = await gatewayClient.request("llm.models", {
                provider: settings.llmProvider.provider,
              });
              
              if (modelsResponse.ok && modelsResponse.result) {
                const models = (modelsResponse.result as { models: LLMModel[] }).models;
                if (models && models.length > 0) {
                  selectedModel = models[0];
                  console.log(`[Settings] Fetched and using first model:`, selectedModel);
                }
              }
            } catch (error) {
              console.warn("Failed to fetch models for default selection:", error);
            }
          }
        }
        
        if (!selectedModel) {
          const errorMsg = `No model available for provider ${settings.llmProvider.provider}`;
          console.warn(`[Settings] ${errorMsg}`);
          alert(`Warning: Could not determine a default model for ${settings.llmProvider.provider}. Please select a model manually.`);
          return;
        }

        // Update config via gateway - save the full model object
        const updates: any = {
          agents: {
            defaults: {
              defaultProvider: settings.llmProvider.provider,
              defaultModel: selectedModel,
            },
          },
          llm: {
            [settings.llmProvider.provider]: {
              defaultModel: selectedModel,
            },
          },
        };

        console.log(`[Settings] Updating config with:`, JSON.stringify(updates, null, 2));
        const response = await gatewayClient.request("config.update", { updates });
        if (!response.ok) {
          const errorMsg = response.error?.message || "Unknown error";
          console.error(`[Settings] Failed to update config: ${errorMsg}`, response.error);
          alert(`Failed to save default model: ${errorMsg}`);
        } else {
          console.log(`[Settings] Successfully saved default model: ${selectedModel.id} (${selectedModel.name}) for provider: ${settings.llmProvider.provider}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Settings] Error updating config: ${errorMsg}`, error);
        alert(`Error saving default model: ${errorMsg}`);
      }
    } else {
      console.log(`[Settings] Skipping config update - gateway connected: ${gatewayClient?.isConnected()}, provider: ${settings.llmProvider.provider}`);
    }

    setHasChanges(false);
  }, [settings, llmProviderHook.availableModels, gatewayClient]);

  const testConnection = useCallback(async () => {
    setConnectionStatus("testing");
    try {
      const testClient = new GatewayClient({
        host: settings.gateway.host,
        port: settings.gateway.port,
      });

      await Promise.race([
        testClient.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), 5000)
        ),
      ]) as Promise<void>;

      testClient.disconnect();
      setConnectionStatus("success");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    } catch (error) {
      setConnectionStatus("error");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    }
  }, [settings.gateway.host, settings.gateway.port]);

  // Use shared hook's validation and test functions
  const validateApiKey = llmProviderHook.validateApiKey;
  const testApiKey = llmProviderHook.testApiKey;

  // Load model from config on mount
  useEffect(() => {
    const loadModelFromConfig = async () => {
      if (!gatewayClient?.isConnected() || !settings.llmProvider.provider || settings.llmProvider.provider === "mock") {
        return;
      }

      try {
        const response = await gatewayClient.request("config.get", {});
        if (response.ok && response.result) {
          const config = (response.result as { config: any }).config;
          const modelFromConfig = config?.llm?.[settings.llmProvider.provider]?.defaultModel ||
                       config?.agents?.defaults?.defaultModel;
          
          if (modelFromConfig) {
            // Handle both old format (string) and new format (object)
            let modelObj: LLMModel;
            if (typeof modelFromConfig === "string") {
              // Old format: just ID string, try to find full object from available models
              modelObj = llmProviderHook.availableModels.find(m => m.id === modelFromConfig) || { id: modelFromConfig, name: modelFromConfig };
            } else if (typeof modelFromConfig === "object" && modelFromConfig.id) {
              // New format: full object - extract only needed fields
              modelObj = {
                id: modelFromConfig.id,
                name: modelFromConfig.name || modelFromConfig.id,
              };
              if ((modelFromConfig as any).createdAt) {
                (modelObj as any).createdAt = (modelFromConfig as any).createdAt;
              }
            } else {
              return; // Invalid format
            }
            
            if (!settings.llmProvider.model || settings.llmProvider.model.id !== modelObj.id) {
              updateSettings("llmProvider", { model: modelObj });
            }
          }
        }
      } catch (error) {
        console.error("Failed to load model from config:", error);
      }
    };

    if (gatewayClient?.isConnected() && settings.llmProvider.provider && llmProviderHook.availableModels.length > 0) {
      loadModelFromConfig();
    }
  }, [gatewayClient?.isConnected(), settings.llmProvider.provider, llmProviderHook.availableModels, updateSettings]);

  const handleProviderChange = useCallback((provider: "anthropic" | "openai" | "openrouter" | "mock") => {
    updateSettings("llmProvider", {
      provider,
      apiKey: "",
      validated: false,
      error: undefined,
      model: undefined,
    });
  }, [updateSettings]);

  const handleModelChange = useCallback((model: LLMModel) => {
    updateSettings("llmProvider", { model });
  }, [updateSettings]);

  const handleToolToggle = useCallback(async (toolId: string) => {
    if (!gatewayClient?.isConnected()) {
      alert("Gateway not connected");
      return;
    }

    const newEnabledTools = new Set(toolRestrictions.enabledTools);
    if (newEnabledTools.has(toolId)) {
      newEnabledTools.delete(toolId);
    } else {
      newEnabledTools.add(toolId);
    }

    const allTools = ["terminal", "browser", "cron", "filesystem"];
    const allEnabled = allTools.every((tool) => newEnabledTools.has(tool));

    const updates: any = {
      security: {
        tools: allEnabled
          ? { profile: "full" }
          : { profile: "full", allow: Array.from(newEnabledTools) },
      },
    };

    try {
      const response = await gatewayClient.request("config.update", { updates });

      if (response.ok) {
        setToolRestrictions({
          profile: allEnabled ? "full" : toolRestrictions.profile,
          enabledTools: newEnabledTools,
        });
      } else {
        alert(`Failed to update tool restrictions: ${response.error?.message || "Unknown error"}`);
      }
    } catch (error) {
      alert(`Error updating tool restrictions: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [gatewayClient, toolRestrictions]);

  const handleEnableAllTools = useCallback(async () => {
    if (!gatewayClient?.isConnected()) {
      alert("Gateway not connected");
      return;
    }

    const allTools = ["terminal", "browser", "cron", "filesystem"];
    const updates: any = {
      security: {
        tools: { profile: "full" },
      },
    };

    try {
      const response = await gatewayClient.request("config.update", { updates });

      if (response.ok) {
        setToolRestrictions({
          profile: "full",
          enabledTools: new Set(allTools),
        });
      } else {
        alert(`Failed to enable all tools: ${response.error?.message || "Unknown error"}`);
      }
    } catch (error) {
      alert(`Error enabling all tools: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [gatewayClient]);

  const handleReset = useCallback(async () => {
    if (!window.electronAPI) {
      console.error("Electron API not available");
      return;
    }

    setIsResetting(true);
    try {
      if (gatewayClient?.isConnected()) {
        try {
          const conversationsResponse = await gatewayClient.request("conversations.list");
          if (conversationsResponse.ok && conversationsResponse.result) {
            const conversations = (conversationsResponse.result as { conversations?: Array<{ id: string }> }).conversations || [];
            for (const conversation of conversations) {
              try {
                await gatewayClient.request("conversations.delete", { id: conversation.id });
              } catch (err) {
                console.warn(`Failed to delete conversation ${conversation.id}:`, err);
              }
            }
          }
        } catch (err) {
          console.warn("Failed to delete conversations via gateway:", err);
        }
      }

      clearStorageByPrefix("zuckerman:");
      localStorage.removeItem("zuckerman:onboarding:completed");
      localStorage.removeItem("zuckerman:onboarding");

      const result = await window.electronAPI.resetAllData();
      if (result.success) {
        const gatewaySettings = settings.gateway;
        if (stopServer && startServer) {
          try {
            await stopServer(gatewaySettings.host, gatewaySettings.port);
            await new Promise((resolve) => setTimeout(resolve, 500));
            await startServer(gatewaySettings.host, gatewaySettings.port);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (err) {
            console.warn("Failed to restart gateway:", err);
          }
        }

        setShowResetDialog(false);
        window.location.reload();
      } else {
        alert(`Failed to reset data: ${result.error || "Unknown error"}`);
        setIsResetting(false);
      }
    } catch (error) {
      alert(`Error resetting data: ${error instanceof Error ? error.message : "Unknown error"}`);
      setIsResetting(false);
    }
  }, [gatewayClient, settings.gateway, startServer, stopServer]);

  const handleTraitMappingChange = useCallback(async (
    provider: string,
    trait: ModelTrait,
    modelId: string
  ) => {
    if (!gatewayClient?.isConnected()) return;

    // Update local state immediately
    setTraitMappings((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [trait]: modelId,
      },
    }));

    // Save to config
    try {
      const updates: any = {
        llm: {
          [provider]: {
            traits: {
              [trait]: modelId,
            },
          },
        },
      };

      const response = await gatewayClient.request("config.update", { updates });
      if (!response.ok) {
        console.error(`Failed to update trait mapping:`, response.error);
        // Revert on error - reload from config
        const configResponse = await gatewayClient.request("config.get", {});
        if (configResponse.ok && configResponse.result) {
          const config = (configResponse.result as { config: any }).config;
          const mappings: Record<string, Record<ModelTrait, string>> = {};
          for (const p of ["anthropic", "openai", "openrouter"] as const) {
            if (config?.llm?.[p]?.traits) {
              mappings[p] = config.llm[p].traits!;
            }
          }
          setTraitMappings(mappings);
        }
      }
    } catch (error) {
      console.error("Error updating trait mapping:", error);
    }
  }, [gatewayClient]);

  return {
    settings,
    hasChanges,
    testingApiKey: llmProviderHook.testingApiKey,
    connectionStatus,
    toolRestrictions,
    isLoadingTools,
    showResetDialog,
    isResetting,
    availableModels: llmProviderHook.availableModels,
    isLoadingModels: llmProviderHook.isLoadingModels,
    traitMappings,
    updateSettings,
    saveSettings,
    testConnection,
    validateApiKey,
    testApiKey,
    handleTraitMappingChange,
    handleProviderChange,
    handleModelChange,
    handleToolToggle,
    handleEnableAllTools,
    handleReset,
    setShowResetDialog,
  };
}
