/**
 * Procedural Memory - Skills, habits, patterns
 * Stores automatic behaviors and workflows
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getAgentMemoryStorePath } from "@server/world/homedir/paths.js";
import type { ProceduralMemory } from "../../types.js";

export interface ProceduralMemoryStorage {
  memories: ProceduralMemory[];
}

export class ProceduralMemoryStore {
  private memories = new Map<string, ProceduralMemory>();
  private storagePath: string;

  constructor(agentId: string) {
    this.storagePath = getAgentMemoryStorePath(agentId, "procedural");
    this.load();
  }

  /**
   * Add procedural memory
   */
  add(memory: Omit<ProceduralMemory, "id" | "type" | "createdAt" | "updatedAt">): string {
    const id = randomUUID();
    const now = Date.now();
    
    const proceduralMemory: ProceduralMemory = {
      id,
      type: "procedural",
      createdAt: now,
      updatedAt: now,
      successRate: 0.5, // Default to neutral
      useCount: 0,
      ...memory,
    };

    this.memories.set(id, proceduralMemory);
    this.save();
    return id;
  }

  /**
   * Get procedural memory by ID
   */
  get(id: string): ProceduralMemory | null {
    return this.memories.get(id) ?? null;
  }

  /**
   * Find procedural memories that match a trigger
   */
  findMatching(trigger: string): ProceduralMemory[] {
    const results: ProceduralMemory[] = [];

    const memories: ProceduralMemory[] = [];
    for (const memory of this.memories.values()) {
      memories.push(memory);
    }

    for (const memory of memories) {
      if (typeof memory.trigger === "string") {
        if (trigger.includes(memory.trigger) || memory.trigger.includes(trigger)) {
          results.push(memory);
        }
      } else if (memory.trigger instanceof RegExp) {
        if (memory.trigger.test(trigger)) {
          results.push(memory);
        }
      }
    }

    // Sort by success rate (highest first), then by use count
    results.sort((a, b) => {
      const rateDiff = (b.successRate ?? 0) - (a.successRate ?? 0);
      if (rateDiff !== 0) return rateDiff;
      return (b.useCount ?? 0) - (a.useCount ?? 0);
    });

    return results;
  }

  /**
   * Update procedural memory after use
   */
  recordUse(id: string, success: boolean): void {
    const memory = this.memories.get(id);
    if (!memory) return;

    const useCount = (memory.useCount ?? 0) + 1;
    const currentRate = memory.successRate ?? 0.5;
    
    // Update success rate using exponential moving average
    const newRate = success
      ? currentRate + (1 - currentRate) * 0.1
      : currentRate * 0.9;

    memory.useCount = useCount;
    memory.successRate = Math.max(0, Math.min(1, newRate));
    memory.lastUsed = Date.now();
    memory.updatedAt = Date.now();
    this.save();
  }

  /**
   * Get all procedural memories
   */
  getAll(): ProceduralMemory[] {
    const memories: ProceduralMemory[] = [];
    for (const memory of this.memories.values()) {
      memories.push(memory);
    }
    return memories;
  }

  /**
   * Get top procedural memories by success rate
   */
  getTop(limit: number = 10): ProceduralMemory[] {
    const memories: ProceduralMemory[] = [];
    for (const memory of this.memories.values()) {
      memories.push(memory);
    }
    return memories
      .sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0))
      .slice(0, limit);
  }

  /**
   * Remove procedural memory
   */
  remove(id: string): void {
    this.memories.delete(id);
    this.save();
  }

  /**
   * Load from storage
   */
  private load(): void {
    if (!existsSync(this.storagePath)) {
      return;
    }

    try {
      const content = readFileSync(this.storagePath, "utf-8");
      const data: ProceduralMemoryStorage = JSON.parse(content);
      
      if (data.memories) {
        for (const memory of data.memories) {
        // Restore RegExp if it was stored as string
        if (typeof memory.trigger === "string" && memory.trigger.startsWith("/")) {
          try {
            const match = memory.trigger.match(/^\/(.*)\/([gimuy]*)$/);
            if (match) {
              memory.trigger = new RegExp(match[1], match[2]);
            }
          } catch {
            // Keep as string if RegExp parsing fails
          }
        }
        
          this.memories.set(memory.id, memory);
        }
      }
      } catch (error) {
      console.warn(`Failed to load procedural memory from ${this.storagePath}:`, error);
    }
  }

  /**
   * Save to storage
   */
  private save(): void {
    try {
      const dir = dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Convert RegExp to string for storage
      const memoryValues: ProceduralMemory[] = [];
      for (const memory of this.memories.values()) {
        memoryValues.push(memory);
      }
      const memories = memoryValues.map((m) => ({
        ...m,
        trigger: m.trigger instanceof RegExp ? m.trigger.toString() : m.trigger,
      }));

      const data: ProceduralMemoryStorage = {
        memories,
      };

      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save procedural memory to ${this.storagePath}:`, error);
    }
  }
}
