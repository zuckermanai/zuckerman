import type { ZuckermanConfig, ModelTrait } from "@server/world/config/types.js";
import { loadConfig } from "@server/world/config/index.js";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

/**
 * Main LLM Provider - unified entry point for LLM provider and model selection
 * Implements singleton pattern for global access
 */
export class LLMProvider {
  private static instance: LLMProvider | null = null;
  private config: ZuckermanConfig | null = null;

  private constructor(config?: ZuckermanConfig) {
    if (config) {
      this.config = config;
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: ZuckermanConfig): LLMProvider {
    if (!LLMProvider.instance) {
      LLMProvider.instance = new LLMProvider(config);
    }
    return LLMProvider.instance;
  }

  /**
   * Reset singleton instance (useful for testing)
   */
  static resetInstance(): void {
    LLMProvider.instance = null;
  }

  /**
   * Select provider based on configuration
   */
  private async selectProvider(): Promise<{ name: string; apiKey: string }> {
    if (!this.config) {
      this.config = await loadConfig();
    }
    const config = this.config;
    // Check environment variables first, then config
    const anthropicKey = process.env.ANTHROPIC_API_KEY || config.llm?.anthropic?.apiKey;
    const openaiKey = process.env.OPENAI_API_KEY || config.llm?.openai?.apiKey;
    const openrouterKey = process.env.OPENROUTER_API_KEY || config.llm?.openrouter?.apiKey;

    // Determine provider: use config default, or auto-detect from available keys
    const providerName = config.agents?.defaults?.defaultProvider || 
      (openrouterKey ? "openrouter" :
       anthropicKey ? "anthropic" :
       openaiKey ? "openai" : null);

    let provider: { name: string; apiKey: string } | undefined;

    if (providerName === "anthropic" && anthropicKey) {
      provider = { name: "anthropic", apiKey: anthropicKey };
    } else if (providerName === "openai" && openaiKey) {
      provider = { name: "openai", apiKey: openaiKey };
    } else if (providerName === "openrouter" && openrouterKey) {
      provider = { name: "openrouter", apiKey: openrouterKey };
    }

    // Fallback: try any available provider in priority order
    if (!provider) {
      if (openrouterKey) {
        provider = { name: "openrouter", apiKey: openrouterKey };
      } else if (anthropicKey) {
        provider = { name: "anthropic", apiKey: anthropicKey };
      } else if (openaiKey) {
        provider = { name: "openai", apiKey: openaiKey };
      }
    }

    if (!provider) {
      const availableKeys = [
        openrouterKey && "OPENROUTER_API_KEY",
        anthropicKey && "ANTHROPIC_API_KEY",
        openaiKey && "OPENAI_API_KEY",
      ].filter(Boolean);
      
      throw new Error(
        `No LLM provider available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY environment variable, or configure in .zuckerman/config.json.${availableKeys.length > 0 ? ` Found keys: ${availableKeys.join(", ")}` : ""}`
      );
    }

    return provider;
  }

  /**
   * Select model by trait from config
   */
  private async selectModelByTrait(
    providerName: string,
    trait: ModelTrait
  ): Promise<string> {
    if (!this.config) {
      this.config = await loadConfig();
    }
    const config = this.config;
    const llmConfig = config.llm;
    if (!llmConfig) {
      throw new Error(`LLM config not found. Please configure LLM settings in config file.`);
    }

    // Type-safe access based on provider name
    let configTraits: Record<ModelTrait, string> | undefined;
    if (providerName === "anthropic") {
      configTraits = llmConfig.anthropic?.traits;
    } else if (providerName === "openai") {
      configTraits = llmConfig.openai?.traits;
    } else if (providerName === "openrouter") {
      configTraits = llmConfig.openrouter?.traits;
    }
    
    if (configTraits && configTraits[trait]) {
      return configTraits[trait];
    }

    throw new Error(
      `No trait mapping found for provider "${providerName}" and trait "${trait}". Please configure trait mappings in config file.`
    );
  }

  /**
   * Create LanguageModel from provider and model ID
   */
  private createModel(
    providerName: string,
    modelId: string,
    apiKey: string,
    options?: { baseUrl?: string; customHeaders?: () => HeadersInit }
  ): LanguageModel {
    // Convert HeadersInit to Record<string, string>
    const convertHeaders = (headers?: HeadersInit): Record<string, string> | undefined => {
      if (!headers) return undefined;
      if (typeof headers === "object" && !Array.isArray(headers)) {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(headers)) {
          result[key] = String(value);
        }
        return result;
      }
      return undefined;
    };

    if (providerName === "openai") {
      const provider = createOpenAI({
        apiKey,
        baseURL: options?.baseUrl,
        headers: options?.customHeaders ? convertHeaders(options.customHeaders()) : undefined,
      });
      return provider(modelId);
    } else if (providerName === "anthropic") {
      const provider = createAnthropic({
        apiKey,
      });
      return provider(modelId);
    } else if (providerName === "openrouter") {
      // OpenRouter uses OpenAI-compatible API
      const provider = createOpenAI({
        apiKey,
        baseURL: options?.baseUrl || "https://openrouter.ai/api/v1",
        headers: options?.customHeaders ? convertHeaders(options.customHeaders()) : undefined,
      });
      return provider(modelId);
    } else {
      throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  /**
   * Select model by trait and return LanguageModel instance
   */
  private async selectByTrait(
    trait: ModelTrait
  ): Promise<LanguageModel> {
    const provider = await this.selectProvider();
    const modelId = await this.selectModelByTrait(provider.name, trait);
    
    // Extract options for OpenRouter
    let options: { baseUrl?: string; customHeaders?: () => HeadersInit } | undefined;
    if (provider.name === "openrouter") {
      options = {
        baseUrl: "https://openrouter.ai/api/v1",
        customHeaders: () => ({
          "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER || "https://github.com/zuckerman",
          "X-Title": process.env.OPENROUTER_X_TITLE || "Zuckerman",
        }),
      };
    }
    
    return this.createModel(provider.name, modelId, provider.apiKey, options);
  }

  /**
   * Get fast and cheap model
   */
  async fastCheap(): Promise<LanguageModel> {
    return this.selectByTrait("fastCheap");
  }

  /**
   * Get cheap model
   */
  async cheap(): Promise<LanguageModel> {
    return this.selectByTrait("cheap");
  }

  /**
   * Get fast model
   */
  async fast(): Promise<LanguageModel> {
    return this.selectByTrait("fast");
  }

  /**
   * Get high quality model
   */
  async highQuality(): Promise<LanguageModel> {
    return this.selectByTrait("highQuality");
  }

  /**
   * Get large context model
   */
  async largeContext(): Promise<LanguageModel> {
    return this.selectByTrait("largeContext");
  }

  /**
   * Clear provider cache (no-op now, kept for compatibility)
   */
  clearCache(): void {
    // No-op: no caching needed with AI SDK
  }
}
