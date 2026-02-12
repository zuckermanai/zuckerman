import { randomUUID } from "node:crypto";
import type { AgentRunParams, AgentRunResult } from "@server/world/runtime/agents/types.js";
import { loadConfig } from "@server/world/config/index.js";
import { resolveAgentHomedir } from "@server/world/homedir/resolver.js";
import { UnifiedMemoryManager } from "@server/agents/zuckerman/core/memory/manager.js";
import { resolveMemorySearchConfig } from "@server/agents/zuckerman/core/memory/config.js";
import type { AgentEvent } from "./events.js";
import { streamText, generateText, Output } from "ai";
import type { Tool, LanguageModel, ModelMessage } from "ai";
import { z } from "zod";
import { LLMProvider } from "@server/world/providers/llm/index.js";
import { ToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import { IdentityLoader } from "../identity/identity-loader.js";
import { agentDiscovery } from "@server/agents/discovery.js";
import { ToolExecutor } from "./tool-executor.js";
import { SYSTEM2_BRAIN_PARTS, getBrainPart, selfCouncilPrompt, getCommonContext } from "./system2-brain-parts.js";
import type { BrainPart } from "./types.js";

export type EventHandler<T extends AgentEvent = AgentEvent> = (event: T) => void | Promise<void>;

type Action = "respond" | "sleep" | "think";

export class Self {
  readonly agentId: string;
  private memoryManager!: UnifiedMemoryManager;
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private toolExecutor: ToolExecutor;
  private llmModel!: LanguageModel;
  private availableTools!: Record<string, Tool>;
  private systemPrompt!: string;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.toolExecutor = new ToolExecutor((event) => this.emit(event));
  }

  async initialize(): Promise<void> {
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
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const { conversationId, message, runId = randomUUID() } = params;

    console.log(`[Self] Starting run ${runId} for conversation ${conversationId}`);
    
    await this.initializeCore(conversationId);
    
    await this.emit({
      type: "stream.lifecycle",
      conversationId,
      runId,
      phase: "start",
      message,
    });

    const workingMemory: string[] = [`new message from user: ${message}`];
    
    const memoryResult = await this.memoryManager.getRelevantMemories(message, {
      limit: 20,
      types: ["semantic", "episodic", "procedural"],
    });
    for (const m of memoryResult.memories) {
      if (m.type === "semantic") {
        workingMemory.push((m as any).fact);
      } else if (m.type === "episodic") {
        workingMemory.push((m as any).event);
      } else if (m.type === "procedural") {
        workingMemory.push(`${(m as any).pattern}: ${(m as any).action}`);
      }
    }

    this.memoryManager.setWorkingMemory(conversationId, JSON.stringify(workingMemory));

    let tokensUsed = 0;
    let response = "";

    while (true) {
      const action = await this.decideAction(conversationId);
      
      if (action === "respond") {
        response = await this.generateResponse(conversationId, runId);
        const usage = await this.getLastUsage();
        tokensUsed = usage?.totalTokens ?? tokensUsed;
        
        await this.emit({ 
          type: "write", 
          conversationId, 
          content: response, 
          role: "assistant", 
          runId 
        });
        
        await this.saveToMemory(conversationId, response);
        break;
      }
      
      if (action === "sleep") {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 4000 + 1000));
        continue;
      }
      
      if (action === "think") {
        const brainPart = await this.selectBrainPart(conversationId);
        if (!brainPart) {
          response = await this.generateResponse(conversationId, runId);
          const usage = await this.getLastUsage();
          tokensUsed = usage?.totalTokens ?? tokensUsed;
          
          await this.emit({ 
            type: "write", 
            conversationId, 
            content: response, 
            role: "assistant", 
            runId 
          });
          break;
        }
        
        const result = await this.runBrainPart(brainPart, conversationId, runId);
        await this.saveToMemory(conversationId, result);
      }
    }

    await this.emit({ 
      type: "stream.lifecycle", 
      conversationId, 
      runId, 
      phase: "end", 
      tokensUsed 
    });
    
    return { runId, response, tokensUsed };
  }

  private getWorkingMemory(conversationId: string): string[] {
    const wm = this.memoryManager.getWorkingMemory(conversationId);
    return wm ? JSON.parse(wm.content) as string[] : [];
  }

  private setWorkingMemory(conversationId: string, workingMemory: string[]): void {
    this.memoryManager.setWorkingMemory(conversationId, JSON.stringify(workingMemory));
  }

  private async decideAction(conversationId: string): Promise<Action> {
    const workingMemory = this.getWorkingMemory(conversationId);
    const prompt = selfCouncilPrompt(workingMemory);

    const selfCouncilSchema = z.object({
      action: z.enum(["respond", "think", "sleep"]),
      memories: z.array(z.string()),
    });

    const result = await generateText({
      model: this.llmModel,
      system: this.systemPrompt,
      messages: [
        { role: "user" as const, content: prompt },
      ],
      output: Output.object({ schema: selfCouncilSchema }),
    });

    const output = result.output;
    
    if (output.memories.length > 0) {
      this.setWorkingMemory(conversationId, output.memories);
    }
    
    return output.action;
  }

  private async selectBrainPart(conversationId: string): Promise<BrainPart | null> {
    const workingMemory = this.getWorkingMemory(conversationId);
    const brainPartList = SYSTEM2_BRAIN_PARTS.map(bp => `- ${bp.id}: ${bp.name}`).join("\n");
    const workingMemoryText = workingMemory.map((m, i) => `${i + 1}. ${m}`).join("\n");
    
    const prompt = `${getCommonContext()}

You ARE Zuckerman. You are Self - selecting which brain part to use next.

Working memory:
${workingMemoryText}

Available brain parts:
${brainPartList}

Which brain part should be used next?`;

    const selectBrainPartSchema = z.object({
      brainPartId: z.string(),
    });

    const result = await generateText({
      model: this.llmModel,
      system: this.systemPrompt,
      messages: [
        { role: "user" as const, content: prompt },
      ],
      output: Output.object({ schema: selectBrainPartSchema }),
    });

    const selectedId = result.output.brainPartId.trim().toLowerCase();
    return getBrainPart(selectedId) ?? null;
  }

  private async runBrainPart(
    brainPart: BrainPart,
    conversationId: string,
    runId: string
  ): Promise<string> {
    console.log(`[Self] Running brain part: ${brainPart.name}`);
    
    const workingMemory = this.getWorkingMemory(conversationId);
    const prompt = brainPart.getPrompt(workingMemory);
    
    const initialUserMessage: ModelMessage = { role: "user" as const, content: prompt };
    const tools = brainPart.toolsAllowed !== false ? this.availableTools : undefined;
    const maxIterations = brainPart.maxIterations ?? 10;
    
    let iterations = 0;
    let messagesHistory: ModelMessage[] = [initialUserMessage];
    let finalContent = "";
    
    while (iterations < maxIterations) {
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
          conversationId,
          runId,
          token: chunk,
        });
      }

      const usage = await streamResult.usage;
      this.lastUsage = usage ?? null;

      const toolCalls = await streamResult.toolCalls;
      
      if (toolCalls?.length) {
        const { assistantMsg, toolResultMsgs } = await this.toolExecutor.executeToolCalls(
          toolCalls,
          content,
          this.availableTools,
          messagesHistory,
          conversationId,
          runId
        );
        messagesHistory.push(assistantMsg, ...toolResultMsgs);
        iterations++;
        continue;
      }

      if (content.trim().length > 0) {
        messagesHistory.push({ role: "assistant" as const, content });
        finalContent = content;
        break;
      }
      
      iterations++;
    }

    return finalContent;
  }

  private async generateResponse(conversationId: string, runId: string): Promise<string> {
    const workingMemory = this.getWorkingMemory(conversationId);
    const workingMemoryText = workingMemory.length > 0
      ? `\n\n## Working Memory\n${workingMemory.map((m, i) => `${i + 1}. ${m}`).join("\n")}`
      : "";

    const systemContent = `${this.systemPrompt}${workingMemoryText}`.trim();
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

    const usage = await streamResult.usage;
    this.lastUsage = usage ?? null;

    const toolCalls = await streamResult.toolCalls;
    if (toolCalls?.length) {
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

    return content;
  }

  private async saveToMemory(conversationId: string, content: string): Promise<void> {
    const workingMemory = this.getWorkingMemory(conversationId);
    workingMemory.push(content);
    
    if (workingMemory.length > 50) {
      workingMemory.splice(0, workingMemory.length - 50);
    }
    
    this.setWorkingMemory(conversationId, workingMemory);
    await this.memoryManager.onNewMessage(content, conversationId);
  }

  private lastUsage: { totalTokens?: number } | null = null;

  private async getLastUsage(): Promise<{ totalTokens?: number } | null> {
    return this.lastUsage;
  }

  private async initializeCore(conversationId: string): Promise<void> {
    const config = await loadConfig();
    const homedir = resolveAgentHomedir(config, this.agentId);

    const metadata = agentDiscovery.getMetadata(this.agentId)!;
    this.systemPrompt = await new IdentityLoader().getSystemPrompt(metadata.agentDir);
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
