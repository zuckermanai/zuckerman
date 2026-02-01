import type { LLMProvider } from "./types.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OpenRouterProvider } from "./openrouter.js";
import { CustomProvider } from "./custom.js";
import { MockLLMProvider } from "./mock.js";

interface LLMConfig {
  custom?: {
    apiKey?: string;
    baseUrl: string;
    defaultModel: string;
  };
}

export class LLMProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  list(): LLMProvider[] {
    return Array.from(this.providers.values());
  }
}

export function createDefaultProviders(useMock = false, config?: LLMConfig): LLMProviderRegistry {
  const registry = new LLMProviderRegistry();

  // Use mock provider in test environment or if explicitly requested
  if (useMock || process.env.NODE_ENV === "test" || process.env.VITEST) {
    registry.register(new MockLLMProvider());
    return registry;
  }

  // Register Anthropic if API key is available
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      registry.register(new AnthropicProvider(anthropicKey));
    } catch (err) {
      console.warn("Failed to register Anthropic provider:", err);
    }
  }

  // Register OpenAI if API key is available
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      registry.register(new OpenAIProvider(openaiKey));
    } catch (err) {
      console.warn("Failed to register OpenAI provider:", err);
    }
  }

  // Register OpenRouter if API key is available
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (openrouterKey) {
    try {
      registry.register(new OpenRouterProvider(openrouterKey));
    } catch (err) {
      console.warn("Failed to register OpenRouter provider:", err);
    }
  }

  // Register Custom provider from config (config-driven, not env-driven)
  if (config?.custom?.baseUrl && config?.custom?.defaultModel) {
    try {
      registry.register(
        new CustomProvider(
          config.custom.apiKey || "",
          config.custom.baseUrl,
          config.custom.defaultModel
        )
      );
    } catch (err) {
      console.warn("Failed to register Custom provider:", err);
    }
  }

  return registry;
}
