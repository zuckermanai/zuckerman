import { describe, it, expect } from "vitest";
import { ZuckermanToolRegistry, createTerminalTool } from "@agents/zuckerman/tools/index.js";

describe("ZuckermanToolRegistry", () => {
  it("should register and retrieve tools", () => {
    const registry = new ZuckermanToolRegistry();
    const tool = createTerminalTool();

    registry.register(tool);
    const retrieved = registry.get("terminal");

    expect(retrieved).toBeDefined();
    expect(retrieved?.definition.name).toBe("terminal");
  });

  it("should list all tools", () => {
    const registry = new ZuckermanToolRegistry();
    const tools = registry.list();

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.definition.name === "terminal")).toBe(true);
  });

  it("should get tool definitions", () => {
    const registry = new ZuckermanToolRegistry();
    const definitions = registry.getDefinitions();

    expect(definitions.length).toBeGreaterThan(0);
    const terminalDef = definitions.find((d) => d.name === "terminal");
    expect(terminalDef).toBeDefined();
    expect(terminalDef?.description).toBeTruthy();
  });
});

describe("Terminal Tool", () => {
  it("should execute a command", async () => {
    const tool = createTerminalTool();
    const result = await tool.handler({
      command: "echo",
      args: ["hello"],
    });

    expect(result.success).toBe(true);
    expect(result.result).toHaveProperty("stdout");
    expect(result.result).toHaveProperty("exitCode");
  });

  it("should handle invalid parameters", async () => {
    const tool = createTerminalTool();
    const result = await tool.handler({
      command: 123, // Invalid type
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
