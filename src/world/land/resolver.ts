import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import type { ZuckermanConfig } from "@world/config/types.js";

/**
 * Default land directory
 */
export const DEFAULT_LAND_DIR = join(homedir(), ".zuckerman", "land");

/**
 * Resolve land directory for an agent
 */
export function resolveAgentLandDir(
  config: ZuckermanConfig,
  agentId: string,
): string {
  // Check if agent has specific land configured
  const agents = config.agents?.list || [];
  const agent = agents.find((a) => a.id === agentId);

  if (agent?.land) {
    return expandPath(agent.land);
  }

  // Use default land
  const defaultLand = config.agents?.defaults?.land || DEFAULT_LAND_DIR;
  const expandedDefault = expandPath(defaultLand);

  // If it's the default agent, use land as-is
  const defaultAgent = agents.find((a) => a.default) || agents[0];
  if (agentId === defaultAgent?.id) {
    return expandedDefault;
  }

  // Otherwise append agent ID
  return `${expandedDefault}-${agentId}`;
}

/**
 * Expand ~ in paths
 */
function expandPath(path: string): string {
  if (path.startsWith("~")) {
    return path.replace("~", homedir());
  }
  return path;
}

/**
 * Ensure land directory exists
 */
export function ensureLandDir(landDir: string): void {
  if (!existsSync(landDir)) {
    mkdirSync(landDir, { recursive: true });
  }
}
