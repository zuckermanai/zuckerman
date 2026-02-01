import { describe, it, expect } from "vitest";
import { AnthropicProvider } from "@agents/zuckerman/core/awareness/providers/anthropic.js";

describe("AnthropicProvider", () => {
  it("should require API key", () => {
    expect(() => {
      new AnthropicProvider("");
    }).toThrow("Anthropic API key is required");
  });

  it("should create provider with API key", () => {
    const provider = new AnthropicProvider("test-key");
    expect(provider.name).toBe("anthropic");
  });

  // Note: Actual API calls require a real API key and would cost money
  // These tests verify the structure, not actual API calls
});
