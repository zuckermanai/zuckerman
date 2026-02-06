import { randomUUID } from "node:crypto";
import type { AgentRuntime, AgentRunParams, AgentRunResult } from "@server/world/runtime/agents/types.js";
import type { LLMTool } from "@server/world/providers/llm/types.js";
import { loadConfig } from "@server/world/config/index.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { ZuckermanToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import { LLMManager } from "@server/world/providers/llm/index.js";
import { PromptLoader, type LoadedPrompts } from "../identity/identity-loader.js";
import { agentDiscovery } from "@server/agents/discovery.js";
import { resolveAgentHomedir } from "@server/world/homedir/resolver.js";
import { UnifiedMemoryManager } from "@server/agents/zuckerman/core/memory/manager.js";
import { activityRecorder } from "@server/world/activity/index.js";
import { resolveMemorySearchConfig } from "@server/agents/zuckerman/core/memory/config.js";
import { StreamEventEmitter, MemoryHandler, MessageBuilder, LLMService, ToolExecutor } from "./services/index.js";

export class ZuckermanAwareness implements AgentRuntime {
  readonly agentId = "zuckerman";
  
  private promptLoader: PromptLoader;
  private llmManager: LLMManager;
  private conversationManager: ConversationManager;
  private toolRegistry: ZuckermanToolRegistry;

  private memoryManager: UnifiedMemoryManager | null = null;
  
  // Load prompts from agent's core directory (where markdown files are)
  private readonly agentDir: string;

  constructor(conversationManager?: ConversationManager, llmManager?: LLMManager, promptLoader?: PromptLoader) {
    this.conversationManager = conversationManager || new ConversationManager(this.agentId);
    // Initialize tool registry without conversationId - will be set per-run
    this.toolRegistry = new ZuckermanToolRegistry();
    this.llmManager = llmManager || LLMManager.getInstance();
    this.promptLoader = promptLoader || new PromptLoader();
    
    // Get agent directory from discovery service
    const metadata = agentDiscovery.getMetadata(this.agentId);
    if (!metadata) {
      throw new Error(`Agent "${this.agentId}" not found in discovery service`);
    }
    this.agentDir = metadata.agentDir;
  }

  /**
   * Initialize memory manager with homedir directory
   */
  private initializeMemoryManager(homedir: string): void {
    if (!this.memoryManager) {
      this.memoryManager = UnifiedMemoryManager.create(homedir, this.agentId);
    }
  }

  /**
   * Get memory manager instance (must be initialized first)
   */
  private getMemoryManager(): UnifiedMemoryManager {
    if (!this.memoryManager) {
      throw new Error("Memory manager not initialized. Call initializeMemoryManager first.");
    }
    return this.memoryManager;
  }

  /**
   * Initialize the agent - called once when agent is created
   */
  async initialize(): Promise<void> {
    try {
      const config = await loadConfig();
      const homedir = resolveAgentHomedir(config, this.agentId);
      
      // Initialize memory manager
      this.initializeMemoryManager(homedir);
      
      // Initialize database for vector search if memory search is enabled
      const memorySearchConfig = config.agent?.memorySearch;
      if (memorySearchConfig) {
        const resolvedConfig = resolveMemorySearchConfig(memorySearchConfig, homedir, this.agentId);
        if (resolvedConfig) {
          await this.getMemoryManager().initializeDatabase(resolvedConfig, this.agentId);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[ZuckermanRuntime] Initialization failed:`, message);
      // Continue without database - memory search will be disabled
    }
  }

  async loadPrompts(): Promise<LoadedPrompts> {
    return this.promptLoader.loadPrompts(this.agentDir);
  }

  async buildSystemPrompt(
    prompts: LoadedPrompts,
    homedir?: string,
  ): Promise<string> {
    const basePrompt = this.promptLoader.buildSystemPrompt(prompts);
    const parts: string[] = [basePrompt];
    
    
    // Add tool information to system prompt
    const tools = this.toolRegistry.list();
    if (tools.length > 0) {
      const toolDescriptions = tools.map((tool) => {
        return `- **${tool.definition.name}**: ${tool.definition.description}`;
      }).join("\n");
      
      const toolSection = `\n\n## Available Tools\n\nUse these tools to perform actions. When you need to execute a command, read a file, or perform any operation, call the appropriate tool with the required parameters. Tools execute operations directly - you don't need to show commands or code.\n\n${toolDescriptions}`;
      
      parts.push(toolSection);
    }
    
    return parts.join("\n\n---\n\n");
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const { conversationId, message, temperature, securityContext, stream } = params;
    const runId = randomUUID();

    // Initialize stream emitter
    const streamEmitter = new StreamEventEmitter(stream);

    // Record agent run start
    await activityRecorder.recordAgentRunStart(
      this.agentId,
      conversationId,
      runId,
      message,
    );

    await streamEmitter.emitLifecycleStart(runId);

    try {
      // Update tool registry conversation ID for batch tool context
      this.toolRegistry.setConversationId(conversationId);

      // Get LLM model and config
      const config = await loadConfig();
      const defaultModel = await this.llmManager.fastCheap();

      // Resolve homedir directory
      const homedir = resolveAgentHomedir(config, this.agentId);

      // Initialize memory manager if not already initialized
      this.initializeMemoryManager(homedir);

      // Initialize memory services
      const memoryManager = this.getMemoryManager();
      const memoryHandler = new MemoryHandler(memoryManager);
      const messageBuilder = new MessageBuilder(memoryHandler);

      // Load prompts and build system prompt
      const prompts = await this.loadPrompts();
      const systemPrompt = await this.buildSystemPrompt(prompts, homedir);

      // Build messages with memory context
      const conversation = this.conversationManager.getConversation(conversationId) ?? null;
      const relevantMemoriesText = await memoryHandler.getRelevantMemoriesText(message);
      const messages = await messageBuilder.buildMessages(
        systemPrompt,
        message,
        conversation,
        relevantMemoriesText
      );

      // Extract memories from new message
      const conversationContext = messageBuilder.getConversationContext(conversation);
      await memoryHandler.extractMemories(message, conversationId, conversationContext);

      // Prepare tools for LLM
      const llmTools: LLMTool[] = this.toolRegistry.list().map(t => ({
        type: "function" as const,
        function: t.definition
      }));

      // Initialize LLM service
      const llmService = new LLMService(defaultModel, streamEmitter, runId);

      // Run LLM
      const result = await llmService.call({
        messages,
        temperature,
        tools: llmTools,
      });

      // Handle tool calls if any
      if (result.toolCalls && result.toolCalls.length > 0) {
        const toolExecutor = new ToolExecutor(
          this.agentId,
          this.toolRegistry,
          streamEmitter,
          llmService
        );
        return await toolExecutor.execute({
          conversationId,
          runId,
          messages,
          toolCalls: result.toolCalls,
          securityContext,
          temperature,
          llmTools,
          homedir,
          agentId: this.agentId,
        });
      }

      await streamEmitter.emitLifecycleEnd(runId, result.tokensUsed?.total);

      // Record agent run completion
      await activityRecorder.recordAgentRunComplete(
        this.agentId,
        conversationId,
        runId,
        result.content,
        result.tokensUsed?.total,
        undefined,
      );

      return {
        runId,
        response: result.content,
        tokensUsed: result.tokensUsed?.total,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await streamEmitter.emitLifecycleError(runId, errorMessage);

      await activityRecorder.recordAgentRunError(
        this.agentId,
        conversationId,
        runId,
        errorMessage,
      );
      console.error(`[ZuckermanRuntime] Error in run:`, err);
      throw err;
    }
  }

  clearCache(): void {
    this.promptCacheClear();
    this.llmManager.clearCache();
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
