import { generateText } from "ai";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import type { BrainPart, BrainGoal } from "./types.js";
import { WorkingMemoryManager } from "./working-memory.js";
import { System2DebugLogger } from "./debug.js";
import { activityRecorder } from "@server/agents/zuckerman/activity/index.js";
import type { Tool } from "ai";
import type { LanguageModel } from "ai";
import type { StreamEventEmitter } from "@server/world/communication/stream-emitter.js";
import { convertToModelMessages } from "@server/world/providers/llm/helpers.js";

export interface BrainModuleResult {
  completed: boolean;
  result: string;
  toolCallsMade: number;
}

export class BrainModule {
  constructor(
    private conversationManager: ConversationManager,
    private conversationId: string,
    private runId: string,
    private llmModel: LanguageModel,
    private streamEmitter: StreamEventEmitter,
    private temperature: number | undefined,
    private availableTools: Record<string, Tool>,
    private brainPart: BrainPart,
    private goal: BrainGoal,
    private workingMemoryManager: WorkingMemoryManager,
    private historyText: string,
    private debugLogger: System2DebugLogger
  ) {}

  async run(): Promise<BrainModuleResult> {
    let toolCallsMade = 0;
    const maxIterations = this.brainPart.maxIterations ?? 50;
    let iterations = 0;

    console.log(`[BrainModule] Starting ${this.brainPart.name} (${this.brainPart.id}) - Goal: ${this.goal.description}`);

    // Add initial goal message to conversation
    const goalMessage = `[Brain Part: ${this.brainPart.name}] Goal: ${this.goal.description}`;
    await this.conversationManager.addMessage(
      this.conversationId,
      "system",
      goalMessage,
      { runId: this.runId }
    );
    await this.debugLogger.logConversationMessage("system", goalMessage, { runId: this.runId });

    while (iterations < maxIterations) {
      iterations++;
      console.log(`[BrainModule] ${this.brainPart.name} iteration ${iterations}/${maxIterations}`);
      
      const conversation = this.conversationManager.getConversation(this.conversationId);
      
      // Get current working memory
      const workingMemory = this.workingMemoryManager.getState();
      await this.debugLogger.logBrainPartIteration(
        this.brainPart.id,
        this.brainPart.name,
        iterations,
        maxIterations,
        workingMemory.memories
      );
      
      // Build messages with brain part prompt (generated with goal, working memory, and history)
      const brainPartPrompt = this.brainPart.getPrompt(this.goal.description, workingMemory.memories, this.historyText);
      await this.debugLogger.logBrainPartPrompt(this.brainPart.id, this.brainPart.name, brainPartPrompt);
      
      // Build messages: use brain part prompt as system prompt, then add conversation messages
      // Don't use buildMessages() as it includes systemPrompt and relevantMemoriesText which conflict with brain part prompt
      const messages: ConversationMessage[] = [
        { role: "system", content: brainPartPrompt, timestamp: Date.now() },
      ];
      
      // Add conversation messages (excluding system messages to avoid duplication)
      if (conversation) {
        for (const msg of conversation.messages) {
          if (msg.ignore || msg.role === "system") continue;
          messages.push({
            role: msg.role as "user" | "assistant" | "tool",
            content: msg.content,
            timestamp: msg.timestamp,
            toolCalls: msg.toolCalls,
            toolCallId: msg.toolCallId,
          });
        }
      }

      // Ensure conversation ends with a user message (Anthropic requirement)
      // Check the last non-system message - if it's assistant (and not followed by tool), add user message
      const nonSystemMessages = messages.filter(m => m.role !== "system");
      if (nonSystemMessages.length > 0) {
        const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
        // If last message is assistant (not tool), we need a user message to continue
        // Tool messages are fine as they're followed by assistant responses
        if (lastMessage.role === "assistant") {
          // Add a continuation user message to ensure conversation ends with user message
          messages.push({
            role: "user",
            content: "Please continue working on the goal.",
            timestamp: Date.now(),
          });
        }
      }

      const toolsAllowed = this.brainPart.toolsAllowed !== false; // Default to true if not specified
      const availableTools = toolsAllowed ? this.availableTools : {};
      
      const result = await generateText({
        model: this.llmModel,
        messages: convertToModelMessages(messages),
        temperature: this.temperature,
        tools: availableTools,
      });

      // Handle tool calls for logging
      const toolCalls = await result.toolCalls;
      if (toolCalls && toolCalls.length > 0) {
        toolCallsMade += toolCalls.length;
        console.log(`[BrainModule] ${this.brainPart.name} making ${toolCalls.length} tool call(s): ${toolCalls.map(tc => tc.toolName).join(", ")}`);
        const toolCallsForLog = toolCalls.map(tc => ({
          id: tc.toolCallId,
          name: tc.toolName,
          arguments: typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input),
        }));
        await this.conversationManager.addMessage(
          this.conversationId,
          "assistant",
          result.text || "",
          { toolCalls: toolCallsForLog, runId: this.runId }
        );
        await this.debugLogger.logConversationMessage("assistant", result.text || "", { toolCalls: toolCallsForLog, runId: this.runId });
      }

      await this.debugLogger.logLLMCall(
        `brain_part_${this.brainPart.id}_iteration_${iterations}`,
        messages,
        { content: result.text  },
        this.temperature,
        Object.keys(availableTools)
      );

      // AI SDK handles tool execution automatically
      // The result.text is the final response after all tool executions
      // Brain part indicates completion
      const completionMessage = result.text || `Goal "${this.goal.description}" completed by ${this.brainPart.name}`;
      
      console.log(`[BrainModule] ${this.brainPart.name} completed successfully after ${iterations} iterations`);
      
      await this.conversationManager.addMessage(
        this.conversationId,
        "assistant",
        completionMessage,
        { runId: this.runId }
      );
      await this.debugLogger.logConversationMessage("assistant", completionMessage, { runId: this.runId });

      return {
        completed: true,
        result: completionMessage,
        toolCallsMade,
      };
    }

    // Max iterations reached
    console.log(`[BrainModule] ${this.brainPart.name} reached maximum iterations (${maxIterations})`);
    return {
      completed: false,
      result: `Brain module reached maximum iterations (${maxIterations})`,
      toolCallsMade,
    };
  }
}
