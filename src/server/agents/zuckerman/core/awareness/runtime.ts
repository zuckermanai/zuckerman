import { randomUUID } from "node:crypto";
import type { AgentRuntime, AgentRunParams, AgentRunResult } from "@server/world/runtime/agents/types.js";
import type { LLMTool } from "@server/world/providers/llm/types.js";
import { loadConfig } from "@server/world/config/index.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { ToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import { LLMManager } from "@server/world/providers/llm/index.js";
import { IdentityLoader, type LoadedPrompts } from "../identity/identity-loader.js";
import { agentDiscovery } from "@server/agents/discovery.js";
import { resolveAgentHomedir } from "@server/world/homedir/resolver.js";
import { UnifiedMemoryManager } from "@server/agents/zuckerman/core/memory/manager.js";
import { activityRecorder } from "@server/agents/zuckerman/activity/index.js";
import { resolveMemorySearchConfig } from "@server/agents/zuckerman/core/memory/config.js";
import { LLMService } from "./llm-service.js";
import type { RunContext } from "./context.js";
import { formatMemoriesForPrompt } from "../memory/prompt-formatter.js";
import { ToolService } from "../../tools/index.js";
import { StreamEventEmitter } from "@server/world/communication/stream-emitter.js";
import { ValidationService } from "../planning/validation-service.js";

export class Awareness implements AgentRuntime {
  readonly agentId = "zuckerman";
  
  private identityLoader: IdentityLoader;
  private memoryManager!: UnifiedMemoryManager;

  private llmManager: LLMManager;
  private conversationManager: ConversationManager;
  private toolRegistry: ToolRegistry;

  
  // Load prompts from agent's core directory (where markdown files are)
  private readonly agentDir: string;

  constructor(conversationManager?: ConversationManager, llmManager?: LLMManager, identityLoader?: IdentityLoader) {
    this.conversationManager = conversationManager || new ConversationManager(this.agentId);
    // Initialize tool registry without conversationId - will be set per-run
    this.toolRegistry = new ToolRegistry();
    this.llmManager = llmManager || LLMManager.getInstance();
    this.identityLoader = identityLoader || new IdentityLoader();
    
    // Get agent directory from discovery service
    const metadata = agentDiscovery.getMetadata(this.agentId);
    if (!metadata) {
      throw new Error(`Agent "${this.agentId}" not found in discovery service`);
    }
    this.agentDir = metadata.agentDir;
  }

  /**
   * Initialize the agent - called once when agent is created
   */
  async initialize(): Promise<void> {
    try {
      const config = await loadConfig();
      const homedir = resolveAgentHomedir(config, this.agentId);
      this.memoryManager = UnifiedMemoryManager.create(homedir, this.agentId);
      
      // Initialize database for vector search if memory search is enabled
      const memorySearchConfig = config.agent?.memorySearch;
      if (memorySearchConfig) {
        const resolvedConfig = resolveMemorySearchConfig(memorySearchConfig, homedir, this.agentId);
        if (resolvedConfig) {
          await this.memoryManager.initializeDatabase(resolvedConfig, this.agentId);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ZuckermanRuntime] Initialization failed:`, message);
      // Continue without database - memory search will be disabled
    }
  }

  /**
   * Build execution context for a run
   */
  private async buildRunContext(params: AgentRunParams): Promise<RunContext> {
    const { conversationId, message, temperature, securityContext, stream } = params;
    const runId = randomUUID();

    // Update tool registry conversation ID for batch tool context
    this.toolRegistry.setConversationId(conversationId);

    // Get LLM model and config
    const config = await loadConfig();
    const llmModel = await this.llmManager.fastCheap();
    const homedir = resolveAgentHomedir(config, this.agentId);

    // Load prompts and build system prompt
    const prompts = await this.identityLoader.loadPrompts(this.agentDir);
    const systemPrompt = this.identityLoader.buildSystemPrompt(prompts);

    // Prepare tools for LLM
    const availableTools: LLMTool[] = this.toolRegistry.list().map(t => ({
      type: "function" as const,
      function: t.definition
    }));

    // Build context
    const context: RunContext = {
      agentId: this.agentId,
      conversationId,
      runId,
      message,
      temperature,
      securityContext,
      homedir,
      memoryManager: this.memoryManager,
      toolRegistry: this.toolRegistry,
      llmModel,
      streamEmitter: new StreamEventEmitter(stream),
      availableTools,
      systemPrompt,
      relevantMemoriesText: "",
    };

    return context;
  }


  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const context = await this.buildRunContext(params);
    const llmService = new LLMService(context.llmModel, context.streamEmitter, context.runId);

    // Get conversation once - reuse throughout the run
    let conversation = this.conversationManager.getConversation(context.conversationId);

    // Handle channel metadata
    if (params.channelMetadata && conversation) {
      await this.conversationManager.updateChannelMetadata(context.conversationId, params.channelMetadata);
    }

    // Persist user message
    if (conversation) {
      await this.conversationManager.addMessage(context.conversationId, "user", context.message, { runId: context.runId });
      // Refresh conversation to get updated messages
      conversation = this.conversationManager.getConversation(context.conversationId);
    }

    // Get relevant memories
    try {
      const memoryResult = await context.memoryManager.getRelevantMemories(context.message, {
        limit: 50,
        types: ["semantic", "episodic", "procedural"],
      });
      context.relevantMemoriesText = formatMemoriesForPrompt(memoryResult);
    } catch (error) {
      console.warn(`[Awareness] Memory retrieval failed:`, error);
    }

    // Remember memories (async)
    const conversationContext = conversation?.messages.slice(-3).map(m => m.content).join("\n");
    context.memoryManager.onNewMessage(context.message, context.conversationId, conversationContext)
      .catch(err => console.warn(`[Awareness] Failed to remember memories:`, err));

    await activityRecorder.recordAgentRunStart(context.agentId, context.conversationId, context.runId, context.message);
    await context.streamEmitter.emitLifecycleStart(context.runId);

    try {
      const toolService = new ToolService();
      const validationService = new ValidationService(context.llmModel);

      while (true) {
        // Call LLM (buildMessages reads from conversation, pruning happens automatically in addMessage)
        const result = await llmService.call({
          messages: llmService.buildMessages(context, conversation),
          temperature: context.temperature,
          availableTools: context.availableTools,
        });

        // Handle final response (no tool calls)
        if (!result.toolCalls || result.toolCalls.length === 0) {
          try {
            const validation = await validationService.validate({
              userRequest: context.message,
              systemResult: result.content,
            });

            if (!validation.satisfied) {
              const missing = validation.missing.length > 0 ? ` Missing: ${validation.missing.join(', ')}.` : '';
              if (conversation) {
                await this.conversationManager.addMessage(context.conversationId, "system", 
                  `Validation: ${validation.reason}.${missing} Instructions: Try different approach to complete the task.`,
                  { runId: context.runId });
                conversation = this.conversationManager.getConversation(context.conversationId);
              }
              continue;
            }
          } catch (error) {
            console.warn(`[Awareness] Validation error:`, error);
          }

          if (conversation) {
            await this.conversationManager.addMessage(context.conversationId, "assistant", result.content, { runId: context.runId });
          }

          await context.streamEmitter.emitLifecycleEnd(context.runId, result.tokensUsed?.total);
          await activityRecorder.recordAgentRunComplete(
            context.agentId,
            context.conversationId,
            context.runId,
            result.content,
            result.tokensUsed?.total,
            undefined,
          );

          return {
            runId: context.runId,
            response: result.content,
            tokensUsed: result.tokensUsed?.total,
          };
        }

        // Handle tool calls
        const assistantMessage = {
          role: "assistant" as const,
          content: "",
          toolCalls: result.toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
          })),
        };
        if (conversation) {
          await this.conversationManager.addMessage(context.conversationId, "assistant", "", {
            toolCalls: assistantMessage.toolCalls,
            runId: context.runId,
          });
          conversation = this.conversationManager.getConversation(context.conversationId);
        }

        const toolResults = await toolService.executeTools(context, result.toolCalls);
        for (const toolResult of toolResults) {
          if (conversation) {
            await this.conversationManager.addMessage(context.conversationId, "tool", toolResult.content, {
              toolCallId: toolResult.toolCallId,
              runId: context.runId,
            });
          }
        }
        // Refresh conversation after adding tool results
        if (conversation) {
          conversation = this.conversationManager.getConversation(context.conversationId);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await context.streamEmitter.emitLifecycleError(context.runId, errorMessage);
      await activityRecorder.recordAgentRunError(context.agentId, context.conversationId, context.runId, errorMessage);
      console.error(`[ZuckermanRuntime] Error in run:`, err);
      throw err;
    }
  }

  /**
   * Load agent prompts (public API for inspection/debugging)
   */
  async loadPrompts(): Promise<{ files: Map<string, string> }> {
    const prompts = await this.identityLoader.loadPrompts(this.agentDir);
    return { files: prompts.files };
  }

  /**
   * Clear caches (public API for hot reload)
   */
  clearCache(): void {
    // Clear identity loader cache if available
    if (this.identityLoader.clearCache) {
      this.identityLoader.clearCache(this.agentDir);
    }
  }
}

// Backward compatibility
export const ZuckermanRuntime = Awareness;
