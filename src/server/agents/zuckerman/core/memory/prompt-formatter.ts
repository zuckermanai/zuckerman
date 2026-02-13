import type { Memory, MemoryRetrievalResult } from "./types.js";

/**
 * Format a single memory into text representation for prompts
 */
function formatMemory(mem: Memory): string {
  return `[${mem.type}] ${mem.content}`;
}

/**
 * Format memory retrieval results as text for LLM prompts
 */
export function formatMemoriesForPrompt(memoryResult: MemoryRetrievalResult): string {
  if (memoryResult.memories.length === 0) {
    return "";
  }

  const memoryParts = memoryResult.memories.map(formatMemory);
  return `\n\n## Relevant Memories\n${memoryParts.join("\n")}`;
}
