import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  getAgentConversationStorePath,
  resolveConversationStorePathWithStateDir,
} from "@server/world/homedir/paths.js";
import type { ConversationEntry, ConversationKey } from "./types.js";

const DEFAULT_CONVERSATION_STORE_TTL_MS = 45_000; // 45 seconds

type ConversationStoreCacheEntry = {
  store: Record<ConversationKey, ConversationEntry>;
  loadedAt: number;
  storePath: string;
  mtimeMs?: number;
};

const CONVERSATION_STORE_CACHE = new Map<string, ConversationStoreCacheEntry>();

function isConversationStoreRecord(value: unknown): value is Record<ConversationKey, ConversationEntry> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isConversationStoreCacheValid(entry: ConversationStoreCacheEntry): boolean {
  const now = Date.now();
  return now - entry.loadedAt <= DEFAULT_CONVERSATION_STORE_TTL_MS;
}

function invalidateConversationStoreCache(storePath: string): void {
  CONVERSATION_STORE_CACHE.delete(storePath);
}

import { statSync } from "node:fs";

function getFileMtimeMs(filePath: string): number | undefined {
  try {
    if (!existsSync(filePath)) return undefined;
    const stats = statSync(filePath);
    return stats.mtimeMs;
  } catch {
    return undefined;
  }
}

/**
 * Resolve conversation store path for an agent
 */
export function resolveConversationStorePath(agentId: string, stateDir?: string): string {
  // If stateDir is provided, use it; otherwise use the standard path
  if (stateDir) {
    return resolveConversationStorePathWithStateDir(stateDir, agentId);
  }
  return getAgentConversationStorePath(agentId);
}

/**
 * Load conversation store from disk with caching
 */
export function loadConversationStore(
  storePath: string,
  opts: { skipCache?: boolean } = {},
): Record<ConversationKey, ConversationEntry> {
  // Check cache first
  if (!opts.skipCache) {
    const cached = CONVERSATION_STORE_CACHE.get(storePath);
    if (cached && isConversationStoreCacheValid(cached)) {
      const currentMtimeMs = getFileMtimeMs(storePath);
      if (currentMtimeMs === cached.mtimeMs) {
        // Return a deep copy to prevent external mutations
        return structuredClone(cached.store);
      }
      invalidateConversationStoreCache(storePath);
    }
  }

  // Cache miss or disabled - load from disk
  let store: Record<ConversationKey, ConversationEntry> = {};
  let mtimeMs = getFileMtimeMs(storePath);
  
  try {
    if (existsSync(storePath)) {
      const raw = readFileSync(storePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (isConversationStoreRecord(parsed)) {
        store = parsed as Record<ConversationKey, ConversationEntry>;
      }
      mtimeMs = getFileMtimeMs(storePath) ?? mtimeMs;
    }
  } catch (error) {
    // ignore missing/invalid store; we'll recreate it
    console.warn(`Failed to load conversation store from ${storePath}:`, error);
  }

  // Cache the result
  if (!opts.skipCache) {
    CONVERSATION_STORE_CACHE.set(storePath, {
      store: structuredClone(store),
      loadedAt: Date.now(),
      storePath,
      mtimeMs,
    });
  }

  return structuredClone(store);
}

/**
 * Save conversation store to disk
 */
export async function saveConversationStore(
  storePath: string,
  store: Record<ConversationKey, ConversationEntry>,
): Promise<void> {
  // Invalidate cache on write
  invalidateConversationStoreCache(storePath);

  try {
    await mkdirSync(dirname(storePath), { recursive: true });
    const json = JSON.stringify(store, null, 2);
    
    // Use writeFileSync for atomic writes (on non-Windows)
    // On Windows, we rely on the lock mechanism in ConversationManager
    writeFileSync(storePath, json, "utf-8");
  } catch (error) {
    console.error(`Failed to save conversation store to ${storePath}:`, error);
    throw error;
  }
}

/**
 * Clear conversation store cache (for testing)
 */
export function clearConversationStoreCache(): void {
  CONVERSATION_STORE_CACHE.clear();
}
