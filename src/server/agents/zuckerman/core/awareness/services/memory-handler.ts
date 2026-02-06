import type { ConversationId } from "@server/agents/zuckerman/conversations/types.js";
import type { SemanticMemory, EpisodicMemory, ProceduralMemory, MemoryType } from "../../memory/types.js";
import type { UnifiedMemoryManager } from "../../memory/manager.js";

export class MemoryHandler {
  constructor(private memoryManager: UnifiedMemoryManager) {}

  /**
   * Get relevant memories for a message and format them as text
   */
  async getRelevantMemoriesText(
    message: string,
    options: { limit?: number; types?: MemoryType[] } = {}
  ): Promise<string> {
    try {
      const defaultTypes: MemoryType[] = ["semantic", "episodic", "procedural"];
      const memoryResult = await this.memoryManager.getRelevantMemories(message, {
        limit: options.limit || 50,
        types: options.types || defaultTypes,
      });

      if (memoryResult.memories.length === 0) {
        return "";
      }

      const memoryParts = memoryResult.memories.map((mem) => {
        switch (mem.type) {
          case "semantic": {
            const s = mem as SemanticMemory;
            const prefix = s.category ? `${s.category}: ` : "";
            return `[Semantic] ${prefix}${s.fact}`;
          }
          case "episodic": {
            const e = mem as EpisodicMemory;
            return `[Episodic] ${e.event}: ${e.context.what}`;
          }
          case "procedural": {
            const p = mem as ProceduralMemory;
            return `[Procedural] ${p.pattern}: ${p.action}`;
          }
          default:
            return `[${mem.type}] ${JSON.stringify(mem)}`;
        }
      });

      return `\n\n## Relevant Memories\n${memoryParts.join("\n")}`;
    } catch (error) {
      console.warn(`[MemoryHandler] Memory retrieval failed:`, error);
      return "";
    }
  }

  /**
   * Process new message for memory extraction
   */
  async extractMemories(
    message: string,
    conversationId: ConversationId,
    conversationContext?: string
  ): Promise<void> {
    try {
      await this.memoryManager.onNewMessage(message, conversationId, conversationContext);
    } catch (error) {
      console.warn(`[MemoryHandler] Memory extraction failed:`, error);
    }
  }
}
