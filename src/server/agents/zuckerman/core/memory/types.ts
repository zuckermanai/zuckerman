/**
 * Memory types and interfaces
 * Unified memory structure with type field
 */

export type MemoryType = "working" | "episodic" | "semantic" | "procedural" | "prospective" | "emotional";

/**
 * Memory metadata - dynamic properties
 */
export interface MemoryMetadata {
  conversationId?: string;
  channelSource?: string;
  [key: string]: unknown;
}

/**
 * Memory entry - unified structure for all memory types
 */
export interface Memory {
  id: string;
  type: MemoryType;
  content: string;
  createdAt: number;
  updatedAt: number;
  metadata?: MemoryMetadata;
}

/**
 * Memory retrieval result
 */
export interface MemoryRetrievalResult {
  memories: Memory[];
  total: number;
}