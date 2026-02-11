/**
 * Smart Memory Remembering Service
 * Uses LLM to intelligently detect and remember important information from user messages
 */

import { generateText, Output } from "ai";
import { z } from "zod";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";
import { LLMProvider } from "@server/world/providers/llm/index.js";
import { convertToModelMessages } from "@server/world/providers/llm/helpers.js";

export interface RememberedMemory {
  type: "fact" | "preference" | "decision" | "event" | "learning";
  content: string;
  importance: number; // 0-1
  structuredData?: Record<string, unknown>; // e.g., {name: "dvir", field: "name"}
}

export interface RememberResult {
  memories: RememberedMemory[];
  memoriesByCategory: {
    fact?: RememberedMemory[];
    preference?: RememberedMemory[];
    decision?: RememberedMemory[];
    event?: RememberedMemory[];
    learning?: RememberedMemory[];
  };
  hasImportantInfo: boolean;
}

/**
 * Remember important memories from a user message using LLM
 */
export async function rememberMemoriesFromMessage(
  userMessage: string,
  conversationContext?: string
): Promise<RememberResult> {
  // Select model for memory remembering (fastCheap for efficiency)
  const llmManager = LLMProvider.getInstance();
  const model = await llmManager.fastCheap();
  const systemPrompt = `You are the part of the brain that estimates what information is important enough to remember. Like the hippocampus and prefrontal cortex working together, you evaluate incoming information and determine what should be stored in memory for future recall.

You assess and categorize:
- Facts: Personal information (name, age, location, etc.), factual statements worth remembering
- Preferences: Likes, dislikes, preferences, opinions that define the person
- Decisions: Important choices, commitments, plans that matter
- Events: Significant happenings, milestones worth preserving
- Learning: New knowledge, insights, lessons that add value

You only mark information as important if it:
1. Is explicitly stated or clearly implied
2. Has value for future conversations and interactions
3. Is not trivial or already well-established

Each memory object should include:
- content: The information to remember (concise, clear). Include structured information in the content if relevant (e.g., "Name: alex" or "Location: New York").
- importance: 0-1 score representing how critical this is (0.7+ for very important, 0.5-0.7 for moderately important)

Only include categories that have memories. If nothing is important enough to remember, return an empty object.`;

  const messages: ConversationMessage[] = [
    {
      role: "system",
      content: systemPrompt,
      timestamp: Date.now(),
    },
    {
      role: "user",
      content: conversationContext
        ? `Context: ${conversationContext}\n\nUser message: ${userMessage}`
        : userMessage,
      timestamp: Date.now(),
    },
  ];

  // Note: structuredData is excluded from schema because Anthropic doesn't support
  // additionalProperties: object. The LLM can still include structured info in the content field.
  const memoryItemSchema = z.object({
    content: z.string(),
    importance: z.number(), // Note: Anthropic doesn't support min/max on number types in JSON schema
  });
  
  const memorySchema = z.object({
    fact: z.array(memoryItemSchema).optional(),
    preference: z.array(memoryItemSchema).optional(),
    decision: z.array(memoryItemSchema).optional(),
    event: z.array(memoryItemSchema).optional(),
    learning: z.array(memoryItemSchema).optional(),
  });

  try {
    const response = await generateText({
      model,
      messages: convertToModelMessages(messages),
      temperature: 0.3, // Low temperature for consistent remembering
      output: Output.object({ schema: memorySchema }),
    });

    const parsed = response.output;
    
    // Process each category
    const memoriesByCategory: RememberResult["memoriesByCategory"] = {};
    const memories: RememberedMemory[] = [];
    const validCategories = ["fact", "preference", "decision", "event", "learning"] as const;
    
    for (const category of validCategories) {
      if (parsed[category] && Array.isArray(parsed[category])) {
        const categoryMemories = parsed[category].map((m: any) => ({
          type: category as RememberedMemory["type"],
          content: m.content,
          // Clamp importance to 0-1 range (Anthropic doesn't support min/max in schema)
          importance: Math.max(0, Math.min(1, m.importance ?? 0.5)),
          // structuredData is not available in structured format due to Anthropic limitations
          // The LLM can include structured info in the content field if needed
          structuredData: undefined,
        }));
        
        if (categoryMemories.length > 0) {
          memoriesByCategory[category] = categoryMemories;
          memories.push(...categoryMemories);
        }
      }
    }

    return {
      memories,
      memoriesByCategory,
      hasImportantInfo: memories.length > 0,
    };
  } catch (error) {
    console.error(`[MemoryRemember] Error remembering memories:`, error);
    throw error;
  }
}
