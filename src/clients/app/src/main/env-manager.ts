import { loadConfig, saveConfig } from "@server/world/config/index.js";

/**
 * Read API keys from config.json
 */
export async function getApiKeys(): Promise<{
  anthropic?: string;
  openai?: string;
  openrouter?: string;
}> {
  const keys: { anthropic?: string; openai?: string; openrouter?: string } = {};

  try {
    const config = await loadConfig();
    if (config.llm?.anthropic?.apiKey) {
      keys.anthropic = config.llm.anthropic.apiKey;
    }
    if (config.llm?.openai?.apiKey) {
      keys.openai = config.llm.openai.apiKey;
    }
    if (config.llm?.openrouter?.apiKey) {
      keys.openrouter = config.llm.openrouter.apiKey;
    }
  } catch (error) {
    console.error("Error reading API keys from config:", error);
  }

  return keys;
}

/**
 * Save API keys to config.json only
 */
export async function saveApiKeys(keys: {
  anthropic?: string;
  openai?: string;
  openrouter?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await loadConfig();
    
    if (!config.llm) {
      config.llm = {};
    }
    if (keys.anthropic) {
      if (!config.llm.anthropic) {
        config.llm.anthropic = {};
      }
      config.llm.anthropic.apiKey = keys.anthropic;
    }
    if (keys.openai) {
      if (!config.llm.openai) {
        config.llm.openai = {};
      }
      config.llm.openai.apiKey = keys.openai;
    }
    if (keys.openrouter) {
      if (!config.llm.openrouter) {
        config.llm.openrouter = {};
      }
      config.llm.openrouter.apiKey = keys.openrouter;
    }
    
    await saveConfig(config);
    
    // Verify it was saved correctly - wait a bit for file system to sync
    await new Promise(resolve => setTimeout(resolve, 100));
    const verifyConfig = await loadConfig();
    
    const verificationErrors: string[] = [];
    if (keys.openrouter && !verifyConfig.llm?.openrouter?.apiKey) {
      verificationErrors.push("openrouter key not found after save");
    }
    if (keys.anthropic && !verifyConfig.llm?.anthropic?.apiKey) {
      verificationErrors.push("anthropic key not found after save");
    }
    if (keys.openai && !verifyConfig.llm?.openai?.apiKey) {
      verificationErrors.push("openai key not found after save");
    }
    
    if (verificationErrors.length > 0) {
      const errorMsg = `Verification failed: ${verificationErrors.join(", ")}`;
      console.error("[env-manager]", errorMsg);
      throw new Error(errorMsg);
    }

    // Set environment variables in current process (for immediate use)
    if (keys.anthropic) {
      process.env.ANTHROPIC_API_KEY = keys.anthropic;
    }
    if (keys.openai) {
      process.env.OPENAI_API_KEY = keys.openai;
    }
    if (keys.openrouter) {
      process.env.OPENROUTER_API_KEY = keys.openrouter;
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[env-manager] Error saving API keys:", errorMessage);
    return { success: false, error: `Failed to save API keys: ${errorMessage}` };
  }
}

/**
 * Get full LLM configuration from config.json
 * Includes API keys, default models, and custom provider config
 */
export async function getLLMConfig(): Promise<{
  provider: "anthropic" | "openai" | "openrouter" | "custom" | null;
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}> {
  try {
    const config = await loadConfig();
    const defaultProvider = config.agents?.defaults?.defaultProvider;
    
    // Determine which provider is configured
    let provider: "anthropic" | "openai" | "openrouter" | "custom" | null = null;
    let apiKey = "";
    let baseUrl: string | undefined;
    let defaultModel: string | undefined;

    // Check if we have a configured provider
    if (defaultProvider) {
      provider = defaultProvider;
      
      // Get the config for the specific provider
      const providerConfig = config.llm?.[provider];
      if (providerConfig) {
        apiKey = providerConfig.apiKey || "";
        defaultModel = providerConfig.defaultModel;
      }
      
      // For custom provider, also get baseUrl
      if (provider === "custom") {
        baseUrl = config.llm?.custom?.baseUrl;
        defaultModel = config.llm?.custom?.defaultModel;
        apiKey = config.llm?.custom?.apiKey || "";
      }
    } else {
      // Auto-detect provider from available API keys
      if (config.llm?.anthropic?.apiKey) {
        provider = "anthropic";
        apiKey = config.llm.anthropic.apiKey;
        defaultModel = config.llm.anthropic.defaultModel;
      } else if (config.llm?.openai?.apiKey) {
        provider = "openai";
        apiKey = config.llm.openai.apiKey;
        defaultModel = config.llm.openai.defaultModel;
      } else if (config.llm?.openrouter?.apiKey) {
        provider = "openrouter";
        apiKey = config.llm.openrouter.apiKey;
        defaultModel = config.llm.openrouter.defaultModel;
      } else if (config.llm?.custom?.baseUrl && config.llm?.custom?.defaultModel) {
        provider = "custom";
        baseUrl = config.llm.custom.baseUrl;
        defaultModel = config.llm.custom.defaultModel;
        apiKey = config.llm.custom.apiKey || "";
      }
    }

    return { provider, apiKey, baseUrl, defaultModel };
  } catch (error) {
    console.error("[env-manager] Error reading LLM config:", error);
    return { provider: null, apiKey: "" };
  }
}

/**
 * Save full LLM configuration to config.json
 * Includes API keys, default models, default provider, and custom provider config
 */
export async function saveLLMConfig(configData: {
  provider: "anthropic" | "openai" | "openrouter" | "custom";
  apiKey?: string;
  defaultModel?: string;
  baseUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const config = await loadConfig();
    
    // Ensure llm section exists
    if (!config.llm) {
      config.llm = {};
    }
    
    // Ensure agents.defaults section exists
    if (!config.agents) {
      config.agents = {};
    }
    if (!config.agents.defaults) {
      config.agents.defaults = {};
    }
    
    const { provider, apiKey, defaultModel, baseUrl } = configData;
    
    // Update the default provider
    config.agents.defaults.defaultProvider = provider;
    
    // Update provider-specific config
    if (provider === "anthropic") {
      if (!config.llm.anthropic) {
        config.llm.anthropic = {};
      }
      if (apiKey) {
        config.llm.anthropic.apiKey = apiKey;
      }
      if (defaultModel) {
        config.llm.anthropic.defaultModel = defaultModel;
      }
      // Set environment variable for immediate use
      if (apiKey) {
        process.env.ANTHROPIC_API_KEY = apiKey;
      }
    } else if (provider === "openai") {
      if (!config.llm.openai) {
        config.llm.openai = {};
      }
      if (apiKey) {
        config.llm.openai.apiKey = apiKey;
      }
      if (defaultModel) {
        config.llm.openai.defaultModel = defaultModel;
      }
      // Set environment variable for immediate use
      if (apiKey) {
        process.env.OPENAI_API_KEY = apiKey;
      }
    } else if (provider === "openrouter") {
      if (!config.llm.openrouter) {
        config.llm.openrouter = {};
      }
      if (apiKey) {
        config.llm.openrouter.apiKey = apiKey;
      }
      if (defaultModel) {
        config.llm.openrouter.defaultModel = defaultModel;
      }
      // Set environment variable for immediate use
      if (apiKey) {
        process.env.OPENROUTER_API_KEY = apiKey;
      }
    } else if (provider === "custom") {
      if (!config.llm.custom) {
        config.llm.custom = {};
      }
      if (apiKey !== undefined) {
        config.llm.custom.apiKey = apiKey;
      }
      if (baseUrl) {
        config.llm.custom.baseUrl = baseUrl;
      }
      if (defaultModel) {
        config.llm.custom.defaultModel = defaultModel;
      }
    }
    
    await saveConfig(config);
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[env-manager] Error saving LLM config:", errorMessage);
    return { success: false, error: `Failed to save LLM config: ${errorMessage}` };
  }
}
