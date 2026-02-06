/**
 * Working Memory - Active buffer for current task processing
 * In-memory only, cleared after task completion
 */

import { randomUUID } from "node:crypto";
import type { WorkingMemory } from "../../types.js";

export class WorkingMemoryStore {
  private memories = new Map<string, WorkingMemory>();
  private readonly defaultTtl = 60 * 60 * 1000; // 1 hour default TTL

  /**
   * Set working memory for a conversation
   */
  set(conversationId: string, content: string, context?: Record<string, unknown>, ttl?: number): void {
    const expiresAt = Date.now() + (ttl ?? this.defaultTtl);
    
    const memory: WorkingMemory = {
      id: randomUUID(),
      type: "working",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      conversationId,
      content,
      context: context ?? {},
      expiresAt,
    };

    this.memories.set(conversationId, memory);
  }

  /**
   * Get working memory for a conversation
   */
  get(conversationId: string): WorkingMemory | null {
    const memory = this.memories.get(conversationId);
    if (!memory) return null;
    
    // Check if expired
    if (memory.expiresAt && memory.expiresAt < Date.now()) {
      this.memories.delete(conversationId);
      return null;
    }
    
    return memory;
  }

  /**
   * Update working memory content
   */
  update(conversationId: string, updates: Partial<Pick<WorkingMemory, "content" | "context">>): void {
    const existing = this.memories.get(conversationId);
    if (!existing) return;

    const updated: WorkingMemory = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };

    this.memories.set(conversationId, updated);
  }

  /**
   * Clear working memory for a conversation
   */
  clear(conversationId: string): void {
    this.memories.delete(conversationId);
  }

  /**
   * Clear all expired working memories
   */
  clearExpired(): void {
    const now = Date.now();
    for (const [conversationId, memory] of this.memories.entries()) {
      if (memory.expiresAt && memory.expiresAt < now) {
        this.memories.delete(conversationId);
      }
    }
  }

  /**
   * Clear all working memories
   */
  clearAll(): void {
    this.memories.clear();
  }

  /**
   * Get all active working memories
   */
  getAll(): WorkingMemory[] {
    const now = Date.now();
    const values: WorkingMemory[] = [];
    for (const memory of this.memories.values()) {
      values.push(memory);
    }
    return values.filter((m) => !m.expiresAt || m.expiresAt >= now);
  }
}
