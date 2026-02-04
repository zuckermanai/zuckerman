import type { Tool } from "./terminal/index.js";
import { createTerminalTool } from "./terminal/index.js";
import { createBrowserTool } from "./browser/index.js";
import { createCronTool } from "./cron/index.js";
import { createMultiEditTool } from "./multiedit/index.js";
import { createBatchTool, type BatchExecutionContext } from "./batch/index.js";
import { createWhatsAppTool } from "./channels/whatsapp.js";
import { createTelegramTool } from "./channels/telegram.js";
import { createDiscordTool } from "./channels/discord.js";
import { createSignalTool } from "./channels/signal.js";
import { createMemorySearchTool, createMemoryGetTool } from "./memory/index.js";
import { createTextToSpeechTool } from "./voice/texttospeech/tool.js";
import { createSpeechToTextTool } from "./voice/speechtotext/tool.js";

export class ZuckermanToolRegistry {
  private tools = new Map<string, Tool>();
  private conversationId: string = "";

  constructor(conversationId?: string) {
    this.conversationId = conversationId || "";
    
    // Register default tools
    this.register(createTerminalTool());
    this.register(createBrowserTool());
    this.register(createCronTool());
    this.register(createMultiEditTool());
    this.register(createWhatsAppTool());
    this.register(createTelegramTool());
    this.register(createDiscordTool());
    this.register(createSignalTool());
    this.register(createMemorySearchTool());
    this.register(createMemoryGetTool());
    this.register(createTextToSpeechTool());
    this.register(createSpeechToTextTool());
    
    // Register batch tool with execution context
    this.registerBatchTool();
  }

  /**
   * Register batch tool with execution context
   * This must be called after all other tools are registered
   */
  private registerBatchTool(): void {
    const batchContext: BatchExecutionContext = {
      conversationId: this.conversationId,
      executeTool: async (toolName, params, securityContext, executionContext) => {
        const tool = this.get(toolName);
        if (!tool) {
          return {
            success: false,
            error: `Tool "${toolName}" not found`,
          };
        }
        if (!securityContext) {
          return {
            success: false,
            error: `Security context is required to execute tool "${toolName}"`,
          };
        }
        if (!executionContext) {
          return {
            success: false,
            error: `Execution context is required to execute tool "${toolName}"`,
          };
        }
        return await tool.handler(params, securityContext, executionContext);
      },
      getAvailableTools: () => {
        return Array.from(this.tools.keys()).filter(name => name !== "batch");
      },
    };

    this.register(createBatchTool(batchContext));
  }

  /**
   * Update conversation ID and re-register batch tool
   * This allows batch tool to have correct conversation context
   */
  setConversationId(conversationId: string): void {
    this.conversationId = conversationId;
    // Remove old batch tool if exists
    this.tools.delete("batch");
    // Re-register with new conversation ID
    this.registerBatchTool();
  }

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get tool with repair - attempts to fix case mismatches
   * Returns the tool if found, or attempts lowercase/repair
   */
  getWithRepair(name: string): { tool: Tool; repaired: boolean; originalName: string } | null {
    // Try exact match first
    const exactTool = this.tools.get(name);
    if (exactTool) {
      return { tool: exactTool, repaired: false, originalName: name };
    }

    // Try lowercase version (common case mismatch)
    const lowerName = name.toLowerCase();
    if (lowerName !== name) {
      const lowerTool = this.tools.get(lowerName);
      if (lowerTool) {
        return { tool: lowerTool, repaired: true, originalName: name };
      }
    }

    return null;
  }

  /**
   * Find similar tool names (for suggestions)
   */
  findSimilar(name: string, maxResults: number = 3): string[] {
    const available = Array.from(this.tools.keys());
    const lowerName = name.toLowerCase();
    
    // Calculate similarity scores
    const scored = available.map(toolName => {
      const lowerTool = toolName.toLowerCase();
      
      // Exact match (case-insensitive)
      if (lowerTool === lowerName) return { name: toolName, score: 100 };
      
      // Starts with
      if (lowerTool.startsWith(lowerName) || lowerName.startsWith(lowerTool)) {
        return { name: toolName, score: 80 };
      }
      
      // Contains
      if (lowerTool.includes(lowerName) || lowerName.includes(lowerTool)) {
        return { name: toolName, score: 60 };
      }
      
      // Levenshtein-like: count matching characters
      let matches = 0;
      const minLen = Math.min(lowerName.length, lowerTool.length);
      for (let i = 0; i < minLen; i++) {
        if (lowerName[i] === lowerTool[i]) matches++;
      }
      const score = (matches / Math.max(lowerName.length, lowerTool.length)) * 40;
      
      return { name: toolName, score };
    });
    
    // Sort by score and return top matches
    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(item => item.name);
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
