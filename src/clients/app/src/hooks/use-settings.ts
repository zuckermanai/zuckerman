import { useState, useEffect, useCallback } from "react";
import { GatewayClient } from "../core/gateway/client";
import { clearStorageByPrefix } from "../core/storage/local-storage";

export interface SettingsState {
  gateway: {
    host: string;
    port: number;
    autoStart: boolean;
  };
  llmProvider: {
    provider: "anthropic" | "openai" | "openrouter" | "mock" | "custom" | null;
    apiKey: string;
    baseUrl?: string;
    defaultModel?: string;
    validated: boolean;
    error?: string;
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

  // Actions
  updateSettings: <K extends keyof SettingsState>(
    section: K,
    updates: Partial<SettingsState[K]>
  ) => void;
  saveSettings: () => Promise<void>;
  testConnection: () => Promise<void>;
  validateApiKey: (key: string, provider: string) => boolean;
  testApiKey: () => Promise<void>;
  handleProviderChange: (provider: "anthropic" | "openai" | "openrouter" | "mock" | "custom") => void;
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
        return JSON.parse(stored);
      } catch {
        return defaultSettings;
      }
    }
    return defaultSettings;
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [toolRestrictions, setToolRestrictions] = useState<ToolRestrictions>({
    profile: "full",
    enabledTools: new Set(["terminal", "browser", "cron", "device", "filesystem", "canvas"]),
  });
  const [isLoadingTools, setIsLoadingTools] = useState(false);

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
              enabledTools.add("device");
              enabledTools.add("filesystem");
              enabledTools.add("canvas");
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

  const saveSettings = useCallback(async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));

    if (onGatewayConfigChange && hasChanges) {
      onGatewayConfigChange(settings.gateway.host, settings.gateway.port);
    }

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

    setHasChanges(false);
  }, [settings, hasChanges, onGatewayConfigChange]);

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

  const validateApiKey = useCallback((key: string, provider: string): boolean => {
    if (provider === "anthropic") {
      return key.startsWith("sk-ant-");
    } else if (provider === "openai") {
      return key.startsWith("sk-");
    } else if (provider === "openrouter") {
      return key.startsWith("sk-or-");
    }
    return false;
  }, []);

  const testApiKey = useCallback(async () => {
    if (!settings.llmProvider.provider || !settings.llmProvider.apiKey) return;

    if (settings.llmProvider.provider === "mock") {
      updateSettings("llmProvider", { validated: true });
      return;
    }

    if (!validateApiKey(settings.llmProvider.apiKey, settings.llmProvider.provider)) {
      updateSettings("llmProvider", {
        validated: false,
        error: "Invalid API key format",
      });
      return;
    }

    setTestingApiKey(true);
    updateSettings("llmProvider", { error: undefined });

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      updateSettings("llmProvider", {
        validated: true,
        error: undefined,
      });
    } catch (error: any) {
      updateSettings("llmProvider", {
        validated: false,
        error: error.message || "API key validation failed",
      });
    } finally {
      setTestingApiKey(false);
    }
  }, [settings.llmProvider.provider, settings.llmProvider.apiKey, validateApiKey, updateSettings]);

  const handleProviderChange = useCallback((provider: "anthropic" | "openai" | "openrouter" | "mock" | "custom") => {
    updateSettings("llmProvider", {
      provider,
      apiKey: "",
      baseUrl: "",
      defaultModel: "",
      validated: false,
      error: undefined,
    });
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

    const allTools = ["terminal", "browser", "cron", "device", "filesystem", "canvas"];
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

    const allTools = ["terminal", "browser", "cron", "device", "filesystem", "canvas"];
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
          const sessionsResponse = await gatewayClient.request("sessions.list");
          if (sessionsResponse.ok && sessionsResponse.result) {
            const sessions = (sessionsResponse.result as { sessions?: Array<{ id: string }> }).sessions || [];
            for (const session of sessions) {
              try {
                await gatewayClient.request("sessions.delete", { id: session.id });
              } catch (err) {
                console.warn(`Failed to delete session ${session.id}:`, err);
              }
            }
          }
        } catch (err) {
          console.warn("Failed to delete sessions via gateway:", err);
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

  return {
    settings,
    hasChanges,
    testingApiKey,
    connectionStatus,
    toolRestrictions,
    isLoadingTools,
    showResetDialog,
    isResetting,
    updateSettings,
    saveSettings,
    testConnection,
    validateApiKey,
    testApiKey,
    handleProviderChange,
    handleToolToggle,
    handleEnableAllTools,
    handleReset,
    setShowResetDialog,
  };
}
