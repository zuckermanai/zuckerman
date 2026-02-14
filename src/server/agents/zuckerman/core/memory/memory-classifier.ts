import { generateText, Output } from "ai";
import { z } from "zod";
import { LLMProvider } from "@server/world/providers/llm/index.js";
import type { MemoryType, MemoryMetadata } from "./types.js";
import type { MemoryStore } from "./memory-store.js";

export interface ClassifiedMemory {
  type: MemoryType;
  content: string;
  importance: number;
}

export interface ClassificationResult {
  memories: ClassifiedMemory[];
  hasImportantInfo: boolean;
}

export type EventType = "message" | "action" | "thought" | "decision" | "experience" | "other";

export interface MemoryEvent {
  type: EventType;
  content: string;
  metadata?: MemoryMetadata;
  context?: string;
}

export class MemoryClassifier {
  private stores: Map<MemoryType, MemoryStore>;

  constructor(stores: Map<MemoryType, MemoryStore>) {
    this.stores = stores;
  }

  /**
   * Classify and save an event to appropriate memory stores
   */
  async classifyAndSave(event: MemoryEvent): Promise<ClassificationResult> {
    try {
      const result = await this.classify(event);
      
      if (!result.hasImportantInfo || result.memories.length === 0) {
        return result;
      }

      for (const memory of result.memories) {
        const store = this.stores.get(memory.type);
        if (store) {
          store.insert({
            content: memory.content,
            metadata: event.metadata,
          });
        }
      }

      return result;
    } catch (err) {
      console.warn(`[MemoryClassifier] Classification failed:`, err);
      return { memories: [], hasImportantInfo: false };
    }
  }

  /**
   * Classify an event into memory types without saving
   */
  async classify(event: MemoryEvent): Promise<ClassificationResult> {
    const model = await LLMProvider.getInstance().fastCheap();
    
    const schema = z.object({
      memories: z.array(z.object({
        type: z.enum(["semantic", "episodic", "procedural", "prospective", "emotional"]),
        content: z.string(),
        importance: z.number().min(0).max(1),
      })),
    });

    const systemPrompt = this.buildSystemPrompt(event.type);
    const userPrompt = this.buildUserPrompt(event);

    const response = await generateText({
      model,
      system: systemPrompt,
      messages: [
        { role: "user" as const, content: userPrompt },
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

  private buildSystemPrompt(eventType: EventType): string {
    const basePrompt = `You extract and categorize important information from events into memory types:

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
- Each memory should be distinct and non-redundant`;

    const eventTypeGuidance: Record<EventType, string> = {
      message: "\n\nFocus: Extract memories from user messages and conversations.",
      action: "\n\nFocus: Extract procedural knowledge and episodic events from actions taken.",
      thought: "\n\nFocus: Extract semantic knowledge and decision patterns from internal thoughts.",
      decision: "\n\nFocus: Extract episodic events (decisions made) and prospective memories (future implications).",
      experience: "\n\nFocus: Extract episodic and emotional memories from experiences.",
      other: "\n\nFocus: Extract any relevant memories from general events.",
    };

    return basePrompt + eventTypeGuidance[eventType];
  }

  private buildUserPrompt(event: MemoryEvent): string {
    let prompt = `Event Type: ${event.type}\n\nContent: ${event.content}`;
    
    if (event.context) {
      prompt = `Context: ${event.context}\n\n${prompt}`;
    }
    
    if (event.metadata?.conversationId) {
      prompt += `\n\nConversation ID: ${event.metadata.conversationId}`;
    }

    return prompt;
  }
}
