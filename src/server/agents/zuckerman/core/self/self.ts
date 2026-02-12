import { randomUUID } from "node:crypto";
import type { AgentRunParams, AgentRunResult } from "@server/world/runtime/agents/types.js";
import { loadConfig } from "@server/world/config/index.js";
import { resolveAgentHomedir } from "@server/world/homedir/resolver.js";
import { UnifiedMemoryManager } from "@server/agents/zuckerman/core/memory/manager.js";
import { resolveMemorySearchConfig } from "@server/agents/zuckerman/core/memory/config.js";
import type { AgentEvent } from "./events.js";
import { convertToModelMessages } from "@server/world/providers/llm/helpers.js";
import { streamText } from "ai";
import type { Tool, LanguageModel, ModelMessage } from "ai";
import { LLMProvider } from "@server/world/providers/llm/index.js";
import { ToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import { IdentityLoader } from "../identity/identity-loader.js";
import { agentDiscovery } from "@server/agents/discovery.js";
import { formatMemoriesForPrompt } from "../memory/prompt-formatter.js";
import { System1BrainParts } from "./system1-brain-parts.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { ToolExecutor } from "./tool-executor.js";

export type EventHandler<T extends AgentEvent = AgentEvent> = (event: T) => void | Promise<void>;

const MAX_ITERATIONS = 50;

export class Self {
  readonly agentId: string;
  private memoryManager!: UnifiedMemoryManager;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private toolExecutor: ToolExecutor;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.toolExecutor = new ToolExecutor((event) => this.emit(event));
  }

  async initialize(): Promise<void> {
    try {
      const config = await loadConfig();
      const homedir = resolveAgentHomedir(config, this.agentId);
      this.memoryManager = UnifiedMemoryManager.create(homedir, this.agentId);

      const memorySearchConfig = config.agent?.memorySearch;
      if (memorySearchConfig) {
        const resolvedConfig = resolveMemorySearchConfig(memorySearchConfig, homedir, this.agentId);
        if (resolvedConfig) {
          await this.memoryManager.initializeDatabase(resolvedConfig, this.agentId);
        }
      }
    } catch (error) {
      console.warn(`[Self] Initialization failed:`, error instanceof Error ? error.message : String(error));
    }
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const { conversationId, message, runId = randomUUID() } = params;

    try {
      console.log(`[Self] Starting run ${runId} for conversation ${conversationId}`);
      const {
        systemPrompt,
        llmModel,
        availableTools,
        memoryManager,
        temperature,
      } = await this.initializeCore(conversationId);
      console.log(`[Self] Initialized - tools: ${Object.keys(availableTools).length}, temp: ${temperature ?? 'default'}`);

      // Convert ConversationMessage[] to ModelMessage[]
      const conversationMessages = params.conversationMessages 
        ? convertToModelMessages(params.conversationMessages)
        : [];

      // Emit lifecycle start event
      await this.emit({
        type: "stream.lifecycle",
        conversationId,
        runId,
        phase: "start",
        message,
      });

      // Build context if needed (simple proactive gathering)
      const contextResult = await System1BrainParts.buildContext(
        runId,
        message,
        conversationId,
        llmModel,
        availableTools
      );
      const enrichedMessage = contextResult.enrichedMessage;
      console.log(`[Self] Context built - enriched: ${enrichedMessage !== message}`);
      // Context gathering messages are internal - don't add to conversation

      // Get relevant memories
      const memoriesText = await memoryManager.getRelevantMemories(message, {
        limit: 50,
        types: ["semantic", "episodic", "procedural"],
      }).then(formatMemoriesForPrompt).catch((error) => {
        console.warn(`[Self] Memory retrieval failed:`, error);
        return "";
      });
      console.log(`[Self] Memories retrieved - length: ${memoriesText.length}`);

      // Start with existing conversation messages (excluding system messages)
      let messages: ModelMessage[] = conversationMessages.filter(m => m.role !== "system");
      
      for (let iterations = 0; iterations < MAX_ITERATIONS; iterations++) {
        console.log(`[Self] Iteration ${iterations + 1}/${MAX_ITERATIONS}`);
        
        // Build messages with system prompt
        const messagesWithSystem: ModelMessage[] = [
          {
            role: "system",
            content: `${systemPrompt}\n\n${memoriesText}`.trim(),
          },
          ...messages,
        ];

        // Add continuation prompt if last message was assistant
        if (messages.length > 0 && messages[messages.length - 1].role === "assistant") {
          messagesWithSystem.push({
            role: "user",
            content: "Please continue.",
          });
        }

        const streamResult = await streamText({
          model: llmModel,
          messages: messagesWithSystem,
          temperature,
          tools: Object.keys(availableTools).length > 0 ? availableTools : undefined,
        });

        let content = "";
        for await (const chunk of streamResult.textStream) {
          content += chunk;
          await this.emit({
            type: "stream.token",
            conversationId,
            runId,
            token: chunk,
          });
        }

        // Handle tool calls
        const toolCalls = await streamResult.toolCalls;
        const usage = await streamResult.usage;
        const tokensUsed = usage?.totalTokens;

        // If there are tool calls, execute them and add to messages
        if (toolCalls?.length) {
          const { assistantMsg, toolResultMsgs } = await this.toolExecutor.executeToolCalls(
            toolCalls,
            content,
            availableTools,
            messagesWithSystem,
            conversationId,
            runId
          );
          messages.push(assistantMsg, ...toolResultMsgs);
          continue;
        }

        // Validate only when about to finish and return response
        try {
          const validation = await System1BrainParts.validate(
            enrichedMessage,
            content,
            llmModel,
            availableTools
          );

          if (!validation.satisfied) {
            console.log(`[Self] Validation failed: ${validation.reason}`);
            const missing = validation.missing.length ? ` Missing: ${validation.missing.join(", ")}.` : "";
            await this.emit({
              type: "think",
              conversationId,
              thought: `Validation: ${validation.reason}.${missing} Instructions: Try different approach to complete the task.`,
              runId
            });
            continue;
          }
        } catch (error) {
          console.warn(`[Self] Validation error:`, error);
        }

        // Add assistant response to messages
        messages.push({
          role: "assistant",
          content: content,
        });
        
        // Only save if responding to a real user message (not the internal "Please continue" prompt)
        // Check if last message before this assistant response was a user message
        const lastMessageBeforeAssistant = messages.length > 1 ? messages[messages.length - 2] : null;
        const isRespondingToUser = lastMessageBeforeAssistant?.role === "user";
        
        if (isRespondingToUser) {
          await this.emit({ type: "write", conversationId, content, role: "assistant", runId });
        }
        console.log(`[Self] Completed - tokens: ${tokensUsed ?? 'N/A'}`);
        await this.emit({ type: "stream.lifecycle", conversationId, runId, phase: "end", tokensUsed });
        return { runId, response: content, tokensUsed };
      }

      // Max iterations reached
      console.log(`[Self] Max iterations reached (${MAX_ITERATIONS})`);
      const finalResponse = "Task may require more iterations to complete.";
      await Promise.all([
        this.emit({ type: "write", conversationId, content: finalResponse, role: "assistant", runId }),
        this.emit({ type: "stream.lifecycle", conversationId, runId, phase: "end", tokensUsed: 0 }),
      ]);
      return { runId, response: finalResponse };
    } catch (err) {
      await this.emit({
        type: "stream.lifecycle",
        conversationId,
        runId,
        phase: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  private async initializeCore(
    conversationId: string
  ): Promise<{
    systemPrompt: string;
    llmModel: LanguageModel;
    availableTools: Record<string, Tool>;
    memoryManager: UnifiedMemoryManager;
    temperature: number | undefined;
  }> {
    const config = await loadConfig();
    const homedir = resolveAgentHomedir(config, this.agentId);

    const metadata = agentDiscovery.getMetadata(this.agentId);
    if (!metadata) {
      throw new Error(`Agent "${this.agentId}" not found in discovery service`);
    }

    const systemPrompt = await new IdentityLoader().getSystemPrompt(
      metadata.agentDir
    );
    const llmModel = await LLMProvider.getInstance().fastCheap();

    const toolRegistry = new ToolRegistry();
    const availableTools = Object.fromEntries(toolRegistry.getToolsMap());

    const memoryManager = UnifiedMemoryManager.create(homedir, this.agentId);

    // Get temperature from conversation entry
    const temperature = new ConversationManager(this.agentId)
      .getConversationEntry(conversationId)?.temperatureOverride;

    return {
      systemPrompt,
      llmModel,
      availableTools,
      memoryManager,
      temperature,
    };
  }

  /**
   * Register an event handler for a specific event type
   */
  on<T extends AgentEvent>(eventType: T["type"], handler: EventHandler<T>): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    const handlers = this.eventHandlers.get(eventType)!;
    handlers.add(handler as EventHandler);
    return () => handlers.delete(handler as EventHandler);
  }

  /**
   * Emit an event to all registered handlers
   */
  async emit(event: AgentEvent): Promise<void> {
    const handlers = this.eventHandlers.get(event.type);
    if (!handlers) return;

    await Promise.all(
      Array.from(handlers).map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          console.error(`[Self] Error in event handler for "${event.type}":`, error);
        }
      })
    );
  }
}
