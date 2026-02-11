import { generateText, Output } from "ai";
import { z } from "zod";
import type { WorkingMemory, StateUpdates } from "./types.js";
import type { LanguageModel } from "ai";
import type { System2DebugLogger } from "./debug.js";
import type { BrainModuleResult } from "./brain-module.js";
import { Tool } from "ai";

const memorySchema = z.object({
  memories: z.array(z.string()),
});

export class WorkingMemoryManager {
  constructor(private memory: WorkingMemory) {}

  getState(): WorkingMemory {
    return this.memory;
  }

  update(updates: StateUpdates): void {
    if (updates.memories) {
      const before = this.memory.memories.length;
      this.memory.memories = updates.memories;
      const diff = updates.memories.length - before;
      console.log(`[WorkingMemory] Updated memories: ${diff > 0 ? '+' : ''}${diff} (replaced)`);
    }
  }

  static initialize(relevantMemoriesText?: string): WorkingMemory {
    const memories: string[] = [];
    
    if (relevantMemoriesText) {
      const memoryLines = relevantMemoriesText.split('\n').filter(l => l.trim());
      memories.push(...memoryLines.slice(0, 10));
    }

    return { memories };
  }

  async remember(
    llmModel: LanguageModel,
    systemPrompt: string,
    brainResult: BrainModuleResult,
    brainPartId: string,
    brainPartName: string,
    debugLogger: System2DebugLogger
  ): Promise<void> {
    const currentMemory = this.getState();
    const currentMemoryText = currentMemory.memories.length > 0
      ? `Current working memory:\n${currentMemory.memories.map((m, i) => `${i + 1}. ${m}`).join("\n")}`
      : "Current working memory: (empty)";

    const brainResultText = `Brain part result:
- Brain part: ${brainPartName} (${brainPartId})
- Completed: ${brainResult.completed}
- Result: ${brainResult.result}
- Tool calls made: ${brainResult.toolCallsMade}`;

    const memoryPrompt = `You ARE Zuckerman. You are thinking through your Self - your central decision maker coordinating your brain modules.

CONTEXT: You ARE Zuckerman. You are an autonomous AI agent operating completely independently. You have no human assistance and must rely entirely on your own capabilities, tools, and reasoning. You coordinate your various brain modules to accomplish what you need to do.

You need to decide what important information you should remember in your working memory.

IMPORTANT: You ARE Zuckerman. You are operating completely independently. There is no one else who can help you - you must rely entirely on your own capabilities, tools, and reasoning. All decisions and actions must be made by you alone.

${currentMemoryText}

${brainResultText}

Think about what key information, insights, facts, or context you should remember for future cycles. Keep only the most important and relevant information. Update your working memory list.

Keep memories concise and actionable. Maximum 10 items.`;

    await debugLogger.logMemoryPrompt(memoryPrompt, currentMemory.memories);

    try {
      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: memoryPrompt },
      ];
      const result = await generateText({
        model: llmModel,
        messages,
        temperature: 0.2,
        output: Output.object({ schema: memorySchema }),
      });

      await debugLogger.logLLMCall("remember", messages, { content: result.text }, 0.2, []);

      const decision = result.output;
      
      if (decision.memories.length > 0) {
        // Limit to 10 items as per prompt guidance (Anthropic doesn't support maxItems in JSON schema)
        const limitedMemories = decision.memories.slice(0, 10);
        this.update({ memories: limitedMemories });
        await debugLogger.logMemoryUpdate(limitedMemories);
      }
    } catch (error) {
      await debugLogger.logError(error, "remember");
      throw error;
    }
  }
}
