/**
 * Unified Memory Store
 * Single store class that saves each memory type to its own file
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getAgentMemoryStorePath } from "@server/world/homedir/paths.js";
import type { Memory, MemoryType } from "./types.js";

export interface MemoryStorage {
  memories: Memory[];
}

export class MemoryStore {
  private memories = new Map<string, Memory>();
  private storagePath: string;
  private memoryType: MemoryType;
  private agentId: string;

  constructor(agentId: string, memoryType: MemoryType) {
    this.agentId = agentId;
    this.memoryType = memoryType;
    this.storagePath = getAgentMemoryStorePath(agentId, memoryType);
    this.load();
  }

  /**
   * Insert a new memory
   */
  insert(memory: Omit<Memory, "id" | "type" | "createdAt" | "updatedAt">): string {
    const id = randomUUID();
    const now = Date.now();

    const mem: Memory = {
      id,
      type: this.memoryType,
      createdAt: now,
      updatedAt: now,
      content: memory.content,
      ...(memory.metadata && { metadata: memory.metadata }),
    };

    this.memories.set(id, mem);
    this.save();
    return id;
  }

  /**
   * Find a memory by ID
   */
  find(id: string): Memory | null {
    return this.memories.get(id) ?? null;
  }

  /**
   * Find all memories
   */
  findAll(): Memory[] {
    return Array.from(this.memories.values());
  }

  /**
   * Query memories
   */
  query(options?: {
    types?: MemoryType[];
    limit?: number;
  }): Memory[] {
    let results = Array.from(this.memories.values());

    if (options?.types && options.types.length > 0) {
      results = results.filter(m => options.types!.includes(m.type));
    }

    results.sort((a, b) => b.updatedAt - a.updatedAt);

    if (options?.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Update a memory by ID
   */
  update(id: string, updates: Partial<Omit<Memory, "id" | "createdAt">>): boolean {
    const memory = this.memories.get(id);
    if (!memory) {
      return false;
    }

    const updated: Memory = {
      ...memory,
      ...updates,
      updatedAt: Date.now(),
    };

    this.memories.set(id, updated);
    this.save();
    return true;
  }

  /**
   * Remove a memory by ID
   */
  remove(id: string): boolean {
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

      let cleanedContent = content.trim();
      cleanedContent = cleanedContent.replace(/,(\s*[}\]])/g, "$1");
      
      let data: MemoryStorage;
      try {
        data = JSON.parse(cleanedContent);
      } catch (parseError) {
        console.warn(`[MemoryStore] JSON parse failed, attempting recovery:`, parseError);
        const memoriesMatch = cleanedContent.match(/"memories"\s*:\s*\[([\s\S]*?)\]/);
        if (memoriesMatch) {
          try {
            const memoriesArray = JSON.parse(`[${memoriesMatch[1]}]`);
            data = { memories: memoriesArray };
          } catch {
            console.error(`[MemoryStore] Recovery failed, starting with empty store`);
            return;
          }
        } else {
          console.error(`[MemoryStore] Invalid JSON structure, starting with empty store`);
          return;
        }
      }
      
      if (Array.isArray(data.memories)) {
        for (const memory of data.memories) {
          if (memory && typeof memory === "object" && memory.id && memory.content && memory.type === this.memoryType) {
            this.memories.set(memory.id, memory);
          }
        }
      }
    } catch (error) {
      console.warn(`[MemoryStore] Failed to load memories from ${this.storagePath}:`, error);
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

      const data: MemoryStorage = {
        memories: Array.from(this.memories.values()),
      };

      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`[MemoryStore] Failed to save memories to ${this.storagePath}:`, error);
    }
  }
}
