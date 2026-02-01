import { describe, it, expect } from "vitest";
import { ZuckermanRuntime } from "@agents/zuckerman/core/awareness/runtime.js";

describe("ZuckermanRuntime", () => {
  const runtime = new ZuckermanRuntime();

  it("should load prompts for zuckerman agent", async () => {
    const prompts = await runtime.loadPrompts();
    expect(prompts).not.toBeNull();
    expect(prompts?.system).toBeDefined();
    expect(prompts?.personality).toBeDefined();
    expect(prompts?.behavior).toBeDefined();
  });

  it("should load prompts for zuckerman", async () => {
    const prompts = await runtime.loadPrompts();
    expect(prompts).toBeDefined();
    expect(prompts.system).toBeDefined();
  });

  it("should run an agent", async () => {
    const result = await runtime.run({
      sessionId: "test-session",
      message: "Hello",
    });

    expect(result).toHaveProperty("response");
    expect(result).toHaveProperty("runId");
    expect(result.runId).toBeTruthy();
    expect(result.response).toBeTruthy();
    expect(typeof result.response).toBe("string");
    // In test mode, mock provider returns a response
    expect(result.response.length).toBeGreaterThan(0);
  });

  it("should cache prompts", async () => {
    const runtime2 = new ZuckermanRuntime();
    
    const prompts1 = await runtime2.loadPrompts();
    const prompts2 = await runtime2.loadPrompts();
    
    // Should be the same object (cached)
    expect(prompts1).toBe(prompts2);
  });

  it("should clear cache", async () => {
    const runtime3 = new ZuckermanRuntime();
    
    await runtime3.loadPrompts();
    runtime3.clearCache();
    
    const promptsAfter = await runtime3.loadPrompts();
    // Should reload (not cached)
    expect(promptsAfter).not.toBeNull();
  });
});
