import { describe, it, expect } from "vitest";
import { OpenAIProvider } from "@agents/zuckerman/core/awareness/providers/openai.js";

describe("OpenAIProvider", () => {
  it("should require API key", () => {
    expect(() => {
      new OpenAIProvider("");
    }).toThrow("OpenAI API key is required");
  });

  it("should create provider with API key", () => {
    const provider = new OpenAIProvider("test-key");
    expect(provider.name).toBe("openai");
  });

  // Note: Actual API calls require a real API key and would cost money
  // These tests verify the structure, not actual API calls
});
