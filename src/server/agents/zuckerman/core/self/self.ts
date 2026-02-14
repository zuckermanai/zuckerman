import { randomUUID } from "node:crypto";
import type { AgentRunParams, AgentRunResult } from "@server/world/runtime/agents/types.js";
import { loadConfig } from "@server/world/config/index.js";
import { resolveAgentHomedir } from "@server/world/homedir/resolver.js";
import { UnifiedMemoryManager } from "@server/agents/zuckerman/core/memory/manager.js";
import { resolveMemorySearchConfig } from "@server/agents/zuckerman/core/memory/config.js";
import type { AgentEvent, MessageEvent } from "./events.js";
import { streamText, generateText, Output } from "ai";
import type { Tool, LanguageModel, ModelMessage } from "ai";
import { z } from "zod";
import { LLMProvider } from "@server/world/providers/llm/index.js";
import { ToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import { IdentityLoader } from "../identity/identity-loader.js";
import { agentDiscovery } from "@server/agents/discovery.js";
import { ToolExecutor } from "./tool-executor.js";
import { SYSTEM2_BRAIN_PARTS, getBrainPart, selfCouncilPrompt, getCommunicationPrompt } from "./system2-brain-parts.js";
import type { BrainPart, EventHandler, Action } from "./types.js";

export class Self {
  readonly agentId: string;
  private memoryManager!: UnifiedMemoryManager;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private toolExecutor: ToolExecutor;
  private llmModel!: LanguageModel;
  private availableTools!: Record<string, Tool>;
  private systemPrompt!: string;
  private isRunning = false;
  private coreInitialized = false;
  private processingPromise: Promise<void> | null = null;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.toolExecutor = new ToolExecutor((event) => this.emit(event));

    // Register handler for incoming message events
    this.on("message", async (event: MessageEvent) => {
      const { message } = event;

      console.log(`[Self] Received message event`);

      // Get current working memory
      const workingMemory = this.memoryManager.getWorkingMemory();
      console.log(`[Self] Current working memory size: ${workingMemory.length}`);

      // Add message to working memory
      workingMemory.push(`new message from user at conversationId: ${event.conversationId} , message: ${message}`);
      console.log(`[Self] Added message to working memory: ${message.substring(0, 50)}...`);

      // Save updated working memory
      this.memoryManager.setWorkingMemory(workingMemory);
      await this.memoryManager.onNewMessage(message);

      console.log(`[Self] Message processed, working memory size: ${workingMemory.length}`);
    });
  }

  async initialize(): Promise<void> {
    console.log(`[Self] Initializing agent ${this.agentId}`);
    const config = await loadConfig();
    const homedir = resolveAgentHomedir(config, this.agentId);
    this.memoryManager = UnifiedMemoryManager.create(homedir, this.agentId);
    console.log(`[Self] Memory manager created`);

    const memorySearchConfig = config.agent?.memorySearch;
    if (memorySearchConfig) {
      const resolvedConfig = resolveMemorySearchConfig(memorySearchConfig, this.agentId);
      if (resolvedConfig) {
        console.log(`[Self] Initializing memory database...`);
        await this.memoryManager.initializeDatabase(resolvedConfig, this.agentId);
        console.log(`[Self] Memory database initialized`);
      }
    }
  }

  /**
   * Start the autonomous background processing loop
   * This runs 24/7 and processes working memory
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log(`[Self] Starting autonomous processing loop for agent ${this.agentId}`);

    // Start background processing loop
    this.processingPromise = this.processLoop();
  }

  /**
   * Stop the autonomous background processing loop
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.processingPromise) {
      await this.processingPromise;
    }
  }

  /**
   * Format error for storage in working memory
   */
  private formatErrorForMemory(context: string, error: unknown): string {
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error && error.stack ? ` | stack: ${error.stack}` : "";
    return `[ERROR] ${context}: ${errorMessage}${errorStack} | timestamp: ${timestamp}`;
  }

  /**
   * Push error to working memory for future learning
   */
  private async learnFromError(context: string, error: unknown): Promise<void> {
    try {
      const workingMemory = this.memoryManager.getWorkingMemory();
      const errorEntry = this.formatErrorForMemory(context, error);
      workingMemory.push(errorEntry);
      this.memoryManager.setWorkingMemory(workingMemory);
      console.log(`[Self] Error logged to working memory: ${context}`);
    } catch (memoryError) {
      console.error(`[Self] Failed to log error to working memory:`, memoryError);
    }
  }

  /**
   * Background processing loop that runs continuously on working memory
   */
  private async processLoop(): Promise<void> {
    console.log(`[Self] Process loop started`);
    while (this.isRunning) {
      try {
        // Ensure core is initialized
        if (!this.coreInitialized) {
          console.log(`[Self] Initializing core...`);
          await this.initializeCore();
          this.coreInitialized = true;
          console.log(`[Self] Core initialized`);
        }

        // Always process working memory
        try {
          await this.selfCouncil();
        } catch (error) {
          console.error(`[Self] Error processing working memory:`, error);
          await this.learnFromError("selfCouncil", error);
        }

        // Small delay between iterations
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`[Self] Error in processing loop:`, error);
        await this.learnFromError("processLoop", error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    console.log(`[Self] Process loop stopped`);
  }

  /**
   * Process working memory
   */
  private async selfCouncil(): Promise<void> {
    const workingMemory = this.memoryManager.getWorkingMemory();

    // Skip if no working memory
    if (workingMemory.length === 0) {
      console.log(`[Self] Self council skipped - no working memory`);
      return;
    }

    console.log(`[Self] Self council started, working memory size: ${workingMemory.length}`);
    const runId = randomUUID();
    const { action, conversationId, updatedMemories, brainPart: suggestedBrainPart } = await this.decideAction();
    console.log(`[Self] Decided action: ${action} (runId: ${runId}, conversationId: ${conversationId || "(none)"})`);

    if (action === "think") {
      // Update working memory with cleaned memories
      if (updatedMemories) {
        this.memoryManager.setWorkingMemory(updatedMemories);
      }

      // Use suggested brain part from council
      if (!suggestedBrainPart || suggestedBrainPart.trim() === "") {
        throw new Error(`Council decided to "think" but did not provide a brainPart. Available brain parts: ${SYSTEM2_BRAIN_PARTS.map(bp => bp.id).join(", ")}`);
      }
      
      const brainPart = getBrainPart(suggestedBrainPart);
      if (!brainPart) {
        throw new Error(`Council provided invalid brainPart: "${suggestedBrainPart}". Available brain parts: ${SYSTEM2_BRAIN_PARTS.map(bp => bp.id).join(", ")}`);
      }
      
      console.log(`[Self] Selected brain part: ${brainPart.name}`);
      const result = await this.runBrainPart(brainPart, runId);

      const workingMemory = this.memoryManager.getWorkingMemory();
      workingMemory.push(result);
      console.log(`[Self] Saving to memory (content length: ${result.length}), working memory size: ${workingMemory.length}`);

      this.memoryManager.setWorkingMemory(workingMemory);
      console.log(`[Self] Brain part completed, saved to memory`);
    } else if (action === "respond") {
      // Generate response FIRST with current working memory (before cleanup)
      console.log(`[Self] Generating response...`);
      const response = await this.generateResponse(runId, conversationId);
      console.log(`[Self] Response generated (length: ${response.length})`);

      await this.emit({
        type: "write",
        conversationId,
        content: response,
        role: "assistant",
        runId
      });

      // Update working memory AFTER response is generated and emitted
      if (updatedMemories) {
        this.memoryManager.setWorkingMemory(updatedMemories);
        console.log(`[Self] Updated working memory (removed completed request)`);
      }

    } else if (action === "sleep") {
      // Sleep - do nothing, just wait
      const sleepTime = Math.random() * 4000 + 1000;
      console.log(`[Self] Sleeping for ${Math.round(sleepTime)}ms`);
      await new Promise(resolve => setTimeout(resolve, sleepTime));
    }
  }

  /**
   * Emit a message event (event-driven, non-blocking)
   */
  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const runId = params.runId || randomUUID();
    console.log(`[Self] Run called (runId: ${runId}, conversationId: ${params.conversationId})`);

    // Emit message event - handler will process it
    await this.emit({
      type: "message",
      conversationId: params.conversationId,
      message: params.message,
      runId,
    });

    // Return immediately (non-blocking)
    return { runId, response: "", tokensUsed: 0 };
  }

  // ============================================================================
  // Decision & Processing
  // ============================================================================

  private async decideAction(): Promise<{ action: Action; conversationId: string; updatedMemories?: string[]; brainPart?: string }> {
    const workingMemory = this.memoryManager.getWorkingMemory();
    console.log(`[Self] Deciding action with ${workingMemory.length} working memory items`);
    const prompt = selfCouncilPrompt(workingMemory);

    const selfCouncilSchema = z.object({
      respond: z.object({
        needed: z.boolean().describe("Whether response is needed"),
        conversationId: z.string().describe("The conversationId to respond to"),
      }).describe("Response action details"),
      think: z.object({
        needed: z.boolean().describe("Whether thinking is needed"),
        brainPart: z.string().describe("Which brain part to use (empty string if not specified)"),
      }).describe("Thinking action details"),
      memory: z.array(z.string()).describe("Updated working memory array"),
    });

    const result = await generateText({
      model: this.llmModel,
      system: this.systemPrompt,
      messages: [
        { role: "user" as const, content: prompt },
      ],
      output: Output.object({ schema: selfCouncilSchema }),
    });

    console.log(`[Self] Result: ${JSON.stringify(result.output)}`);

    const output = result.output;

    // Determine action based on which object is present and set
    let action: Action = "sleep";
    let conversationId = "";
    let brainPart: string | undefined;

    if (output.respond?.needed) {
      action = "respond";
      conversationId = output.respond.conversationId || "";
    } else if (output.think?.needed) {
      action = "think";
      brainPart = output.think.brainPart || undefined;
      if (!brainPart || brainPart.trim() === "") {
        throw new Error(`Council decided to "think" but did not provide a brainPart. Available brain parts: ${SYSTEM2_BRAIN_PARTS.map(bp => bp.id).join(", ")}`);
      }
    }

    // Don't update working memory here - return it so it can be updated AFTER response is generated
    return {
      action,
      conversationId,
      updatedMemories: output.memory,
      brainPart
    };
  }

  private async runBrainPart(
    brainPart: BrainPart,
    runId: string
  ): Promise<string> {
    console.log(`[Self] Running brain part: ${brainPart.name} (runId: ${runId})`);

    try {
      const workingMemory = this.memoryManager.getWorkingMemory();
      const prompt = brainPart.getPrompt(workingMemory);

      const initialUserMessage: ModelMessage = { role: "user" as const, content: prompt };
      const tools = brainPart.toolsAllowed !== false ? this.availableTools : undefined;
      const maxIterations = brainPart.maxIterations ?? 10;
      console.log(`[Self] Brain part config - maxIterations: ${maxIterations}, toolsAllowed: ${brainPart.toolsAllowed !== false}`);

      let iterations = 0;
      let messagesHistory: ModelMessage[] = [initialUserMessage];
      let finalContent = "";

      while (iterations < maxIterations) {
        try {
          console.log(`[Self] Brain part iteration ${iterations + 1}/${maxIterations}`);
          const streamResult = await streamText({
            model: this.llmModel,
            system: this.systemPrompt,
            messages: messagesHistory,
            tools: tools,
          });

          let content = "";
          for await (const chunk of streamResult.textStream) {
            content += chunk;
            await this.emit({
              type: "stream.token",
              conversationId: "",
              runId,
              token: chunk,
            });
          }

          const toolCalls = await streamResult.toolCalls;

          if (toolCalls?.length) {
            try {
              console.log(`[Self] Executing ${toolCalls.length} tool call(s)`);
              const { assistantMsg, toolResultMsgs } = await this.toolExecutor.executeToolCalls(
                toolCalls,
                content,
                this.availableTools,
                messagesHistory,
                "",
                runId
              );
              messagesHistory.push(assistantMsg, ...toolResultMsgs);
              iterations++;
              continue;
            } catch (error) {
              console.error(`[Self] Error executing tool calls:`, error);
              await this.learnFromError(`runBrainPart.toolExecution.${brainPart.id}`, error);
              throw error;
            }
          }

          if (content.trim().length > 0) {
            messagesHistory.push({ role: "assistant" as const, content });
            finalContent = content;
            console.log(`[Self] Brain part completed with content (length: ${content.length})`);
            break;
          }

          iterations++;
        } catch (error) {
          console.error(`[Self] Error in brain part iteration:`, error);
          await this.learnFromError(`runBrainPart.iteration.${brainPart.id}`, error);
          throw error;
        }
      }

      if (iterations >= maxIterations) {
        console.log(`[Self] Brain part reached max iterations (${maxIterations})`);
      }

      return finalContent;
    } catch (error) {
      console.error(`[Self] Error running brain part ${brainPart.name}:`, error);
      await this.learnFromError(`runBrainPart.${brainPart.id}`, error);
      throw error;
    }
  }

  private async generateResponse(runId: string, conversationId: string = ""): Promise<string> {
    const workingMemory = this.memoryManager.getWorkingMemory();
    console.log(`[Self] Generating response (runId: ${runId}, conversationId: ${conversationId}), working memory size: ${workingMemory.length}`);
    
    const communicationPrompt = getCommunicationPrompt(workingMemory);
    const systemContent = `${this.systemPrompt}\n\n${communicationPrompt}`.trim();
    const messages: ModelMessage[] = [
      { role: "user" as const, content: "Generate response based on working memory." },
    ];

    const streamResult = await streamText({
      model: this.llmModel,
      system: systemContent,
      messages,
      tools: this.availableTools,
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

    
    const toolCalls = await streamResult.toolCalls;
    if (toolCalls?.length) {
      console.log(`[Self] Response generation executing ${toolCalls.length} tool call(s)`);
      const { assistantMsg, toolResultMsgs } = await this.toolExecutor.executeToolCalls(
        toolCalls,
        content,
        this.availableTools,
        messages,
        conversationId,
        runId
      );
      const toolResults = toolResultMsgs.map(m =>
        typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      ).join("\n");
      content = content + (content ? "\n\n" : "") + toolResults;
    }

    console.log(`[Self] Response generated (length: ${content.length})`);
    return content;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private async initializeCore(): Promise<void> {
    console.log(`[Self] Initializing core for agent ${this.agentId}`);
    const config = await loadConfig();
    const homedir = resolveAgentHomedir(config, this.agentId);

    const metadata = agentDiscovery.getMetadata(this.agentId)!;
    this.systemPrompt = await new IdentityLoader().getSystemPrompt(metadata.agentDir);
    console.log(`[Self] System prompt loaded (length: ${this.systemPrompt.length})`);

    this.llmModel = await LLMProvider.getInstance().fastCheap();
    console.log(`[Self] LLM model initialized`);

    const toolRegistry = new ToolRegistry();
    this.availableTools = Object.fromEntries(toolRegistry.getToolsMap());
    console.log(`[Self] Tools loaded: ${Object.keys(this.availableTools).length} available`);
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
      Array.from(handlers).map(handler => handler(event))
    );
  }
}
