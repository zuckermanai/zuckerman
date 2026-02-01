import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AgentRuntime } from "./types.js";
import { SessionManager } from "@agents/zuckerman/sessions/index.js";

/**
 * Detect if we're running from dist/ or src/
 * Returns the base directory (src or dist) and whether we're in production
 */
function detectBaseDir(): { baseDir: string; isProduction: boolean; agentsDir: string } {
  // Check if we're running from dist by looking at the current file's location
  const currentFile = fileURLToPath(import.meta.url);
  const isInDist = currentFile.includes("/dist/");
  
  if (isInDist) {
    // Running from dist - look for dist/agents
    const distAgentsDir = join(process.cwd(), "dist", "agents");
    if (existsSync(distAgentsDir)) {
      return { baseDir: "dist", isProduction: true, agentsDir: distAgentsDir };
    }
  }
  
  // Default to src/agents (for dev mode or if dist doesn't exist)
  return { baseDir: "src", isProduction: false, agentsDir: join(process.cwd(), "src", "agents") };
}

/**
 * Check if a class is a valid AgentRuntime implementation
 */
function isValidRuntimeClass(cls: unknown): cls is new (sessionManager?: SessionManager) => AgentRuntime {
  if (typeof cls !== "function") {
    return false;
  }

  const prototype = cls.prototype;
  if (!prototype) {
    return false;
  }

  // Must have run method (agentId is a class property, not prototype property)
  return typeof prototype.run === "function";
}

/**
 * Agent runtime factory - creates and manages agent runtime instances
 * Discovers agents dynamically from src/agents/ directory
 */
export class AgentRuntimeFactory {
  private runtimes = new Map<string, AgentRuntime>();
  private sessionManagers = new Map<string, SessionManager>();
  private discoveredAgents: string[] | null = null;

  constructor() {
    // Session managers are created per-agent now
  }

  /**
   * Get or create session manager for an agent
   */
  getSessionManager(agentId: string): SessionManager {
    let manager = this.sessionManagers.get(agentId);
    if (!manager) {
      manager = new SessionManager(agentId);
      this.sessionManagers.set(agentId, manager);
    }
    return manager;
  }

  /**
   * Discover available agents by scanning agents/ directory
   */
  private async discoverAgents(): Promise<string[]> {
    if (this.discoveredAgents) {
      return this.discoveredAgents;
    }

    const agents: string[] = [];
    const { agentsDir, isProduction } = detectBaseDir();

    try {
      if (!existsSync(agentsDir)) {
        this.discoveredAgents = [];
        return [];
      }

      const entries = await readdir(agentsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const agentId = entry.name;
        // Check for runtime.js in dist, runtime.ts in src
        const runtimePath = join(agentsDir, agentId, isProduction ? "runtime.js" : "runtime.ts");
        
        if (existsSync(runtimePath)) {
          agents.push(agentId);
        }
      }
    } catch (err) {
      console.warn(`Failed to discover agents:`, err);
    }

    this.discoveredAgents = agents;
    return agents;
  }

  /**
   * Get or create an agent runtime
   */
  async getRuntime(agentId: string): Promise<AgentRuntime | null> {
    // Check cache
    const cached = this.runtimes.get(agentId);
    if (cached) {
      return cached;
    }

    // Load runtime dynamically
    const runtime = await this.createRuntime(agentId);
    if (runtime) {
      this.runtimes.set(agentId, runtime);
    }

    return runtime;
  }

  /**
   * Create a new runtime instance for an agent by dynamically importing it
   */
  private async createRuntime(agentId: string): Promise<AgentRuntime | null> {
    try {
      const { agentsDir, isProduction } = detectBaseDir();
      
      // In production, use .js; in dev mode (tsx), use .ts
      const runtimeExtension = isProduction ? "js" : "ts";
      const runtimePath = join(agentsDir, agentId, `runtime.${runtimeExtension}`);
      
      if (!existsSync(runtimePath)) {
        return null;
      }

      // Dynamic import - world doesn't know about specific agents
      // Convention: each agent exports a runtime class from runtime.ts
      let module: any;
      
      if (isProduction) {
        // In production, use file:// URL for .js files
        const runtimeUrl = pathToFileURL(runtimePath).href;
        module = await import(runtimeUrl);
      } else {
        // In dev mode with tsx, use the @agents path alias which tsx can resolve
        // This works because tsx understands TypeScript path mappings
        try {
          // Try using path alias first (works with tsx)
          const aliasPath = `@agents/${agentId}/runtime.js`;
          module = await import(aliasPath);
        } catch {
          // Fallback to file:// URL if alias doesn't work
          const runtimeUrl = pathToFileURL(runtimePath).href;
          module = await import(runtimeUrl);
        }
      }
      
      // Look for exported runtime class
      // Convention: {AgentId}Runtime (e.g., ZuckermanRuntime) or {AgentId}Awareness (e.g., ZuckermanAwareness) or default export
      const capitalizedName = agentId.charAt(0).toUpperCase() + agentId.slice(1);
      const RuntimeClass = module[`${capitalizedName}Runtime`] || module[`${capitalizedName}Awareness`] || module.default;

      if (!RuntimeClass || !isValidRuntimeClass(RuntimeClass)) {
        console.warn(
          `Agent "${agentId}" runtime.${runtimeExtension} must export a class named "${capitalizedName}Runtime" or "${capitalizedName}Awareness" or default export that implements AgentRuntime. Found exports: ${Object.keys(module).join(", ")}`,
        );
        return null;
      }

      const sessionManager = this.getSessionManager(agentId);
      return new RuntimeClass(sessionManager);
    } catch (err) {
      const errorDetails = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.warn(`Failed to load runtime for agent "${agentId}": ${errorDetails}${stack ? `\n${stack}` : ""}`);
      return null;
    }
  }

  /**
   * Clear runtime cache (for hot reload)
   */
  clearCache(agentId?: string): void {
    if (agentId) {
      const runtime = this.runtimes.get(agentId);
      if (runtime?.clearCache) {
        runtime.clearCache();
      }
      this.runtimes.delete(agentId);
    } else {
      for (const runtime of this.runtimes.values()) {
        if (runtime.clearCache) {
          runtime.clearCache();
        }
      }
      this.runtimes.clear();
      this.discoveredAgents = null; // Reset discovery cache
    }
  }

  /**
   * List available agent IDs by discovering them dynamically
   */
  async listAgents(): Promise<string[]> {
    return this.discoverAgents();
  }
}
