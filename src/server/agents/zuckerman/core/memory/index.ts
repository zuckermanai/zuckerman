// Core exports
export * from "./config.js"; // Memory search configuration

// Memory Types and Interfaces
export * from "./types.js";

// Memory Stores (Data Storage)
export * from "./stores/working-store.js";
export * from "./stores/episodic-store.js";
export * from "./stores/semantic-store.js";
export * from "./stores/procedural-store.js";
export * from "./stores/prospective-store.js";
export * from "./stores/emotional-store.js";

// Memory Manager (Unified Interface)
export * from "./manager.js"; // Unified Memory Manager

// Memory Remembering (Real-time)
export * from "./memory-classifier.js";

// Services: Encoding, Storage, Retrieval
export * from "./retrieval/encoding/schema.js"; // Database schema
export * from "./retrieval/encoding/chunking.js"; // Text chunking
export * from "./retrieval/encoding/embeddings.js"; // Embedding utilities
export * from "./retrieval/search.js"; // Search interface

// Note: Processing/consolidation logic moved to sleep module
// Note: Memory flush logic moved to sleep module

// Type exports
export type { MemorySearchManager, MemorySearchResult } from "./retrieval/search.js";
export type { MemoryChunk } from "./retrieval/encoding/chunking.js";
export type { ResolvedMemorySearchConfig, MemorySearchConfig } from "./config.js";

// Function exports (matching OpenClaw pattern)
export { getMemorySearchManager } from "./retrieval/search.js";
export { UnifiedMemoryManager } from "./manager.js";
