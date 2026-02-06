/**
 * Unified Memory Manager
 * Coordinates all memory types and provides unified interface
 */

import { WorkingMemoryStore } from "./stores/working-store.js";
import { EpisodicMemoryStore } from "./stores/episodic-store.js";
import { SemanticMemoryStore } from "./stores/semantic-store.js";
import { ProceduralMemoryStore } from "./stores/procedural-store.js";
import { ProspectiveMemoryStore } from "./stores/prospective-store.js";
import { EmotionalMemoryStore } from "./stores/emotional-store.js";
import type {
  MemoryManager,
  MemoryType,
  WorkingMemory,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  ProspectiveMemory,
  EmotionalMemory,
  MemoryRetrievalOptions,
  MemoryRetrievalResult,
  BaseMemory,
} from "./types.js";

import { rememberMemoriesFromMessage } from "./memory-classifier.js";
import type { ResolvedMemorySearchConfig } from "./config.js";
import { initializeDatabase } from "./retrieval/db.js";
import { existsSync, readFileSync } from "node:fs";

export class UnifiedMemoryManager implements MemoryManager {
  private workingMemory: WorkingMemoryStore;
  private episodicMemory: EpisodicMemoryStore;
  private semanticMemory: SemanticMemoryStore;
  private proceduralMemory: ProceduralMemoryStore;
  private prospectiveMemory: ProspectiveMemoryStore;
  private emotionalMemory: EmotionalMemoryStore;

  private homedir?: string;
  private agentId?: string;
  private dbInitialized: boolean = false;

  constructor(homedir?: string, agentId?: string) {
    this.homedir = homedir;
    this.agentId = agentId || "zuckerman";

    this.workingMemory = new WorkingMemoryStore();
    this.episodicMemory = new EpisodicMemoryStore(this.agentId);
    this.semanticMemory = new SemanticMemoryStore(this.agentId);
    this.proceduralMemory = new ProceduralMemoryStore(this.agentId);
    this.prospectiveMemory = new ProspectiveMemoryStore(this.agentId);
    this.emotionalMemory = new EmotionalMemoryStore(this.agentId);
  }


  /**
   * Create a memory manager instance from homedir directory and agent ID
   */
  static create(homedir: string, agentId?: string): UnifiedMemoryManager {
    return new UnifiedMemoryManager(homedir, agentId);
  }

  /**
   * Initialize the vector database for memory search.
   * This should be called once when the agent starts, before any memory operations.
   */
  async initializeDatabase(
    config: ResolvedMemorySearchConfig,
    agentId: string,
  ): Promise<void> {
    if (this.dbInitialized) return;

    if (!this.homedir) {
      console.warn("[Memory] Cannot initialize database: homedir not set");
      return;
    }

    try {
      const embeddingCacheTable = "embedding_cache";
      const ftsTable = "fts_memory";

      initializeDatabase(
        config,
        this.homedir,
        agentId,
        embeddingCacheTable,
        ftsTable,
      );

      this.dbInitialized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Memory] Failed to initialize database:`, message);
      // Don't throw - allow memory manager to work without vector search
    }
  }

  // ========== Internal Memory Management ==========
  // These methods are private and only used internally

  private addEpisodicMemory(
    memory: Omit<EpisodicMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.episodicMemory.add(memory);
  }

  private addSemanticMemory(
    memory: Omit<SemanticMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.semanticMemory.add(memory);
  }

  private addProceduralMemory(
    memory: Omit<ProceduralMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.proceduralMemory.add(memory);
  }

  private addProspectiveMemory(
    memory: Omit<ProspectiveMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.prospectiveMemory.add(memory);
  }

  private addEmotionalMemory(
    memory: Omit<EmotionalMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.emotionalMemory.add(memory);
  }


  // ========== Event-Driven Memory Methods ==========

  /**
   * Called when sleep mode ends
   * Saves consolidated memories from sleep mode as structured episodic/semantic memories
   */
  onSleepEnded(
    memories: Array<{
      content: string;
      type: "fact" | "preference" | "decision" | "event" | "learning";
      importance: number;
    }>,
    conversationId?: string
  ): void {
    for (const memory of memories) {
      // Always save as semantic memory (long-term)
      this.addSemanticMemory({
        fact: memory.content,
        category: memory.type,
        confidence: memory.importance,
        source: conversationId,
      });
    }
  }

  /**
   * Process a new user message and remember/save important memories
   * This is called by the runtime when a new user message arrives
   */
  async onNewMessage(
    userMessage: string,
    conversationId?: string,
    conversationContext?: string
  ): Promise<void> {
    try {
      const rememberResult = await rememberMemoriesFromMessage(
        userMessage,
        conversationContext
      );

      if (rememberResult.hasImportantInfo && rememberResult.memories.length > 0) {
        const now = Date.now();

        for (const memory of rememberResult.memories) {
          // Save to semantic memory (long-term): facts, preferences, learnings
          if (memory.type === "fact" || memory.type === "preference" || memory.type === "learning") {
            // Use structured data if available for better fact remembering
            const fact = memory.structuredData
              ? Object.entries(memory.structuredData)
                .filter(([k]) => k !== "field")
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ") || memory.content
              : memory.content;

            this.addSemanticMemory({
              fact,
              category: memory.type,
              confidence: memory.importance,
              source: conversationId,
            });
          }
          // Save to episodic memory (time-bound): decisions, events
          else if (memory.type === "decision" || memory.type === "event") {
            this.addEpisodicMemory({
              event: memory.type === "event" ? memory.content : `${memory.type}: ${memory.content}`,
              timestamp: now,
              context: {
                what: memory.content,
                when: now,
                why: `Importance: ${memory.importance.toFixed(2)}, Type: ${memory.type}`,
              },
              conversationId,
            });
          }
        }
      }
    } catch (rememberError) {
      // Don't fail if remembering fails - just log and continue
      console.warn(`[UnifiedMemoryManager] Memory remembering failed:`, rememberError);
    }
  }

  /**
   * Get relevant memories for a question/query
   * Fetches all memories from specified memory types
   */
  async getRelevantMemories(
    question: string,
    options?: {
      limit?: number;
      types?: MemoryType[];
    }
  ): Promise<MemoryRetrievalResult> {
    const allMemories: BaseMemory[] = [];
    const types = options?.types ?? ["semantic", "episodic", "procedural"];
    const limit = options?.limit ?? 20;

    // Fetch semantic memories (facts, knowledge)
    if (types.includes("semantic")) {
      const semanticMemories = this.semanticMemory.getAll();
      allMemories.push(...semanticMemories);
    }

    // Fetch episodic memories (events, experiences)
    if (types.includes("episodic")) {
      const episodicMemories = this.episodicMemory.getAll();
      allMemories.push(...episodicMemories);
    }

    // Fetch procedural memories (patterns, skills)
    if (types.includes("procedural")) {
      const proceduralMemories = this.proceduralMemory.getAll();
      allMemories.push(...proceduralMemories);
    }

    // Sort by recency (newest first)
    allMemories.sort((a, b) => b.updatedAt - a.updatedAt);

    // Apply final limit
    const limited = allMemories.slice(0, limit);

    return {
      memories: limited,
      total: allMemories.length,
    };
  }

}
