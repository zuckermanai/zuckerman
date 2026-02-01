import type { LLMProvider } from "../types.js";
import type { ZuckermanConfig } from "@world/config/types.js";
import { LLMProviderRegistry, createDefaultProviders } from "../registry.js";
import { AnthropicProvider } from "../anthropic.js";
import { OpenAIProvider } from "../openai.js";
import { OpenRouterProvider } from "../openrouter.js";

/**
 * Service for selecting and managing LLM providers based on configuration
 */
export class LLMProviderService {
  private providerRegistry: LLMProviderRegistry;
  private selectedProvider: LLMProvider | null = null;

  constructor(providerRegistry?: LLMProviderRegistry) {
    this.providerRegistry = providerRegistry || createDefaultProviders(
      process.env.NODE_ENV === "test" || !!process.env.VITEST
    );
  }

  /**
   * Select and return the appropriate LLM provider based on configuration
   */
  async selectProvider(config: ZuckermanConfig, providerOverride?: string): Promise<LLMProvider> {
    if (this.selectedProvider) {
      return this.selectedProvider;
    }

    // Check environment variables first, then config
    const anthropicKey = process.env.ANTHROPIC_API_KEY || config.llm?.anthropic?.apiKey;
    const openaiKey = process.env.OPENAI_API_KEY || config.llm?.openai?.apiKey;
    const openrouterKey = process.env.OPENROUTER_API_KEY || config.llm?.openrouter?.apiKey;

    // Determine provider: use override, config default, or auto-detect from available keys
    const providerName = providerOverride ||
      config.agents?.defaults?.defaultProvider || 
      (openrouterKey ? "openrouter" :
       anthropicKey ? "anthropic" :
       openaiKey ? "openai" : null);

    let provider: LLMProvider | undefined;

    // Try to get from registry first
    if (providerName === "anthropic" && anthropicKey) {
      provider = this.providerRegistry.get("anthropic");
      if (!provider && anthropicKey) {
        provider = new AnthropicProvider(anthropicKey);
        this.providerRegistry.register(provider);
      }
    } else if (providerName === "openai" && openaiKey) {
      provider = this.providerRegistry.get("openai");
      if (!provider && openaiKey) {
        provider = new OpenAIProvider(openaiKey);
        this.providerRegistry.register(provider);
      }
    } else if (providerName === "openrouter" && openrouterKey) {
      provider = this.providerRegistry.get("openrouter");
      if (!provider && openrouterKey) {
        provider = new OpenRouterProvider(openrouterKey);
        this.providerRegistry.register(provider);
      }
    }

    // Fallback: try any available provider in priority order (including mock in tests)
    if (!provider) {
      provider =
        this.providerRegistry.get("openrouter") ||
        this.providerRegistry.get("anthropic") ||
        this.providerRegistry.get("openai") ||
        this.providerRegistry.get("mock");
    }

    if (!provider) {
      const availableKeys = [
        openrouterKey && "OPENROUTER_API_KEY",
        anthropicKey && "ANTHROPIC_API_KEY",
        openaiKey && "OPENAI_API_KEY",
      ].filter(Boolean);
      
      throw new Error(
        `No LLM provider available. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY environment variable, or configure in .zuckerman/config.json.${availableKeys.length > 0 ? ` Found keys: ${availableKeys.join(", ")}` : ""}`,
      );
    }

    this.selectedProvider = provider;
    return provider;
  }

  /**
   * Clear the selected provider cache
   */
  clearCache(): void {
    this.selectedProvider = null;
  }

  /**
   * Get the current provider registry
   */
  getRegistry(): LLMProviderRegistry {
    return this.providerRegistry;
  }
}
