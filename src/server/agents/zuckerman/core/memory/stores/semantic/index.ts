/**
 * Semantic Memory - Facts and knowledge
 * Stored in JSON file for easy parsing and retrieval
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getAgentMemoryStorePath } from "@server/world/homedir/paths.js";
import type { SemanticMemory } from "../../types.js";

export interface SemanticMemoryStorage {
  memories: SemanticMemory[];
}

export class SemanticMemoryStore {
  private memories = new Map<string, SemanticMemory>();
  private storagePath: string;

  constructor(agentId: string) {
    this.storagePath = getAgentMemoryStorePath(agentId, "semantic");
    this.load();
  }

  /**
   * Add semantic memory
   */
  add(memory: Omit<SemanticMemory, "id" | "type" | "createdAt" | "updatedAt">): string {
    const id = randomUUID();
    const now = Date.now();

    console.log("adding semantic memory", memory);
    
    const semanticMemory: SemanticMemory = {
      id,
      type: "semantic",
      createdAt: now,
      updatedAt: now,
      ...memory,
    };

    this.memories.set(id, semanticMemory);
    this.save();
    return id;
  }

  /**
   * Get semantic memory by ID
   */
  get(id: string): SemanticMemory | null {
    return this.memories.get(id) ?? null;
  }

  /**
   * Get all semantic memories
   */
  getAll(): SemanticMemory[] {
    return Array.from(this.memories.values());
  }

  /**
   * Query semantic memories
   */
  query(options?: {
    conversationId?: string;
    category?: string;
    query?: string;
    limit?: number;
  }): SemanticMemory[] {
    let results = Array.from(this.memories.values());

    // Filter by conversation ID
    if (options?.conversationId) {
      results = results.filter(m => m.conversationId === options.conversationId);
    }

    // Filter by category
    if (options?.category) {
      results = results.filter(m => m.category === options.category);
    }

    // Filter by query (search in fact text)
    if (options?.query) {
      const queryLower = options.query.toLowerCase();
      results = results.filter(m => 
        m.fact.toLowerCase().includes(queryLower) ||
        m.category?.toLowerCase().includes(queryLower)
      );
    }

    // Sort by recency (newest first)
    results.sort((a, b) => b.updatedAt - a.updatedAt);

    // Apply limit
    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Update semantic memory
   */
  update(id: string, updates: Partial<Omit<SemanticMemory, "id" | "type" | "createdAt">>): boolean {
    const memory = this.memories.get(id);
    if (!memory) {
      return false;
    }

    const updated: SemanticMemory = {
      ...memory,
      ...updates,
      updatedAt: Date.now(),
    };

    this.memories.set(id, updated);
    this.save();
    return true;
  }

  /**
   * Delete semantic memory
   */
  delete(id: string): boolean {
    const deleted = this.memories.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  /**
   * Load memories from file
   */
  private load(): void {
    if (!existsSync(this.storagePath)) {
      // Create directory if it doesn't exist
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      return;
    }

    try {
      const content = readFileSync(this.storagePath, "utf-8");
      if (!content.trim()) {
        return;
      }

      const data: SemanticMemoryStorage = JSON.parse(content);
      
      // Validate and load memories
      if (Array.isArray(data.memories)) {
        for (const memory of data.memories) {
          if (memory.id && memory.type === "semantic") {
            this.memories.set(memory.id, memory);
          }
        }
      }
    } catch (error) {
      console.warn(`[SemanticMemoryStore] Failed to load memories from ${this.storagePath}:`, error);
    }
  }

  /**
   * Save memories to file
   */
  private save(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data: SemanticMemoryStorage = {
        memories: Array.from(this.memories.values()),
      };

      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`[SemanticMemoryStore] Failed to save memories to ${this.storagePath}:`, error);
    }
  }
}
