import { generateText } from "ai";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import type { Tool } from "ai";
import type { LanguageModel } from "ai";
import type { StreamEventEmitter } from "@server/world/communication/stream-emitter.js";
import { ToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import { convertToModelMessages } from "@server/world/providers/llm/helpers.js";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";

export interface ContextServiceResult {
  enrichedContext: string;
  gatheredInformation: string[];
  iterations: number;
}

const MAX_ITERATIONS = 10;

/**
 * Context Service - Proactively gathers missing information needed to fulfill a request
 * Works like System1's while loop but focused on information gathering
 */
export class ContextService {
  constructor(
    private conversationManager: ConversationManager,
    private llmModel: LanguageModel,
    private streamEmitter: StreamEventEmitter,
    private runId: string,
    private availableTools: Record<string, Tool>,
    private toolRegistry: ToolRegistry
  ) {}

  /**
   * Build context by iteratively gathering missing information
   */
  async buildContext(userRequest: string): Promise<ContextServiceResult> {
    const gatheredInformation: string[] = [];

    const messages: ConversationMessage[] = [
      {
        role: "system",
        content: `Gather missing information needed to fulfill: "${userRequest}"

IMPORTANT CONTEXT: You are operating completely independently. There is no one else who can help you - you must rely entirely on your own capabilities, tools, and reasoning. All information gathering must be done by you alone.

Use available tools to find answers. Never ask the user - always use tools to discover information yourself.
When you have enough context, summarize what you've gathered.`,
        timestamp: Date.now(),
      },
      {
        role: "user",
        content: `User request: "${userRequest}"

What information is needed? Start gathering it using tools.`,
        timestamp: Date.now(),
      },
    ];

    let iterations = 0;
    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const result = await generateText({
        model: this.llmModel,
        messages: convertToModelMessages(messages),
        temperature: 0.3,
        tools: this.availableTools,
      });

      // AI SDK handles tool execution automatically
      // The result.text is the final response after all tool executions
      messages.push({ role: "assistant", content: result.text, timestamp: Date.now() });
      
      // Check if we need to continue gathering
      messages.push({
        role: "user",
        content: "If you have enough context, summarize. If not, use tools to gather more.",
        timestamp: Date.now(),
      });
      
      // If the response indicates completion, break
      if (result.text.toLowerCase().includes("summary") || result.text.toLowerCase().includes("gathered")) {
        break;
      }
    }

    const summary = messages.filter(m => m.role === "assistant").pop()?.content || "Context gathering completed.";
    const parts = [
      `Original request: ${userRequest}`,
      "",
      ...(gatheredInformation.length > 0 
        ? ["Gathered information:", ...gatheredInformation.map((info, idx) => `${idx + 1}. ${info}`), ""]
        : []),
      `Summary: ${summary}`,
    ];

    return {
      enrichedContext: parts.join("\n"),
      gatheredInformation,
      iterations,
    };
  }
}
