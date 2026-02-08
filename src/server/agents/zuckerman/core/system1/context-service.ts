import type { RunContext } from "@server/world/providers/llm/context.js";
import { LLMService } from "@server/world/providers/llm/llm-service.js";
import { ToolService } from "../../tools/index.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";

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
    private context: RunContext
  ) {}

  /**
   * Build context by iteratively gathering missing information
   */
  async buildContext(userRequest: string): Promise<ContextServiceResult> {
    const llmService = new LLMService(
      this.context.llmModel,
      this.context.streamEmitter,
      this.context.runId
    );
    const toolService = new ToolService();

    const gatheredInformation: string[] = [];
    const messages: Array<{
      role: "user" | "assistant" | "system" | "tool";
      content: string;
      toolCalls?: Array<{ id: string; name: string; arguments: string }>;
      toolCallId?: string;
    }> = [
      {
        role: "system",
        content: `Gather missing information needed to fulfill: "${userRequest}"

Use available tools to find answers. Never ask the user - always use tools to discover information yourself.
When you have enough context, summarize what you've gathered.`,
      },
      {
        role: "user",
        content: `User request: "${userRequest}"

What information is needed? Start gathering it using tools.`,
      },
    ];

    let iterations = 0;
    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const result = await llmService.call({
        messages,
        temperature: 0.3,
        availableTools: this.context.availableTools,
      });

      if (result.toolCalls?.length) {
        messages.push({
          role: "assistant",
          content: result.content || "",
          toolCalls: result.toolCalls.map(tc => ({
            id: tc.id,
            name: tc.name,
            arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
          })),
        });

        const toolResults = await toolService.executeTools(this.context, result.toolCalls);
        for (const toolResult of toolResults) {
          messages.push({
            role: "tool",
            content: toolResult.content,
            toolCallId: toolResult.toolCallId,
          });

          if (toolResult.content && !toolResult.content.startsWith("Error")) {
            gatheredInformation.push(
              toolResult.content.length > 300 
                ? `${toolResult.content.substring(0, 300)}...`
                : toolResult.content
            );
          }
        }
        continue;
      }

      messages.push({ role: "assistant", content: result.content });
      messages.push({
        role: "user",
        content: "If you have enough context, summarize. If not, use tools to gather more.",
      });
    }

    const summary = messages
      .filter(m => m.role === "assistant")
      .pop()?.content || "Context gathering completed.";

    return {
      enrichedContext: this.buildEnrichedContext(userRequest, gatheredInformation, summary),
      gatheredInformation,
      iterations,
    };
  }

  private buildEnrichedContext(
    userRequest: string,
    gatheredInfo: string[],
    summary: string
  ): string {
    const parts = [
      `Original request: ${userRequest}`,
      "",
      ...(gatheredInfo.length > 0 
        ? ["Gathered information:", ...gatheredInfo.map((info, idx) => `${idx + 1}. ${info}`), ""]
        : []),
      `Summary: ${summary}`,
    ];
    return parts.join("\n");
  }
}
