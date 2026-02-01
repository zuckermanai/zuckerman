import { join, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { cwd } from "node:process";

/**
 * Agent metadata - information about an agent that can be discovered
 */
export interface AgentMetadata {
  /**
   * Agent identifier
   */
  agentId: string;
  
  /**
   * Agent directory path (where prompts, configs, etc. are located)
   */
  agentDir: string;
  
  /**
   * Agent display name
   */
  name?: string;
  
  /**
   * Agent description
   */
  description?: string;
  
  /**
   * Agent version
   */
  version?: string;
}

/**
 * Find project root by looking for root markers
 */
function findProjectRoot(): string {
  // Start from current working directory and walk up
  let dir = cwd();
  while (dir !== dirname(dir)) {
    // Check for root markers first (these are only at project root)
    if (existsSync(join(dir, "pnpm-workspace.yaml")) || existsSync(join(dir, "turbo.json"))) {
      return dir;
    }
    
    // Check package.json name - root has "zuckerman", not "@zuckerman/app"
    const packageJsonPath = join(dir, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const content = readFileSync(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        // Root package.json has name "zuckerman" (not scoped like "@zuckerman/app")
        if (pkg.name === "zuckerman") {
          return dir;
        }
      } catch {
        // If we can't parse it, continue searching
      }
    }
    dir = dirname(dir);
  }
  
  // Last resort: use cwd
  return cwd();
}

/**
 * Resolve agent directory path for an agent ID
 */
function resolveAgentDir(agentId: string): string {
  const projectRoot = findProjectRoot();
  return join(projectRoot, "src", "server", "agents", agentId);
}

/**
 * Agent discovery service
 * Agents register themselves here with their metadata
 */
class AgentDiscoveryService {
  private agents = new Map<string, AgentMetadata>();

  /**
   * Register an agent with its metadata
   * If agentDir is not provided, it will be resolved automatically
   */
  register(metadata: Omit<AgentMetadata, "agentDir"> & { agentDir?: string }): void {
    const agentDir = metadata.agentDir || resolveAgentDir(metadata.agentId);
    this.agents.set(metadata.agentId, {
      ...metadata,
      agentDir,
    });
  }

  /**
   * Get metadata for an agent
   */
  getMetadata(agentId: string): AgentMetadata | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all registered agent IDs
   */
  getAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Get all agent metadata
   */
  getAllMetadata(): AgentMetadata[] {
    return Array.from(this.agents.values());
  }
}

/**
 * Singleton instance
 */
export const agentDiscovery = new AgentDiscoveryService();
