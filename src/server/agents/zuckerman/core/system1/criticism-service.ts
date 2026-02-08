import type { RunContext } from "@server/world/providers/llm/context.js";
import { LLMService } from "@server/world/providers/llm/llm-service.js";
import { ToolService } from "../../tools/index.js";

export interface CriticismResult {
  satisfied: boolean;
  reason: string;
  missing: string[];
}

const MAX_VERIFICATION_ITERATIONS = 5;

export class CriticismService {
  constructor(private context: RunContext) {}

  async run(params: {
    userRequest: string;
    systemResult: string;
  }): Promise<CriticismResult> {
    const llmService = new LLMService(
      this.context.llmModel,
      this.context.streamEmitter,
      this.context.runId
    );
    const toolService = new ToolService();

    const messages: Array<{
      role: "user" | "assistant" | "system" | "tool";
      content: string;
      toolCalls?: Array<{ id: string; name: string; arguments: string }>;
      toolCallId?: string;
    }> = [
      {
        role: "system",
        content: `You are a validation assistant. Verify if the system result satisfies the user's request.

User asked: "${params.userRequest}"
System did: ${params.systemResult}

Use available tools to verify things if needed (check files, run commands, etc.).
When done, respond with JSON:
{
  "satisfied": true/false,
  "reason": "brief explanation",
  "missing": ["what's still needed if not satisfied"]
}`,
      },
      {
        role: "user",
        content: "Verify if the system result satisfies the user's request. Use tools if needed to check things.",
      },
    ];

    let iterations = 0;
    while (iterations < MAX_VERIFICATION_ITERATIONS) {
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
        }
        continue;
      }

      // No tool calls - LLM has finished verification
      return this.parseResponse(result.content);
    }

    // Max iterations reached
    return { satisfied: false, reason: "Verification timeout", missing: [] };
  }

  private parseResponse(content: string): CriticismResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      const parsed = JSON.parse(jsonStr);
      
      return {
        satisfied: Boolean(parsed.satisfied),
        reason: String(parsed.reason || "No reason provided"),
        missing: Array.isArray(parsed.missing) ? parsed.missing.map(String) : [],
      };
    } catch (error) {
      console.warn(`[CriticismService] Parse failed:`, error);
      return { satisfied: false, reason: "Could not parse response", missing: [] };
    }
  }
}
