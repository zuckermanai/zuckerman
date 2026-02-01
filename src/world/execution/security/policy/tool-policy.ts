import type { ToolPolicy } from "../types.js";

/**
 * Tool groups that expand to multiple tools
 */
const TOOL_GROUPS: Record<string, string[]> = {
  "group:runtime": ["terminal", "exec", "process", "bash"],
  "group:fs": ["read", "write", "edit", "apply_patch"],
  "group:sessions": ["sessions_list", "sessions_history", "sessions_send", "sessions_spawn", "session_status"],
  "group:memory": ["memory_search", "memory_get"],
  "group:ui": ["browser", "canvas"],
  "group:automation": ["cron", "gateway"],
  "group:messaging": ["message"],
  "group:device": ["device"],
};

/**
 * Tool profiles that define base allowlists
 */
const TOOL_PROFILES: Record<string, string[]> = {
  minimal: ["session_status"],
  coding: [
    "group:fs",
    "group:runtime",
    "group:sessions",
    "group:memory",
    "image",
  ],
  messaging: [
    "group:messaging",
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "session_status",
  ],
  full: [], // Empty means all tools allowed
};

/**
 * Expand tool groups and profiles to actual tool names
 */
function expandToolList(tools: string[]): string[] {
  const expanded: string[] = [];

  for (const tool of tools) {
    if (tool.startsWith("group:")) {
      const groupTools = TOOL_GROUPS[tool] ?? [];
      expanded.push(...groupTools);
    } else {
      expanded.push(tool);
    }
  }

  return expanded;
}

/**
 * Check if a tool is allowed based on policy
 */
export function isToolAllowed(
  toolName: string,
  policy: ToolPolicy,
): boolean {
  const name = toolName.toLowerCase();

  // Expand profile to tool list
  let allowedTools: string[] = [];
  if (policy.profile && policy.profile !== "full") {
    const profileTools = TOOL_PROFILES[policy.profile] ?? [];
    allowedTools = expandToolList(profileTools);
  }

  // Expand allowlist
  if (policy.allow && policy.allow.length > 0) {
    allowedTools = expandToolList(policy.allow);
  }

  // Expand denylist
  const deniedTools = policy.deny ? expandToolList(policy.deny) : [];

  // Check denylist first (deny always wins)
  for (const denied of deniedTools) {
    if (matchesPattern(name, denied.toLowerCase())) {
      return false;
    }
  }

  // If allowlist exists, only allow listed tools
  if (allowedTools.length > 0) {
    for (const allowed of allowedTools) {
      if (matchesPattern(name, allowed.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  // Default: allow if not explicitly denied (profile "full" or no restrictions)
  return true;
}

function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === "*") {
    return true;
  }

  // Simple wildcard matching
  const regex = new RegExp(
    "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$",
  );
  return regex.test(value);
}

/**
 * Get effective tool list based on policy
 */
export function getEffectiveToolList(policy: ToolPolicy): string[] {
  let tools: string[] = [];

  // Start with profile
  if (policy.profile && policy.profile !== "full") {
    const profileTools = TOOL_PROFILES[policy.profile] ?? [];
    tools = expandToolList(profileTools);
  }

  // Apply allowlist
  if (policy.allow && policy.allow.length > 0) {
    tools = expandToolList(policy.allow);
  }

  // Remove denied tools
  if (policy.deny && policy.deny.length > 0) {
    const denied = expandToolList(policy.deny);
    tools = tools.filter((tool) => {
      return !denied.some((d) => matchesPattern(tool.toLowerCase(), d.toLowerCase()));
    });
  }

  return tools;
}
