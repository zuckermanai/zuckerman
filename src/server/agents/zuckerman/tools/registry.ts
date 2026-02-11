import type { Tool } from "ai";
import { terminalTool } from "./terminal/index.js";
import { browserTool } from "./browser/index.js";
import { createCronTool } from "./cron/index.js";
import { multieditTool } from "./multiedit/index.js";
import { createBatchTool, type BatchExecutionContext } from "./batch/index.js";
import { channelTool } from "./channels/index.js";
import { textToSpeechTool } from "./voice/texttospeech/index.js";
import { speechToTextTool } from "./voice/speechtotext/index.js";
import { mouseTool } from "./mouse/index.js";

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  constructor() {
    // Register default tools
    this.register("terminal", terminalTool);
    this.register("browser", browserTool);
    this.register("cron", createCronTool());
    this.register("multiedit", multieditTool);
    this.register("channel", channelTool);
    this.register("texttospeech", textToSpeechTool);
    this.register("speechtotext", speechToTextTool);
    this.register("mouse", mouseTool);
    
    // Register batch tool
    this.register("batch", createBatchTool({
      executeTool: async (toolName, params) => {
        const tool = this.get(toolName);
        if (!tool?.execute) return `Error: Tool "${toolName}" not found`;
        try {
          const result = await tool.execute(params, { toolCallId: "", messages: [] });
          return typeof result === "string" ? result : JSON.stringify(result);
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : String(error)}`;
        }
      },
      getAvailableTools: () => Array.from(this.tools.keys()).filter(n => n !== "batch"),
    }));
  }

  register(name: string, tool: Tool): void {
    this.tools.set(name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getToolsMap(): Map<string, Tool> {
    return this.tools;
  }
}
