import { existsSync, appendFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  getAgentConversationTranscriptPath,
  resolveConversationTranscriptPathWithStateDir,
} from "@server/world/homedir/paths.js";
import type { TranscriptEntry, ConversationId } from "./types.js";

/**
 * Resolve transcript file path for a conversation
 */
export function resolveTranscriptPath(
  agentId: string,
  conversationId: ConversationId,
  stateDir?: string,
): string {
  // If stateDir is provided, use it; otherwise use the standard path
  if (stateDir) {
    return resolveConversationTranscriptPathWithStateDir(stateDir, agentId, conversationId);
  }
  return getAgentConversationTranscriptPath(agentId, conversationId);
}

/**
 * Append an entry to the transcript file
 */
export function appendTranscriptEntry(
  transcriptPath: string,
  entry: TranscriptEntry,
): void {
  try {
    mkdirSync(dirname(transcriptPath), { recursive: true });
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(transcriptPath, line, "utf-8");
  } catch (error) {
    console.error(`Failed to append transcript entry to ${transcriptPath}:`, error);
    throw error;
  }
}

/**
 * Load transcript entries from a file
 */
export function loadTranscript(
  transcriptPath: string,
  limit?: number,
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  
  try {
    if (!existsSync(transcriptPath)) {
      return entries;
    }

    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n").filter((line) => line.trim());
    
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        entries.push(entry);
      } catch (error) {
        console.warn(`Failed to parse transcript line: ${line}`, error);
      }
    }

    // Return last N entries if limit specified
    if (limit && limit > 0) {
      return entries.slice(-limit);
    }

    return entries;
  } catch (error) {
    console.error(`Failed to load transcript from ${transcriptPath}:`, error);
    return entries;
  }
}

/**
 * Generate a unique transcript entry ID
 */
function generateTranscriptId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Convert conversation messages to transcript entries
 */
export function messagesToTranscriptEntries(
  messages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestamp: number;
    toolCallId?: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: string;
    }>;
    runId?: string;
  }>,
  parentId?: string,
): TranscriptEntry[] {
  let lastId: string | undefined = parentId;
  return messages.map((msg) => {
    const id = generateTranscriptId();
    const entry: TranscriptEntry = {
      id,
      parentId: lastId,
      role: msg.role === "tool" ? "tool" : msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      toolCallId: msg.toolCallId,
      toolCalls: msg.toolCalls,
      runId: msg.runId,
    };
    lastId = id;
    return entry;
  });
}
