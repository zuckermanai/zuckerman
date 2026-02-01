import { randomUUID } from "node:crypto";
import type { AgentRuntime, AgentRunParams, AgentRunResult, StreamCallback } from "@server/world/runtime/agents/types.js";
import type { LLMMessage, LLMTool } from "@server/agents/zuckerman/core/awareness/providers/types.js";
import type { SessionId } from "@server/agents/zuckerman/sessions/types.js";
import { loadConfig } from "@server/world/config/index.js";
import { SessionManager } from "@server/agents/zuckerman/sessions/index.js";
import { ZuckermanToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import { LLMProviderService } from "@server/agents/zuckerman/core/awareness/providers/service/selector.js";
import { selectModel } from "@server/agents/zuckerman/core/awareness/providers/service/model-selector.js";
import { PromptLoader, type LoadedPrompts } from "@server/agents/zuckerman/core/memory/loader.js";
import { agentDiscovery } from "@server/agents/discovery.js";
import {
  resolveAgentLandDir,
} from "@server/world/land/resolver.js";
import {
  loadMemoryForSession,
  formatMemoryForPrompt,
} from "@server/agents/zuckerman/core/memory/persistence.js";

export class ZuckermanAwareness implements AgentRuntime {
  readonly agentId = "zuckerman";
  
  private promptLoader: PromptLoader;
  private providerService: LLMProviderService;
  private sessionManager: SessionManager;
  private toolRegistry: ZuckermanToolRegistry;
  
  // Load prompts from agent's core directory (where markdown files are)
  private readonly agentDir: string;

  constructor(sessionManager?: SessionManager, providerService?: LLMProviderService, promptLoader?: PromptLoader) {
    this.sessionManager = sessionManager || new SessionManager(this.agentId);
    this.toolRegistry = new ZuckermanToolRegistry();
    this.providerService = providerService || new LLMProviderService();
    this.promptLoader = promptLoader || new PromptLoader();
    
    // Get agent directory from discovery service
    const metadata = agentDiscovery.getMetadata(this.agentId);
    if (!metadata) {
      throw new Error(`Agent "${this.agentId}" not found in discovery service`);
    }
    this.agentDir = metadata.agentDir;
  }

  async loadPrompts(): Promise<LoadedPrompts> {
    return this.promptLoader.loadPrompts(this.agentDir);
  }

  async buildSystemPrompt(
    prompts: LoadedPrompts,
    landDir?: string,
  ): Promise<string> {
    const basePrompt = this.promptLoader.buildSystemPrompt(prompts);
    const parts: string[] = [basePrompt];
    
    // Add memory (only for main sessions - will be filtered in run method)
    if (landDir) {
      const { dailyLogs, longTermMemory } = loadMemoryForSession(landDir);
      if (dailyLogs.size > 0 || longTermMemory) {
        const memorySection = formatMemoryForPrompt(dailyLogs, longTermMemory);
        parts.push(memorySection);
      }
    }
    
    // Add tool information to system prompt
    const tools = this.toolRegistry.list();
    if (tools.length > 0) {
      const toolDescriptions = tools.map((tool) => {
        return `- **${tool.definition.name}**: ${tool.definition.description}`;
      }).join("\n");
      
      const toolSection = `\n\n## Available Tools\n\n${toolDescriptions}\n\n## Tool Call Style\nDefault: do not narrate routine, low-risk tool calls (just call the tool).\nNarrate only when it helps: multi-step work, complex/challenging problems, sensitive actions (e.g., deletions), or when the user explicitly asks.\nKeep narration brief and value-dense; avoid repeating obvious steps.\nUse plain human language for narration unless in a technical context.\n\n**Important**: Call tools directly - do NOT show code examples or write code blocks. Actually execute the tool.`;
      
      parts.push(toolSection);
    }
    
    return parts.join("\n\n---\n\n");
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const { sessionId, message, thinkingLevel = "off", temperature, model, securityContext, stream } = params;
    const runId = randomUUID();

    // Get LLM provider and config
    const config = await loadConfig();
    const provider = await this.providerService.selectProvider(config);

    // Resolve land directory
    const landDir = resolveAgentLandDir(config, this.agentId);
    
    // Load prompts
    const prompts = await this.loadPrompts();
    
    // Build system prompt (passing landDir to include memory)
    const systemPrompt = await this.buildSystemPrompt(prompts, landDir);

    // Prepare messages
    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    // Load session history
    const session = this.sessionManager.getSession(sessionId);
    if (session) {
      // Add previous messages (limit to last 20 for context window)
      const history = session.messages.slice(-20);
      for (const msg of history) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }
    }

    // Add current user message
    messages.push({ role: "user", content: message });

    // Select model (thinkingLevel is not a model override - it's a separate parameter)
    const selectedModel = model || selectModel(provider, config);

    // Prepare tools for LLM
    const llmTools: LLMTool[] = this.toolRegistry.list().map(t => ({
      type: "function" as const,
      function: t.definition
    }));

    // Run LLM
    try {
      const result = await provider.call({
        messages,
        model: selectedModel,
        temperature,
        tools: llmTools,
      });

      // Handle tool calls if any
      if (result.toolCalls && result.toolCalls.length > 0) {
        return await this.handleToolCalls({
          sessionId,
          runId,
          messages,
          toolCalls: result.toolCalls,
          securityContext,
          stream,
          model: selectedModel,
          temperature,
          llmTools,
        });
      }

      return {
        runId,
        response: result.content,
        tokensUsed: result.tokensUsed?.total,
      };
    } catch (err) {
      console.error(`[ZuckermanRuntime] Error in run:`, err);
      throw err;
    }
  }

  /**
   * Handle tool calls and iteration
   */
  private async handleToolCalls(params: {
    sessionId: string;
    runId: string;
    messages: LLMMessage[];
    toolCalls: any[];
    securityContext?: any;
    stream?: StreamCallback;
    model?: string;
    temperature?: number;
    llmTools: LLMTool[];
  }): Promise<AgentRunResult> {
    const { sessionId, runId, messages, toolCalls, securityContext, stream, model, temperature, llmTools } = params;
    
    // Add assistant message with tool calls to history
    messages.push({
      role: "assistant",
      content: "",
      toolCalls,
    });

    // Execute tools
    const toolCallResults = [];
    for (const toolCall of toolCalls) {
      const tool = this.toolRegistry.get(toolCall.name);
      if (!tool) {
        toolCallResults.push({
          toolCallId: toolCall.id,
          role: "tool" as const,
          content: `Error: Tool "${toolCall.name}" not found`,
        });
        continue;
      }

      try {
        // Emit tool start event
        if (stream) {
          stream({
            type: "tool.call",
            data: {
              tool: toolCall.name,
              toolArgs: typeof toolCall.arguments === "string" 
                ? JSON.parse(toolCall.arguments) 
                : toolCall.arguments,
            },
          });
        }

        // Parse arguments
        const args = typeof toolCall.arguments === "string"
          ? JSON.parse(toolCall.arguments)
          : toolCall.arguments;

        // Execute tool
        const result = await tool.handler(args, securityContext);

        // Emit tool end event
        if (stream) {
          stream({
            type: "tool.result",
            data: {
              tool: toolCall.name,
              toolResult: result,
            },
          });
        }

        toolCallResults.push({
          toolCallId: toolCall.id,
          role: "tool" as const,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        toolCallResults.push({
          toolCallId: toolCall.id,
          role: "tool" as const,
          content: `Error executing tool: ${errorMsg}`,
        });
      }
    }

    // Add tool results to messages
    for (const result of toolCallResults) {
      messages.push(result);
    }

    // Run LLM again with tool results
    const config = await loadConfig();
    const provider = await this.providerService.selectProvider(config);
    
    const result = await provider.call({
      messages,
      model,
      temperature,
      tools: llmTools,
    });

    // Handle nested tool calls (recursive)
    if (result.toolCalls && result.toolCalls.length > 0) {
      return await this.handleToolCalls({
        sessionId,
        runId,
        messages,
        toolCalls: result.toolCalls,
        securityContext,
        stream,
        model,
        temperature,
        llmTools,
      });
    }

    return {
      runId,
      response: result.content,
      tokensUsed: result.tokensUsed?.total,
    };
  }

  clearCache(): void {
    this.promptCacheClear();
    this.providerService.clearCache();
  }

  private promptCacheClear(): void {
    if (this.agentDir) {
      this.promptLoader.clearCache(this.agentDir);
    } else {
      this.promptLoader.clearCache();
    }
  }
}

// Backward compatibility
export const ZuckermanRuntime = ZuckermanAwareness;
