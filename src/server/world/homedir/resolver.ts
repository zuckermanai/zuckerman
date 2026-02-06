import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";
import type { ZuckermanConfig } from "@server/world/config/types.js";
import { getAgentWorkspaceDir } from "./paths.js";

/**
 * Default workspace directory for agents
 * @deprecated Use getAgentWorkspaceDir from paths.js instead
 */
export function getDefaultWorkspaceDir(agentId: string): string {
  return getAgentWorkspaceDir(agentId);
}

/**
 * Resolve homedir directory for an agent
 */
export function resolveAgentHomedir(
  config: ZuckermanConfig,
  agentId: string,
): string {
  // Check if agent has specific homedir configured
  const agents = config.agents?.list || [];
  const agent = agents.find((a) => a.id === agentId);

  if (agent?.homedir) {
    return expandPath(agent.homedir);
  }

  // Use default workspace
  const defaultWorkspace = config.agents?.defaults?.homedir || getDefaultWorkspaceDir(agentId);
  const expandedDefault = expandPath(defaultWorkspace);

  // If it's the default agent, use workspace as-is
  const defaultAgent = agents.find((a) => a.default) || agents[0];
  if (agentId === defaultAgent?.id) {
    return expandedDefault;
  }

  // Otherwise use agent-specific workspace
  return getDefaultWorkspaceDir(agentId);
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
 * Ensure homedir directory exists
 */
export function ensureHomedir(homedir: string): void {
  if (!existsSync(homedir)) {
    mkdirSync(homedir, { recursive: true });
  }
}
