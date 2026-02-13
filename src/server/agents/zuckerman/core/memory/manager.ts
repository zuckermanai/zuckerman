/**
 * Unified Memory Manager
 * Uses single MemoryStore class for all memory types, each stored in separate files
 */

import { WorkingMemoryStore } from "./stores/working-store.js";
import { MemoryStore } from "./stores/memory-store.js";
import type {
  MemoryType,
  MemoryRetrievalResult,
} from "./types.js";

import { rememberMemoriesFromMessage } from "./memory-classifier.js";
import type { ResolvedMemorySearchConfig } from "./config.js";
import { initializeDatabase } from "./retrieval/db.js";

export class UnifiedMemoryManager {
  private semanticMemory: MemoryStore;
  private episodicMemory: MemoryStore;
  private proceduralMemory: MemoryStore;
  private prospectiveMemory: MemoryStore;
  private emotionalMemory: MemoryStore;
  private workingMemory: WorkingMemoryStore;

  private homedir?: string;
  private agentId?: string;
  private dbInitialized: boolean = false;

  constructor(homedir?: string, agentId?: string) {
    this.homedir = homedir;
    this.agentId = agentId || "zuckerman";

    this.semanticMemory = new MemoryStore(this.agentId, "semantic");
    this.episodicMemory = new MemoryStore(this.agentId, "episodic");
    this.proceduralMemory = new MemoryStore(this.agentId, "procedural");
    this.prospectiveMemory = new MemoryStore(this.agentId, "prospective");
    this.emotionalMemory = new MemoryStore(this.agentId, "emotional");
    this.workingMemory = new WorkingMemoryStore(this.agentId);
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

  // ========== Event-Driven Memory Methods ==========

  onSleepEnded(keepIds: string[]): void {
    const keep = new Set(keepIds);
    const stores = [
      this.semanticMemory,
      this.episodicMemory,
      this.proceduralMemory,
      this.prospectiveMemory,
      this.emotionalMemory,
    ];
    
    for (const store of stores) {
      for (const m of store.getAll()) {
        if (!keep.has(m.id)) {
          store.delete(m.id);
        }
      }
    }
  }

  async onNewMessage(userMessage: string, conversationContext?: string): Promise<void> {
    try {
      const result = await rememberMemoriesFromMessage(userMessage, conversationContext);
      if (!result.hasImportantInfo || result.memories.length === 0) return;

      for (const m of result.memories) {
        const store = this.getStoreForType(m.type);
        if (store) {
          store.add({
            content: m.content,
            conversationId: conversationContext,
          });
        }
      }
    } catch (err) {
      console.warn(`[UnifiedMemoryManager] Memory remembering failed:`, err);
    }
  }

  private getStoreForType(type: MemoryType): MemoryStore | null {
    switch (type) {
      case "semantic":
        return this.semanticMemory;
      case "episodic":
        return this.episodicMemory;
      case "procedural":
        return this.proceduralMemory;
      case "prospective":
        return this.prospectiveMemory;
      case "emotional":
        return this.emotionalMemory;
      case "working":
        return null; // Working memory uses separate store
      default:
        return null;
    }
  }

  /**
   * Set working memory
   */
  setWorkingMemory(items: string[]): void {
    this.workingMemory.set(JSON.stringify(items));
  }

  /**
   * Get working memory
   */
  getWorkingMemory(): string[] {
    return this.workingMemory.getAllItems();
  }

  /**
   * Get all memories for consolidation
   */
  getAllMemories(): Array<{ id: string; type: MemoryType; content: string }> {
    const allMemories: Array<{ id: string; type: MemoryType; content: string }> = [];
    
    const stores = [
      { store: this.semanticMemory, type: "semantic" as const },
      { store: this.episodicMemory, type: "episodic" as const },
      { store: this.proceduralMemory, type: "procedural" as const },
      { store: this.prospectiveMemory, type: "prospective" as const },
      { store: this.emotionalMemory, type: "emotional" as const },
    ];
    
    for (const { store, type } of stores) {
      for (const m of store.getAll()) {
        allMemories.push({
          id: m.id,
          type,
          content: m.content,
        });
      }
    }
    
    return allMemories;
  }

  /**
   * Get relevant memories for a question/query
   */
  async getRelevantMemories(
    question: string,
    options?: {
      limit?: number;
      types?: MemoryType[];
    }
  ): Promise<MemoryRetrievalResult> {
    const types = options?.types ?? ["semantic", "episodic", "procedural"];
    const allMemories = [];
    
    const typeMap: Record<MemoryType, MemoryStore | null> = {
      semantic: this.semanticMemory,
      episodic: this.episodicMemory,
      procedural: this.proceduralMemory,
      prospective: this.prospectiveMemory,
      emotional: this.emotionalMemory,
      working: null,
    };
    
    for (const type of types) {
      const store = typeMap[type];
      if (store) {
        allMemories.push(...store.getAll());
      }
    }
    
    allMemories.sort((a, b) => b.updatedAt - a.updatedAt);
    
    const limit = options?.limit ?? 20;
    return {
      memories: allMemories.slice(0, limit),
      total: allMemories.length,
    };
  }
}
