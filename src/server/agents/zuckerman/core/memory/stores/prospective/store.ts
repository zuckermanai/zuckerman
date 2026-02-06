/**
 * Prospective Memory - Future intentions and reminders
 * Stores tasks that need to be triggered later
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getAgentMemoryStorePath } from "@server/world/homedir/paths.js";
import type { ProspectiveMemory } from "../../types.js";

export interface ProspectiveMemoryStorage {
  memories: ProspectiveMemory[];
}

export class ProspectiveMemoryStore {
  private memories = new Map<string, ProspectiveMemory>();
  private storagePath: string;

  constructor(agentId: string) {
    this.storagePath = getAgentMemoryStorePath(agentId, "prospective");
    this.load();
  }

  /**
   * Add prospective memory
   */
  add(memory: Omit<ProspectiveMemory, "id" | "type" | "createdAt" | "updatedAt">): string {
    const id = randomUUID();
    const now = Date.now();
    
    const prospectiveMemory: ProspectiveMemory = {
      ...memory,
      id,
      type: "prospective",
      createdAt: now,
      updatedAt: now,
      status: memory.status ?? "pending",
      priority: memory.priority ?? 0.5,
    };

    this.memories.set(id, prospectiveMemory);
    this.save();
    return id;
  }

  /**
   * Get prospective memory by ID
   */
  get(id: string): ProspectiveMemory | null {
    return this.memories.get(id) ?? null;
  }

  /**
   * Get pending prospective memories that should be triggered
   */
  getDue(): ProspectiveMemory[] {
    const now = Date.now();
    const results: ProspectiveMemory[] = [];

    const memories: ProspectiveMemory[] = [];
    for (const memory of this.memories.values()) {
      memories.push(memory);
    }

    for (const memory of memories) {
      if (memory.status !== "pending") continue;
      
      // Check time-based trigger
      if (memory.triggerTime && memory.triggerTime <= now) {
        results.push(memory);
        continue;
      }
    }

    // Sort by priority (highest first), then by trigger time
    results.sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      
      const timeA = a.triggerTime ?? Infinity;
      const timeB = b.triggerTime ?? Infinity;
      return timeA - timeB;
    });

    return results;
  }

  /**
   * Get prospective memories matching a context trigger
   */
  getByContext(context: string): ProspectiveMemory[] {
    const results: ProspectiveMemory[] = [];

    const memories: ProspectiveMemory[] = [];
    for (const memory of this.memories.values()) {
      memories.push(memory);
    }

    for (const memory of memories) {
      if (memory.status !== "pending") continue;
      if (!memory.triggerContext) continue;
      
      if (context.includes(memory.triggerContext) || memory.triggerContext.includes(context)) {
        results.push(memory);
      }
    }

    // Sort by priority
    results.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return results;
  }

  /**
   * Get all prospective memories with filters
   */
  query(options: {
    conversationId?: string;
    status?: ProspectiveMemory["status"];
    limit?: number;
  }): ProspectiveMemory[] {
    const memoryValues: ProspectiveMemory[] = [];
    for (const memory of this.memories.values()) {
      memoryValues.push(memory);
    }
    let results = memoryValues;

    if (options.conversationId) {
      results = results.filter((m) => m.conversationId === options.conversationId);
    }

    if (options.status) {
      results = results.filter((m) => m.status === options.status);
    }

    // Sort by priority, then by creation time
    results.sort((a, b) => {
      const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt - a.createdAt;
    });

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Mark prospective memory as triggered
   */
  trigger(id: string): void {
    const memory = this.memories.get(id);
    if (!memory) return;

    memory.status = "triggered";
    memory.updatedAt = Date.now();
    this.save();
  }

  /**
   * Mark prospective memory as completed
   */
  complete(id: string): void {
    const memory = this.memories.get(id);
    if (!memory) return;

    memory.status = "completed";
    memory.updatedAt = Date.now();
    this.save();
  }

  /**
   * Cancel prospective memory
   */
  cancel(id: string): void {
    const memory = this.memories.get(id);
    if (!memory) return;

    memory.status = "cancelled";
    memory.updatedAt = Date.now();
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
      const data: ProspectiveMemoryStorage = JSON.parse(content);
      
      if (data.memories) {
        for (const memory of data.memories) {
          this.memories.set(memory.id, memory);
        }
      }
    } catch (error) {
      console.warn(`Failed to load prospective memory from ${this.storagePath}:`, error);
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

      const data: ProspectiveMemoryStorage = {
        memories: Array.from(this.memories.values()),
      };

      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save prospective memory to ${this.storagePath}:`, error);
    }
  }

  /**
   * Get all memories
   */
  getAll(): ProspectiveMemory[] {
    const memories: ProspectiveMemory[] = [];
    for (const memory of this.memories.values()) {
      memories.push(memory);
    }
    return memories;
  }
}
