import type { LLMProvider } from "../types.js";
import type { ZuckermanConfig } from "@world/config/types.js";

/**
 * Select the appropriate model based on provider and configuration
 */
export function selectModel(
  provider: LLMProvider,
  config: ZuckermanConfig,
  override?: string,
): string {
  if (override) {
    return override;
  }

  if (config.agents?.defaults?.defaultModel) {
    return config.agents.defaults.defaultModel;
  }

  // Provider-specific defaults
  if (provider.name === "anthropic") {
    return config.llm?.anthropic?.defaultModel || "claude-3-5-sonnet-20241022";
  }

  if (provider.name === "openai") {
    return config.llm?.openai?.defaultModel || "gpt-4o";
  }

  if (provider.name === "openrouter") {
    // Default to fast, cheap, and smart model: DeepSeek Chat
    // Great performance at low cost
    return config.llm?.openrouter?.defaultModel || "deepseek/deepseek-chat";
  }

  // Fallback
  return "gpt-4o";
}
