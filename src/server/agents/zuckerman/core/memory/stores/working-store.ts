/**
 * Working Memory - Active buffer for current task processing
 * Persisted to file for recovery
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getAgentMemoryStorePath } from "@server/world/homedir/paths.js";

interface WorkingMemoryItem {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

interface WorkingMemoryStorage {
  memories: WorkingMemoryItem[];
}

export class WorkingMemoryStore {
  private memories = new Map<string, WorkingMemoryItem>();
  private readonly defaultTtl = 60 * 60 * 1000; // 1 hour default TTL
  private storagePath: string;

  constructor(agentId: string) {
    this.storagePath = getAgentMemoryStorePath(agentId, "working");
    this.load();
  }

  private load(): void {
    if (!this.storagePath || !existsSync(this.storagePath)) return;

    try {
      const raw = readFileSync(this.storagePath, "utf-8");
      const data = JSON.parse(raw) as WorkingMemoryStorage;
      
      if (Array.isArray(data.memories)) {
        const now = Date.now();
        for (const memory of data.memories) {
          if (memory && typeof memory === "object" && memory.id && memory.content) {
            // Only load non-expired memories
            if (!memory.expiresAt || memory.expiresAt >= now) {
              this.memories.set(memory.id, memory);
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to load working memory from ${this.storagePath}:`, error);
    }
  }

  private save(): void {
    if (!this.storagePath) return;

    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data: WorkingMemoryStorage = {
        memories: Array.from(this.memories.values()),
      };

      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.warn(`Failed to save working memory to ${this.storagePath}:`, error);
    }
  }

  /**
   * Set working memory - replaces all existing memories with new array
   */
  set(content: string, ttl?: number): void {
    // Parse content if it's a JSON array string, otherwise treat as single item
    let items: string[] = [];
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        items = parsed;
      } else {
        items = [content];
      }
    } catch {
      items = [content];
    }

    // Clear existing memories
    this.memories.clear();

    // Add new memories
    const expiresAt = Date.now() + (ttl ?? this.defaultTtl);
    const now = Date.now();
    
    for (const itemContent of items) {
      const id = randomUUID();
      this.memories.set(id, {
        id,
        content: itemContent,
        createdAt: now,
        updatedAt: now,
        expiresAt,
      });
    }

    this.save();
  }

  /**
   * Get all working memory items as array of strings
   */
  getAllItems(): string[] {
    const now = Date.now();
    const validMemories: string[] = [];
    const expiredIds: string[] = [];
    
    for (const memory of this.memories.values()) {
      if (!memory.expiresAt || memory.expiresAt >= now) {
        validMemories.push(memory.content);
      } else {
        expiredIds.push(memory.id);
      }
    }
    
    // Remove expired memories
    for (const id of expiredIds) {
      this.memories.delete(id);
    }
    
    if (expiredIds.length > 0) {
      this.save();
    }
    
    return validMemories;
  }

  /**
   * Get all working memory items as objects
   */
  getAll(): WorkingMemoryItem[] {
    const now = Date.now();
    const validMemories: WorkingMemoryItem[] = [];
    const expiredIds: string[] = [];
    
    for (const memory of this.memories.values()) {
      if (!memory.expiresAt || memory.expiresAt >= now) {
        validMemories.push(memory);
      } else {
        expiredIds.push(memory.id);
      }
    }
    
    // Remove expired memories
    for (const id of expiredIds) {
      this.memories.delete(id);
    }
    
    if (expiredIds.length > 0) {
      this.save();
    }
    
    return validMemories;
  }

  /**
   * Add a single memory item
   */
  add(content: string, ttl?: number): string {
    const expiresAt = Date.now() + (ttl ?? this.defaultTtl);
    const id = randomUUID();
    const now = Date.now();
    
    this.memories.set(id, {
      id,
      content,
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });
    
    this.save();
    return id;
  }

  /**
   * Update a memory item
   */
  update(id: string, updates: Partial<Pick<WorkingMemoryItem, "content">>): boolean {
    const memory = this.memories.get(id);
    if (!memory) {
      return false;
    }

    const updated: WorkingMemoryItem = {
      ...memory,
      ...updates,
      updatedAt: Date.now(),
    };

    this.memories.set(id, updated);
    this.save();
    return true;
  }

  /**
   * Delete a memory item
   */
  delete(id: string): boolean {
    const deleted = this.memories.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  /**
   * Clear all working memory
   */
  clear(): void {
    this.memories.clear();
    this.save();
  }
}
