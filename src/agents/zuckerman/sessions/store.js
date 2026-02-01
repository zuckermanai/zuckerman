import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
const DEFAULT_SESSION_STORE_TTL_MS = 45_000; // 45 seconds
const SESSION_STORE_CACHE = new Map();
function isSessionStoreRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
function isSessionStoreCacheValid(entry) {
    const now = Date.now();
    return now - entry.loadedAt <= DEFAULT_SESSION_STORE_TTL_MS;
}
function invalidateSessionStoreCache(storePath) {
    SESSION_STORE_CACHE.delete(storePath);
}
import { statSync } from "node:fs";
function getFileMtimeMs(filePath) {
    try {
        if (!existsSync(filePath))
            return undefined;
        const stats = statSync(filePath);
        return stats.mtimeMs;
    }
    catch {
        return undefined;
    }
}
/**
 * Resolve session store path for an agent
 */
export function resolveSessionStorePath(agentId, stateDir) {
    const baseDir = stateDir || join(homedir(), ".zuckerman");
    return join(baseDir, "agents", agentId, "sessions", "sessions.json");
}
/**
 * Load session store from disk with caching
 */
export function loadSessionStore(storePath, opts = {}) {
    // Check cache first
    if (!opts.skipCache) {
        const cached = SESSION_STORE_CACHE.get(storePath);
        if (cached && isSessionStoreCacheValid(cached)) {
            const currentMtimeMs = getFileMtimeMs(storePath);
            if (currentMtimeMs === cached.mtimeMs) {
                // Return a deep copy to prevent external mutations
                return structuredClone(cached.store);
            }
            invalidateSessionStoreCache(storePath);
        }
    }
    // Cache miss or disabled - load from disk
    let store = {};
    let mtimeMs = getFileMtimeMs(storePath);
    try {
        if (existsSync(storePath)) {
            const raw = readFileSync(storePath, "utf-8");
            const parsed = JSON.parse(raw);
            if (isSessionStoreRecord(parsed)) {
                store = parsed;
            }
            mtimeMs = getFileMtimeMs(storePath) ?? mtimeMs;
        }
    }
    catch (error) {
        // ignore missing/invalid store; we'll recreate it
        console.warn(`Failed to load session store from ${storePath}:`, error);
    }
    // Cache the result
    if (!opts.skipCache) {
        SESSION_STORE_CACHE.set(storePath, {
            store: structuredClone(store),
            loadedAt: Date.now(),
            storePath,
            mtimeMs,
        });
    }
    return structuredClone(store);
}
/**
 * Save session store to disk
 */
export async function saveSessionStore(storePath, store) {
    // Invalidate cache on write
    invalidateSessionStoreCache(storePath);
    try {
        await mkdirSync(dirname(storePath), { recursive: true });
        const json = JSON.stringify(store, null, 2);
        // Use writeFileSync for atomic writes (on non-Windows)
        // On Windows, we rely on the lock mechanism in SessionManager
        writeFileSync(storePath, json, "utf-8");
    }
    catch (error) {
        console.error(`Failed to save session store to ${storePath}:`, error);
        throw error;
    }
}
/**
 * Clear session store cache (for testing)
 */
export function clearSessionStoreCache() {
    SESSION_STORE_CACHE.clear();
}
//# sourceMappingURL=store.js.map