import { randomUUID } from "node:crypto";
import type { AgentRuntime, AgentRunParams, AgentRunResult } from "@server/world/runtime/agents/types.js";
import { loadConfig } from "@server/world/config/index.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { ToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import { LLMProvider } from "@server/world/providers/llm/index.js";
import { IdentityLoader } from "../identity/identity-loader.js";
import { agentDiscovery } from "@server/agents/discovery.js";
import { resolveAgentHomedir } from "@server/world/homedir/resolver.js";
import { UnifiedMemoryManager } from "@server/agents/zuckerman/core/memory/manager.js";
import { resolveMemorySearchConfig } from "@server/agents/zuckerman/core/memory/config.js";
import { generateText } from "ai";
import { formatMemoriesForPrompt } from "../memory/prompt-formatter.js";
import { StreamEventEmitter } from "@server/world/communication/stream-emitter.js";
import { System1 } from "../system1/system1-central.js";
import { System2 } from "../system2/system2-central.js";

export class Self {
  readonly agentId: string;
  private identityLoader: IdentityLoader;
  private memoryManager!: UnifiedMemoryManager;
  private llmManager: LLMProvider;
  private conversationManager: ConversationManager;
  private toolRegistry: ToolRegistry;
  private readonly agentDir: string;

  constructor(agentId: string, conversationManager?: ConversationManager, llmManager?: LLMProvider, identityLoader?: IdentityLoader) {
    this.agentId = agentId;
    this.conversationManager = conversationManager || new ConversationManager(this.agentId);
    this.toolRegistry = new ToolRegistry();
    this.llmManager = llmManager || LLMProvider.getInstance();
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
      console.warn(`[ZuckermanRuntime] Initialization failed:`, error instanceof Error ? error.message : String(error));
      // Continue without database - memory search will be disabled
    }
  }


  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const { conversationId, message, temperature, stream } = params;
    const runId = randomUUID();

    // Get LLM model and config
    const config = await loadConfig();
    const llmModel = await this.llmManager.fastCheap();
    const homedir = resolveAgentHomedir(config, this.agentId);

    // Get system prompt
    const systemPrompt = await this.identityLoader.getSystemPrompt(this.agentDir);

    // Prepare tools for LLM - convert from registry format to AI SDK format
    const { convertToAITools } = await import("@server/world/providers/llm/helpers.js");
    const availableTools = convertToAITools(this.toolRegistry.getToolsMap());

    const streamEmitter = new StreamEventEmitter(stream, this.agentId, conversationId);

    // Handle channel metadata
    if (params.channelMetadata) {
      await this.conversationManager.updateChannelMetadata(conversationId, params.channelMetadata);
    }

    // Persist user message
    await this.conversationManager.addMessage(conversationId, "user", message, { runId });

    // Get relevant memories
    let relevantMemoriesText = "";
    try {
      const memoryResult = await this.memoryManager.getRelevantMemories(message, {
        limit: 50,
        types: ["semantic", "episodic", "procedural"],
      });
      relevantMemoriesText = formatMemoriesForPrompt(memoryResult);
    } catch (error) {
      console.warn(`[self] Memory retrieval failed:`, error);
    }

    // Remember memories (async)
    const conversationContext = this.conversationManager.getConversation(conversationId)?.messages.slice(-3).map(m => m.content).join("\n");
    this.memoryManager.onNewMessage(message, conversationId, conversationContext)
      .catch(err => console.warn(`[self] Failed to remember memories:`, err));

    await streamEmitter.emitLifecycleStart(runId, message);

    try {
      console.log(`[Self] Selecting system for message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
      const selectedSystem = await this.selectSystem(message, conversationId, llmModel, streamEmitter, runId);
      console.log(`[Self] Selected ${selectedSystem.toUpperCase()} for runId: ${runId}`);
      
      if (selectedSystem === "system2") {
        console.log(`[Self] Routing to System2`);
        const system2 = new System2(
          this.conversationManager,
          this.agentId,
          conversationId,
          runId,
          message,
          temperature,
          homedir,
          llmModel,
          streamEmitter,
          availableTools,
          systemPrompt,
          relevantMemoriesText
        );
        return await system2.run();
      } else {
        console.log(`[Self] Routing to System1`);
        const system1 = new System1(
          this.conversationManager,
          this.agentId,
          conversationId,
          runId,
          message,
          temperature,
          llmModel,
          streamEmitter,
          availableTools,
          systemPrompt,
          relevantMemoriesText,
          this.toolRegistry
        );
        return await system1.run({useContextBuilder: true});
      }
    } catch (err) {
      console.error(`[ZuckermanRuntime] Error in run:`, err);
      await streamEmitter.emitLifecycleError(runId, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  /**
   * Determine which system (1 or 2) should handle the current message
   */
  private async selectSystem(
    message: string,
    conversationId: string,
    llmModel: any,
    streamEmitter: StreamEventEmitter,
    runId: string
  ): Promise<"system1" | "system2"> {
    console.log(`[Self] Starting system selection for runId: ${runId}`);
    
    const conversation = this.conversationManager.getConversation(conversationId);
    const conversationContext = conversation?.messages.slice(-3).map(m => `${m.role}: ${m.content}`).join("\n") || "No previous messages";
    
    const systemSelectionPrompt = `You ARE Zuckerman. You are thinking through your Self - your central coordinator deciding which processing system you should use.

CONTEXT: You ARE Zuckerman. You are an autonomous AI agent operating completely independently. You have no human assistance and must rely entirely on your own capabilities, tools, and reasoning. You need to decide which processing system you should use to handle what you need to do.

IMPORTANT: You ARE Zuckerman. You are operating completely independently. There is no one else who can help you - you must rely entirely on your own capabilities, tools, and reasoning. All decisions must be made by you alone.

System 1: Fast, intuitive, reactive processing. Use for:
- Simple questions and answers
- Direct tool usage requests
- Quick information retrieval
- Straightforward tasks
- Casual conversation

System 2: Deliberate, analytical, multi-module processing. Use for:
- Complex problem-solving requiring multiple steps
- Tasks needing planning and decomposition
- Situations requiring reflection and criticism
- Multi-faceted requests with multiple considerations
- Tasks that benefit from parallel module evaluation

Respond with ONLY "system1" or "system2" - no other text.`;

    const userPrompt = `What you need to do: "${message}"

Conversation context: ${conversationContext}

Which system should I use?`;

    try {
      console.log(`[Self] Calling LLM for system selection`);
      const result = await generateText({
        model: llmModel,
        messages: [
          {
            role: "system",
            content: systemSelectionPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        temperature: 0.1,
      });

      const rawSelection = result.text.trim();
      const selection = rawSelection.toLowerCase();
      console.log(`[Self] LLM raw response: "${rawSelection}"`);
      
      const finalSelection = (selection === "system2" || selection.includes("2")) ? "system2" : "system1";
      console.log(`[Self] Parsed selection: ${finalSelection}`);
      
      return finalSelection;
    } catch (error) {
      console.warn(`[Self] System selection failed, defaulting to System1:`, error);
      return "system1";
    }
  }
}

// Backward compatibility
export const ZuckermanRuntime = Self;
