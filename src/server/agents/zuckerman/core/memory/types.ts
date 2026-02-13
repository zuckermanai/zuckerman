/**
 * Memory types and interfaces
 * Unified memory structure with type field
 */

export type MemoryType = "working" | "episodic" | "semantic" | "procedural" | "prospective" | "emotional";

/**
 * Memory entry - unified structure for all memory types
 */
export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  createdAt: number;
  updatedAt: number;
  conversationId?: string;
}

/**
 * Memory retrieval result
 */
export interface MemoryRetrievalResult {
  memories: Memory[];
  total: number;
}