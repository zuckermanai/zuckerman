/**
 * Unified Memory Manager
 * Coordinates all memory types and provides unified interface
 */

import { WorkingMemoryStore } from "./stores/working/index.js";
import { EpisodicMemoryStore } from "./stores/episodic/index.js";
import { SemanticMemoryStore } from "./stores/semantic/index.js";
import { ProceduralMemoryStore } from "./stores/procedural/index.js";
import { ProspectiveMemoryStore } from "./stores/prospective/index.js";
import { EmotionalMemoryStore } from "./stores/emotional/index.js";
import type {
  MemoryManager,
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

import { extractMemoriesFromMessage } from "./memory-classifier.js";
import type { LLMProvider } from "@server/world/providers/llm/types.js";
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

  private homedirDir?: string;
  private agentId?: string;
  private llmProvider?: LLMProvider;
  private dbInitialized: boolean = false;

  constructor(homedirDir?: string, llmProvider?: LLMProvider, agentId?: string) {
    this.llmProvider = llmProvider;
    this.homedirDir = homedirDir;
    this.agentId = agentId || "zuckerman";

    this.workingMemory = new WorkingMemoryStore();
    this.episodicMemory = new EpisodicMemoryStore(this.agentId);
    this.semanticMemory = new SemanticMemoryStore(this.agentId);
    this.proceduralMemory = new ProceduralMemoryStore(this.agentId);
    this.prospectiveMemory = new ProspectiveMemoryStore(this.agentId);
    this.emotionalMemory = new EmotionalMemoryStore(this.agentId);
  }


  /**
   * Set or update the LLM provider
   */
  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
  }

  /**
   * Create a memory manager instance from homedir directory and agent ID
   */
  static create(homedirDir: string, llmProvider?: LLMProvider, agentId?: string): UnifiedMemoryManager {
    return new UnifiedMemoryManager(homedirDir, llmProvider, agentId);
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

    if (!this.homedirDir) {
      console.warn("[Memory] Cannot initialize database: homedirDir not set");
      return;
    }

    try {
      const embeddingCacheTable = "embedding_cache";
      const ftsTable = "fts_memory";

      initializeDatabase(
        config,
        this.homedirDir,
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

  // ========== Working Memory ==========
  // Active buffer for current task processing. Short-lived (minutes to hours), in-memory only. No file storage.

  setWorkingMemory(
    conversationId: string,
    content: string,
    context?: Record<string, unknown>
  ): void {
    this.workingMemory.set(conversationId, content, context);
  }

  getWorkingMemory(conversationId: string): WorkingMemory | null {
    return this.workingMemory.get(conversationId);
  }

  clearWorkingMemory(conversationId: string): void {
    this.workingMemory.clear(conversationId);
  }

  // ========== Episodic Memory ==========
  // Remembers specific events and experiences. Stored in episodic.json, also appended to daily logs. Decays over time (days to weeks).

  addEpisodicMemory(
    memory: Omit<EpisodicMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    const id = this.episodicMemory.add(memory);

    return id;
  }

  async getEpisodicMemories(
    options?: MemoryRetrievalOptions
  ): Promise<EpisodicMemory[]> {
    const results = this.episodicMemory.query({
      conversationId: options?.conversationId,
      startTime: options?.maxAge ? Date.now() - options.maxAge : undefined,
      limit: options?.limit,
      query: options?.query,
    });

    return results;
  }

  // ========== Semantic Memory ==========
  // Stores facts, knowledge, and concepts. Permanent storage, saved to semantic.json.

  addSemanticMemory(
    memory: Omit<SemanticMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    // Store in structured JSON file only
    return this.semanticMemory.add(memory);
  }

  async getSemanticMemories(
    options?: MemoryRetrievalOptions
  ): Promise<SemanticMemory[]> {
    // Query from structured JSON store
    return this.semanticMemory.query({
      conversationId: options?.conversationId,
      query: options?.query,
      limit: options?.limit,
    });
  }

  // ========== Procedural Memory ==========
  // Stores skills, habits, and automatic patterns. Improves with use, stored in procedural.json.

  addProceduralMemory(
    memory: Omit<ProceduralMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.proceduralMemory.add(memory);
  }

  async getProceduralMemories(trigger?: string): Promise<ProceduralMemory[]> {
    if (trigger) {
      return this.proceduralMemory.findMatching(trigger);
    }
    return this.proceduralMemory.getAll();
  }

  updateProceduralMemory(id: string, success: boolean): void {
    this.proceduralMemory.recordUse(id, success);
  }

  // ========== Prospective Memory ==========
  // Stores future intentions, reminders, and scheduled tasks. Triggers at specific times or contexts. Stored in prospective.json.

  addProspectiveMemory(
    memory: Omit<ProspectiveMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.prospectiveMemory.add(memory);
  }

  async getProspectiveMemories(
    options?: MemoryRetrievalOptions
  ): Promise<ProspectiveMemory[]> {
    return this.prospectiveMemory.query({
      conversationId: options?.conversationId,
      status: "pending",
      limit: options?.limit,
    });
  }

  triggerProspectiveMemory(id: string): void {
    this.prospectiveMemory.trigger(id);
  }

  completeProspectiveMemory(id: string): void {
    this.prospectiveMemory.complete(id);
  }

  // ========== Emotional Memory ==========
  // Stores emotional associations and reactions linked to other memories. Provides context for emotional responses. Stored in emotional.json.

  addEmotionalMemory(
    memory: Omit<EmotionalMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.emotionalMemory.add(memory);
  }

  async getEmotionalMemories(
    targetMemoryId?: string
  ): Promise<EmotionalMemory[]> {
    if (targetMemoryId) {
      return this.emotionalMemory.getByTarget(targetMemoryId);
    }
    return this.emotionalMemory.getAll();
  }

  // ========== Unified Retrieval ==========

  async retrieveMemories(
    options: MemoryRetrievalOptions
  ): Promise<MemoryRetrievalResult> {
    const allMemories: BaseMemory[] = [];
    const types = options.types ?? [
      "working",
      "episodic",
      "semantic",
      "procedural",
      "prospective",
      "emotional",
    ];

    // Collect memories from all requested types
    if (types.includes("working")) {
      const working = options.conversationId
        ? [this.workingMemory.get(options.conversationId)].filter(Boolean)
        : this.workingMemory.getAll();
      allMemories.push(...(working as BaseMemory[]));
    }

    if (types.includes("episodic")) {
      const episodic = await this.getEpisodicMemories(options);
      allMemories.push(...episodic);
    }

    if (types.includes("semantic")) {
      const semantic = await this.getSemanticMemories(options);
      allMemories.push(...semantic);
    }

    if (types.includes("procedural")) {
      const procedural = await this.getProceduralMemories(options.query);
      allMemories.push(...procedural);
    }

    if (types.includes("prospective")) {
      const prospective = await this.getProspectiveMemories(options);
      allMemories.push(...prospective);
    }

    if (types.includes("emotional")) {
      const emotional = await this.getEmotionalMemories();
      allMemories.push(...emotional);
    }

    // Sort by recency (newest first)
    allMemories.sort((a, b) => b.updatedAt - a.updatedAt);

    // Limit results
    let filtered = allMemories;
    if (options.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return {
      memories: filtered,
      total: allMemories.length,
    };
  }

  // ========== Cleanup ==========

  async cleanup(): Promise<void> {
    // Clear expired working memories
    this.clearExpiredWorkingMemory();

    // TODO: Clean up old episodic memories
    // TODO: Clean up completed prospective memories
  }

  clearExpiredWorkingMemory(): void {
    this.workingMemory.clearExpired();
  }

  // ========== Utility Methods ==========

  /**
   * Get due prospective memories (for periodic checking)
   */
  getDueProspectiveMemories(): ProspectiveMemory[] {
    return this.prospectiveMemory.getDue();
  }

  /**
   * Get prospective memories matching context
   */
  getProspectiveMemoriesByContext(context: string): ProspectiveMemory[] {
    return this.prospectiveMemory.getByContext(context);
  }


  /**
   * Load and format memory for prompt injection
   * Returns formatted memory string ready to be included in system prompt
   */
  loadMemoryForPrompt(): string {
    if (!this.homedirDir) {
      throw new Error("Homedir directory not set");
    }

    const parts: string[] = [];

    // Load semantic memories from JSON store
    const semanticMemories = this.semanticMemory.getAll();
    if (semanticMemories.length > 0) {
      const semanticParts = semanticMemories.map(mem => {
        let formatted = mem.fact;
        if (mem.category) {
          formatted = `${mem.category}: ${formatted}`;
        }
        return `- ${formatted}`;
      });
      parts.push(`## Semantic Memory\n\n${semanticParts.join("\n")}`);
    }


    return parts.length > 0 ? parts.join("\n\n---\n\n") : "";
  }

  // ========== Sleep Mode Integration ==========

  /**
   * Save consolidated memories from sleep mode
   * Creates structured episodic/semantic memories and also saves to files for backward compatibility
   */
  saveConsolidatedMemories(
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

  // ========== Real-time Memory Extraction ==========

  /**
   * Process a new user message and extract/save important memories
   * This is called by the runtime when a new user message arrives
   */
  async onNewMessage(
    userMessage: string,
    conversationId?: string,
    conversationContext?: string
  ): Promise<void> {
    if (!this.llmProvider) {
      // No LLM provider available, skip extraction
      throw new Error("LLM provider not set");
    }

    try {
      const extractionResult = await extractMemoriesFromMessage(
        this.llmProvider,
        userMessage,
        conversationContext
      );

      if (extractionResult.hasImportantInfo && extractionResult.memories.length > 0) {
        const now = Date.now();

        for (const memory of extractionResult.memories) {
          // Save to semantic memory (long-term): facts, preferences, learnings
          if (memory.type === "fact" || memory.type === "preference" || memory.type === "learning") {
            // Use structured data if available for better fact extraction
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
    } catch (extractionError) {
      // Don't fail if extraction fails - just log and continue
      console.warn(`[UnifiedMemoryManager] Memory extraction failed:`, extractionError);
    }
  }
}
