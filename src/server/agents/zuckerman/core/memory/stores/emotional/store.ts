/**
 * Emotional Memory - Emotion-tagged experiences
 * Stores emotional associations with other memories
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getAgentMemoryStorePath } from "@server/world/homedir/paths.js";
import type { EmotionalMemory, EmotionType, EmotionIntensity } from "../../types.js";

export interface EmotionalMemoryStorage {
  memories: EmotionalMemory[];
}

export class EmotionalMemoryStore {
  private memories = new Map<string, EmotionalMemory>();
  private storagePath: string;

  constructor(agentId: string) {
    this.storagePath = getAgentMemoryStorePath(agentId, "emotional");
    this.load();
  }

  /**
   * Add emotional memory
   */
  add(memory: Omit<EmotionalMemory, "id" | "type" | "createdAt" | "updatedAt">): string {
    const id = randomUUID();
    const now = Date.now();
    
    const emotionalMemory: EmotionalMemory = {
      id,
      type: "emotional",
      createdAt: now,
      updatedAt: now,
      ...memory,
    };

    this.memories.set(id, emotionalMemory);
    this.save();
    return id;
  }

  /**
   * Get emotional memory by ID
   */
  get(id: string): EmotionalMemory | null {
    return this.memories.get(id) ?? null;
  }

  /**
   * Get emotional memories for a target memory
   */
  getByTarget(targetMemoryId: string): EmotionalMemory[] {
    const memories: EmotionalMemory[] = [];
    for (const memory of this.memories.values()) {
      memories.push(memory);
    }
    return memories.filter((m) => m.targetMemoryId === targetMemoryId);
  }

  /**
   * Get emotional memories by emotion type
   */
  getByEmotion(emotion: EmotionType): EmotionalMemory[] {
    const memories: EmotionalMemory[] = [];
    for (const memory of this.memories.values()) {
      memories.push(memory);
    }
    return memories.filter((m) => m.tag.emotion === emotion);
  }

  /**
   * Get emotional memories with filters
   */
  query(options: {
    targetMemoryId?: string;
    emotion?: EmotionType;
    minIntensity?: EmotionIntensity;
    conversationId?: string;
  }): EmotionalMemory[] {
    const memoryValues: EmotionalMemory[] = [];
    for (const memory of this.memories.values()) {
      memoryValues.push(memory);
    }
    let results = memoryValues;

    if (options.targetMemoryId) {
      results = results.filter((m) => m.targetMemoryId === options.targetMemoryId);
    }

    if (options.emotion) {
      results = results.filter((m) => m.tag.emotion === options.emotion);
    }

    if (options.minIntensity) {
      const intensityOrder: EmotionIntensity[] = ["low", "medium", "high"];
      const minLevel = intensityOrder.indexOf(options.minIntensity);
      results = results.filter((m) => {
        const level = intensityOrder.indexOf(m.tag.intensity);
        return level >= minLevel;
      });
    }

    if (options.conversationId) {
      results = results.filter((m) => m.conversationId === options.conversationId);
    }

    // Sort by intensity (highest first), then by timestamp (newest first)
    const intensityOrder: EmotionIntensity[] = ["low", "medium", "high"];
    results.sort((a, b) => {
      const intensityDiff = intensityOrder.indexOf(b.tag.intensity) - intensityOrder.indexOf(a.tag.intensity);
      if (intensityDiff !== 0) return intensityDiff;
      return b.tag.timestamp - a.tag.timestamp;
    });

    return results;
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
      const data: EmotionalMemoryStorage = JSON.parse(content);
      
      if (data.memories) {
        for (const memory of data.memories) {
          this.memories.set(memory.id, memory);
        }
      }
    } catch (error) {
      console.warn(`Failed to load emotional memory from ${this.storagePath}:`, error);
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

      const memoryValues: EmotionalMemory[] = [];
      for (const memory of this.memories.values()) {
        memoryValues.push(memory);
      }
      const data: EmotionalMemoryStorage = {
        memories: memoryValues,
      };

      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
      console.error(`Failed to save emotional memory to ${this.storagePath}:`, error);
    }
  }

  /**
   * Get all memories
   */
  getAll(): EmotionalMemory[] {
    const memories: EmotionalMemory[] = [];
    for (const memory of this.memories.values()) {
      memories.push(memory);
    }
    return memories;
  }
}
