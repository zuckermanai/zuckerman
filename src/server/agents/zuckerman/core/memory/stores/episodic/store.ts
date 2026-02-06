/**
 * Episodic Memory - Specific events and experiences
 * Stored in database/file system with structured queries
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { getAgentMemoryStorePath } from "@server/world/homedir/paths.js";
import type { EpisodicMemory, EmotionalTag } from "../../types.js";

export interface EpisodicMemoryStorage {
  memories: EpisodicMemory[];
}

export class EpisodicMemoryStore {
  private memories = new Map<string, EpisodicMemory>();
  private storagePath: string;

  constructor(agentId: string) {
    this.storagePath = getAgentMemoryStorePath(agentId, "episodic");
    this.load();
  }

  /**
   * Add episodic memory
   */
  add(memory: Omit<EpisodicMemory, "id" | "type" | "createdAt" | "updatedAt">): string {
    const id = randomUUID();
    const now = Date.now();
    
    const episodicMemory: EpisodicMemory = {
      id,
      type: "episodic",
      createdAt: now,
      updatedAt: now,
      ...memory,
    };

    this.memories.set(id, episodicMemory);
    this.save();
    return id;
  }

  /**
   * Get episodic memory by ID
   */
  get(id: string): EpisodicMemory | null {
    return this.memories.get(id) ?? null;
  }

  /**
   * Get episodic memories with filters
   */
  query(options: {
    conversationId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    query?: string; // Text search in event/context
  }): EpisodicMemory[] {
    const memoryValues: EpisodicMemory[] = [];
    for (const memory of this.memories.values()) {
      memoryValues.push(memory);
    }
    let results = memoryValues;

    // Filter by conversation
    if (options.conversationId) {
      results = results.filter((m) => m.conversationId === options.conversationId);
    }

    // Filter by time range
    if (options.startTime) {
      results = results.filter((m) => m.timestamp >= options.startTime!);
    }
    if (options.endTime) {
      results = results.filter((m) => m.timestamp <= options.endTime!);
    }

    // Text search
    if (options.query) {
      const queryLower = options.query.toLowerCase();
      results = results.filter((m) => {
        const eventMatch = m.event.toLowerCase().includes(queryLower);
        const whatMatch = m.context.what.toLowerCase().includes(queryLower);
        const whyMatch = m.context.why?.toLowerCase().includes(queryLower);
        return eventMatch || whatMatch || whyMatch;
      });
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp);

    // Limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Add emotional tag to episodic memory
   */
  addEmotionalTag(id: string, tag: EmotionalTag): void {
    const memory = this.memories.get(id);
    if (!memory) return;

    memory.emotionalTag = tag;
    memory.updatedAt = Date.now();
    this.save();
  }

  /**
   * Link related memories
   */
  linkMemories(id1: string, id2: string): void {
    const mem1 = this.memories.get(id1);
    const mem2 = this.memories.get(id2);
    if (!mem1 || !mem2) return;

    if (!mem1.relatedMemories) mem1.relatedMemories = [];
    if (!mem2.relatedMemories) mem2.relatedMemories = [];

    if (!mem1.relatedMemories.includes(id2)) mem1.relatedMemories.push(id2);
    if (!mem2.relatedMemories.includes(id1)) mem2.relatedMemories.push(id1);

    mem1.updatedAt = Date.now();
    mem2.updatedAt = Date.now();
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
      const data: EpisodicMemoryStorage = JSON.parse(content);
      
      if (data.memories) {
        for (const memory of data.memories) {
          this.memories.set(memory.id, memory);
        }
      }
    } catch (error) {
      console.warn(`Failed to load episodic memory from ${this.storagePath}:`, error);
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

      const memoryValues: EpisodicMemory[] = [];
      for (const memory of this.memories.values()) {
        memoryValues.push(memory);
      }
      const data: EpisodicMemoryStorage = {
        memories: memoryValues,
      };

      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save episodic memory to ${this.storagePath}:`, error);
    }
  }

  /**
   * Get all memories (for migration/backup)
   */
  getAll(): EpisodicMemory[] {
    const memories: EpisodicMemory[] = [];
    for (const memory of this.memories.values()) {
      memories.push(memory);
    }
    return memories;
  }
}
