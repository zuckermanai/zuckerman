/**
 * Memory Service
 * Uses single MemoryStore class for all memory types, each stored in separate files
 */

import { MemoryStore } from "./memory-store.js";
import type {
  Memory as MemoryEntry,
  MemoryMetadata,
  MemoryType,
  MemoryRetrievalResult,
} from "./types.js";

import type { ResolvedMemorySearchConfig } from "./config.js";
import { initializeDatabase } from "./retrieval/db.js";

export class MemorySystem {
  private stores: Map<MemoryType, MemoryStore>;

  private homedir?: string;
  private agentId?: string;
  private dbInitialized: boolean = false;

  constructor(homedir?: string, agentId?: string) {
    this.homedir = homedir;
    this.agentId = agentId || "zuckerman";

    this.stores = new Map([
      ["semantic", new MemoryStore(this.agentId, "semantic")],
      ["episodic", new MemoryStore(this.agentId, "episodic")],
      ["procedural", new MemoryStore(this.agentId, "procedural")],
      ["prospective", new MemoryStore(this.agentId, "prospective")],
      ["emotional", new MemoryStore(this.agentId, "emotional")],
      ["working", new MemoryStore(this.agentId, "working")],
    ]);
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
      // Don't throw - allow memory service to work without vector search
    }
  }

  // ========== General Memory API ==========

  /**
   * Insert a memory
   */
  insert(type: MemoryType, content: string, metadata?: MemoryMetadata): string {
    const store = this.stores.get(type);
    if (!store) {
      throw new Error(`Memory store not found for type: ${type}`);
    }
    return store.insert({ content, metadata });
  }

  /**
   * Find a memory by type and ID
   */
  find(type: MemoryType, id: string) {
    const store = this.stores.get(type);
    if (!store) return null;
    return store.find(id);
  }

  /**
   * Find all memories of a type
   */
  findAll(type: MemoryType) {
    const store = this.stores.get(type);
    if (!store) return [];
    return store.findAll();
  }

  /**
   * Replace all memories of a type with new contents
   */
  setAll(type: MemoryType, contents: string[], metadata?: MemoryMetadata): void {
    const store = this.stores.get(type);
    if (!store) {
      throw new Error(`Memory store not found for type: ${type}`);
    }

    // Clear all existing memories
    const existing = store.findAll();
    for (const memory of existing) {
      store.remove(memory.id);
    }
    
    // Insert new memories
    for (const content of contents) {
      if (metadata) {
        store.insert({ content, metadata });
      } else {
        store.insert({ content });
      }
    }
  }

  /**
   * Update a memory
   */
  update(type: MemoryType, id: string, updates: Partial<{ content: string; metadata?: MemoryMetadata }>): boolean {
    const store = this.stores.get(type);
    if (!store) return false;
    return store.update(id, updates);
  }

  /**
   * Remove a memory
   */
  remove(type: MemoryType, id: string): boolean {
    const store = this.stores.get(type);
    if (!store) return false;
    return store.remove(id);
  }

  /**
   * Get memories - flexible function that can return different formats
   */
  getMemories(options?: {
    type?: MemoryType;
    types?: MemoryType[];
    format?: "full" | "content";
    limit?: number;
    conversationId?: string;
    channelSource?: string;
  }): MemoryEntry[] | string[] {
    // Determine which types to query
    let typesToQuery: MemoryType[];
    if (options?.type) {
      typesToQuery = [options.type];
    } else if (options?.types && options.types.length > 0) {
      typesToQuery = options.types;
    } else {
      typesToQuery = ["semantic", "episodic", "procedural", "prospective", "emotional", "working"];
    }

    const allMemories: MemoryEntry[] = [];
    
    for (const type of typesToQuery) {
      const store = this.stores.get(type);
      if (store) {
        let memories = store.findAll();
        
        // Filter by conversationId if specified
        if (options?.conversationId) {
          memories = memories.filter(m => m.metadata?.conversationId === options.conversationId);
        }
        
        // Filter by channelSource if specified
        if (options?.channelSource) {
          memories = memories.filter(m => m.metadata?.channelSource === options.channelSource);
        }
        
        allMemories.push(...memories);
      }
    }
    
    // Sort by updatedAt descending
    allMemories.sort((a, b) => b.updatedAt - a.updatedAt);
    
    // Apply limit if specified
    const limitedMemories = options?.limit 
      ? allMemories.slice(0, options.limit)
      : allMemories;
    
    // Return based on format
    if (options?.format === "content") {
      return limitedMemories.map(m => m.content);
    }
    
    return limitedMemories;
  }
}
