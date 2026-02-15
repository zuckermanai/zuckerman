import { randomUUID } from "node:crypto";
import { loadConfig } from "@server/world/config/index.js";
import { resolveAgentHomedir } from "@server/world/homedir/resolver.js";
import { MemorySystem } from "@server/agents/zuckerman/core/memory/memory-service.js";
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
  private memoryManager!: MemorySystem;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private toolExecutor: ToolExecutor;
  private identityLoader: IdentityLoader;
  private llmModel!: LanguageModel;
  private availableTools!: Record<string, Tool>;
  private agentDir!: string;
  private isRunning = false;
  private coreInitialized = false;
  private processingPromise: Promise<void> | null = null;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.toolExecutor = new ToolExecutor((event) => this.emit(event));
    this.identityLoader = new IdentityLoader();

    // Register handler for incoming message events
    this.on("message", async (event: MessageEvent) => {
      if (!this.memoryManager) return;
      const workingMemory = this.getWorkingMemory();
      workingMemory.push(`new message from user at conversationId: ${event.conversationId} , message: ${event.message}`);
      this.memoryManager.setAll("working", workingMemory, {
        conversationId: event.conversationId,
      });
    });
  }

  async initialize(): Promise<void> {
    const config = await loadConfig();
    const homedir = resolveAgentHomedir(config, this.agentId);
    this.memoryManager = new MemorySystem(homedir, this.agentId);

    const memorySearchConfig = config.agent?.memorySearch;
    if (memorySearchConfig) {
      const resolvedConfig = resolveMemorySearchConfig(memorySearchConfig, this.agentId);
      if (resolvedConfig) {
        await this.memoryManager.initializeDatabase(resolvedConfig, this.agentId);
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
   * Get working memory as string array
   */
  private getWorkingMemory(): string[] {
    return this.memoryManager.getMemories({ type: "working", format: "content" }) as string[];
  }

  /**
   * Background processing loop that runs continuously on working memory
   */
  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      if (!this.coreInitialized) {
        await this.initializeCore();
        this.coreInitialized = true;
      }

      await this.selfCouncil();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Process working memory
   */
  private async selfCouncil(): Promise<void> {
    const runId = randomUUID();
    let conversationId = "";
    
    try {
      const workingMemory = this.getWorkingMemory();
      if (workingMemory.length === 0) {
        return;
      }

      const { action, conversationId: actionConversationId, updatedMemories, brainPart: suggestedBrainPart } = await this.decideAction();
      conversationId = actionConversationId || "";

      if (action === "think") {
        this.memoryManager.setAll("working", updatedMemories || []);

        if (!suggestedBrainPart?.trim()) {
          throw new Error(`Council decided to "think" but did not provide a brainPart. Available brain parts: ${SYSTEM2_BRAIN_PARTS.map(bp => bp.id).join(", ")}`);
        }

        const brainPart = getBrainPart(suggestedBrainPart);
        if (!brainPart) {
          throw new Error(`Council provided invalid brainPart: "${suggestedBrainPart}". Available brain parts: ${SYSTEM2_BRAIN_PARTS.map(bp => bp.id).join(", ")}`);
        }

        const result = await this.runBrainPart(brainPart, runId);
        const updatedWorkingMemory = this.getWorkingMemory();
        updatedWorkingMemory.push(result);
        this.memoryManager.setAll("working", updatedWorkingMemory);
      } else if (action === "respond") {
        const response = await this.generateResponse(runId, conversationId);

        await this.emit({
          type: "stream.response",
          conversationId,
          runId,
          response,
        });

        await this.emit({
          type: "write",
          conversationId,
          content: response,
          role: "assistant",
          runId
        });

        const finalMemories = [...(updatedMemories || []), `responded to conversationId: ${conversationId} with response: ${response}`];
        this.memoryManager.setAll("working", finalMemories);
      } else if (action === "sleep") {
        this.memoryManager.setAll("working", updatedMemories || []);
        const sleepTime = Math.random() * 4000 + 1000;
        await new Promise(resolve => setTimeout(resolve, sleepTime));
      }
    } catch (error) {
      console.error(`[Self] Error in selfCouncil:`, error);
      if (this.memoryManager) {
        const workingMemory = this.getWorkingMemory();
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error && error.stack ? ` | stack: ${error.stack}` : "";
        const errorEntry = `[ERROR] selfCouncil: ${errorMessage}${errorStack} | timestamp: ${timestamp}`;
        workingMemory.push(errorEntry);
        this.memoryManager.setAll("working", workingMemory);
      }
    }
  }

  // ============================================================================
  // Decision & Processing
  // ============================================================================

  private async decideAction(): Promise<{ action: Action; conversationId: string; updatedMemories?: string[]; brainPart?: string }> {
    const workingMemory = this.getWorkingMemory();
    const prompt = selfCouncilPrompt(workingMemory);

    const selfCouncilSchema = z.object({
      respond: z.object({
        needed: z.boolean().describe("Whether response is needed"),
        conversationId: z.string().describe("The conversationId to respond to"),
        explanation: z.string().describe("Brief explanation of what to respond to or why responding"),
      }).describe("Response action details"),
      think: z.object({
        needed: z.boolean().describe("Whether thinking is needed"),
        brainPart: z.string().describe("Which brain part to use (empty string if not specified)"),
      }).describe("Thinking action details"),
      memory: z.array(z.string()).describe("Updated working memory array"),
    });

    const system = await this.identityLoader.getSystemPrompt(this.agentDir);

    const result = await generateText({
      model: this.llmModel,
      system,
      messages: [
        { role: "user" as const, content: prompt },
      ],
      output: Output.object({ schema: selfCouncilSchema }),
    });

    const output = result.output;

    let action: Action = "sleep";
    let conversationId = "";
    let brainPart: string | undefined;

    if (output.respond?.needed) {
      action = "respond";
      conversationId = output.respond.conversationId || "";
    } else if (output.think?.needed) {
      action = "think";
      brainPart = output.think.brainPart;
    }

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
    const workingMemory = this.getWorkingMemory();
    const prompt = brainPart.getPrompt(workingMemory);
    const initialUserMessage: ModelMessage = { role: "user" as const, content: prompt };
    const tools = (brainPart.toolsAllowed ?? true) ? this.availableTools : undefined;
    
    const systemPrompt = await this.identityLoader.getSystemPrompt(this.agentDir);

    let messagesHistory: ModelMessage[] = [initialUserMessage];

    while (true) {
      const result = await generateText({
        model: this.llmModel,
        system: systemPrompt,
        messages: messagesHistory,
        tools: tools,
      });

      const content = result.text;
      const toolCalls = result.toolCalls;

      if (toolCalls?.length) {
        const { assistantMsg, toolResultMsgs } = await this.toolExecutor.executeToolCalls(
          toolCalls,
          content,
          this.availableTools,
          messagesHistory,
          "",
          runId
        );
        messagesHistory.push(assistantMsg, ...toolResultMsgs);
        continue;
      }

      if (content.trim()) {
        messagesHistory.push({ role: "assistant" as const, content });
        return content;
      }
    }
  }

  private async generateResponse(runId: string, conversationId: string = ""): Promise<string> {
    const workingMemory = this.getWorkingMemory();
    const communicationPrompt = getCommunicationPrompt(workingMemory);
    const systemPrompt = await this.identityLoader.getSystemPrompt(this.agentDir);
    const systemContent = `${systemPrompt}\n\n---\n\n${communicationPrompt}`.trim();

    const initialMessage: ModelMessage = { role: "user" as const, content: "Generate response based on working memory." };
    
    const streamResult = await streamText({
      model: this.llmModel,
      system: systemContent,
      messages: [initialMessage],
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
      const { assistantMsg, toolResultMsgs } = await this.toolExecutor.executeToolCalls(
        toolCalls,
        content,
        this.availableTools,
        [initialMessage],
        conversationId,
        runId
      );
      const toolResults = toolResultMsgs.map(m =>
        typeof m.content === "string" ? m.content : JSON.stringify(m.content)
      ).join("\n");
      content = content ? `${content}\n\n${toolResults}` : toolResults;
    }

    return content;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private async initializeCore(): Promise<void> {
    const metadata = agentDiscovery.getMetadata(this.agentId)!;
    
    this.agentDir = metadata.agentDir;
    this.llmModel = await LLMProvider.getInstance().fastCheap();
    
    const toolRegistry = new ToolRegistry();
    this.availableTools = Object.fromEntries(toolRegistry.getToolsMap());
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
