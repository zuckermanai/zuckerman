import type { Tool } from "./terminal/index.js";
import { createTerminalTool } from "./terminal/index.js";
import { createBrowserTool } from "./browser/index.js";
import { createCronTool } from "./cron/index.js";
import { createDeviceTool } from "./device/index.js";
import { createFilesystemTool } from "./filesystem/index.js";

export class ZuckermanToolRegistry {
  private tools = new Map<string, Tool>();

  constructor() {
    // Register default tools
    this.register(createTerminalTool());
    this.register(createBrowserTool());
    this.register(createCronTool());
    this.register(createDeviceTool());
    this.register(createFilesystemTool());
  }

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  getDefinitions(): Array<{ name: string; description: string; parameters: unknown }> {
    return this.list().map((tool) => ({
      name: tool.definition.name,
      description: tool.definition.description,
      parameters: tool.definition.parameters,
    }));
  }
}
