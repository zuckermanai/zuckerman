import { generateText, Output } from "ai";
import { z } from "zod";
import type { Tool } from "ai";
import type { LanguageModel } from "ai";
import type { StreamEventEmitter } from "@server/world/communication/stream-emitter.js";
import { ToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import { convertToModelMessages } from "@server/world/providers/llm/helpers.js";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";

export interface CriticismResult {
  satisfied: boolean;
  reason: string;
  missing: string[];
}

const MAX_VERIFICATION_ITERATIONS = 5;

export class CriticismService {
  constructor(
    private llmModel: LanguageModel,
    private streamEmitter: StreamEventEmitter,
    private runId: string,
    private availableTools: Record<string, Tool>,
    private toolRegistry: ToolRegistry
  ) {}

  async run(params: {
    userRequest: string;
    systemResult: string;
  }): Promise<CriticismResult> {
    const messages: ConversationMessage[] = [
      {
        role: "system",
        content: `You are a validation assistant. Verify if the system result satisfies the user's request.

IMPORTANT CONTEXT: You are operating completely independently. There is no one else who can help you - you must rely entirely on your own capabilities, tools, and reasoning. All validation must be done by you alone.

User asked: "${params.userRequest}"
System did: ${params.systemResult}

Use available tools to verify things if needed (check files, run commands, etc.).`,
        timestamp: Date.now(),
      },
      {
        role: "user",
        content: "Verify if the system result satisfies the user's request. Use tools if needed to check things.",
        timestamp: Date.now(),
      },
    ];

    const criticismSchema = z.object({
      satisfied: z.boolean(),
      reason: z.string(),
      missing: z.array(z.string()),
    });

    // AI SDK handles tool execution automatically
    const result = await generateText({
      model: this.llmModel,
      messages: convertToModelMessages(messages),
      temperature: 0.3,
      tools: this.availableTools,
      output: Output.object({ schema: criticismSchema }),
    });

    // No tool calls - LLM has finished verification
    return result.output;
  }
}
