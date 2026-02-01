import type { LLMProvider } from "./types.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";
import { OpenRouterProvider } from "./openrouter.js";
import { MockLLMProvider } from "./mock.js";

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

export function createDefaultProviders(useMock = false): LLMProviderRegistry {
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

  return registry;
}
