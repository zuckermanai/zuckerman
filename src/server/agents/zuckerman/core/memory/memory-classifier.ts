import { generateText, Output } from "ai";
import { z } from "zod";
import { LLMProvider } from "@server/world/providers/llm/index.js";
import type { MemoryType } from "./types.js";

export interface RememberedMemory {
  type: MemoryType;
  content: string;
  importance: number;
}

export interface RememberResult {
  memories: RememberedMemory[];
  hasImportantInfo: boolean;
}

export async function rememberMemoriesFromMessage(
  userMessage: string,
  conversationContext?: string
): Promise<RememberResult> {
  const model = await LLMProvider.getInstance().fastCheap();
  
  const schema = z.object({
    memories: z.array(z.object({
      type: z.enum(["semantic", "episodic", "procedural", "prospective", "emotional"]),
      content: z.string(),
      importance: z.number().min(0).max(1),
    })),
  });

  const response = await generateText({
    model,
    system: `You extract and categorize important information from messages into memory types:

- semantic: Facts, knowledge, personal info (name, preferences, opinions, learnings)
- episodic: Specific events, experiences, decisions, happenings
- procedural: Skills, patterns, habits, how-to knowledge
- prospective: Future intentions, plans, reminders, things to do later
- emotional: Emotionally significant experiences, feelings, emotional associations

Guidelines:
- Only extract information that is explicitly stated or clearly implied
- Importance: 0.7+ for critical info, 0.5-0.7 for moderately important, <0.5 for less important
- Content should be concise and clear, preserving key details
- If nothing is important enough, return empty array
- Each memory should be distinct and non-redundant`,
    messages: [
      { role: "user" as const, content: conversationContext 
        ? `Context: ${conversationContext}\n\nMessage: ${userMessage}`
        : userMessage
      },
    ],
    output: Output.object({ schema }),
    temperature: 0.3,
  });

  const result = response.output;
  
  return {
    memories: result.memories,
    hasImportantInfo: result.memories.length > 0,
  };
}
