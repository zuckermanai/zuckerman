import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
const REGISTRY_PATH = join(process.cwd(), ".zuckerman", "sandbox-registry.json");
let registryCache = null;
/**
 * Load registry from disk
 */
export async function loadRegistry() {
    if (registryCache) {
        return registryCache;
    }
    if (!existsSync(REGISTRY_PATH)) {
        registryCache = { entries: [] };
        return registryCache;
    }
    try {
        const content = await readFile(REGISTRY_PATH, "utf-8");
        registryCache = JSON.parse(content);
        return registryCache;
    }
    catch {
        registryCache = { entries: [] };
        return registryCache;
    }
}
/**
 * Save registry to disk
 */
export async function saveRegistry(registry) {
    registryCache = registry;
    const { mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(REGISTRY_PATH), { recursive: true });
    await writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf-8");
}
/**
 * Get registry entry for container
 */
export async function getRegistryEntry(containerName) {
    const registry = await loadRegistry();
    return registry.entries.find((e) => e.containerName === containerName);
}
/**
 * Update registry entry
 */
export async function updateRegistryEntry(entry) {
    const registry = await loadRegistry();
    const index = registry.entries.findIndex((e) => e.containerName === entry.containerName);
    if (index >= 0) {
        registry.entries[index] = entry;
    }
    else {
        registry.entries.push(entry);
    }
    await saveRegistry(registry);
}
/**
 * Remove registry entry
 */
export async function removeRegistryEntry(containerName) {
    const registry = await loadRegistry();
    registry.entries = registry.entries.filter((e) => e.containerName !== containerName);
    await saveRegistry(registry);
}
/**
 * Get all containers for a scope
 */
export async function getContainersForScope(scopeKey) {
    const registry = await loadRegistry();
    return registry.entries.filter((e) => e.scopeKey === scopeKey);
}
//# sourceMappingURL=registry.js.map