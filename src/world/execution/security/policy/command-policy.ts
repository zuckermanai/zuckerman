import type { ExecutionSecurity } from "../types.js";

/**
 * Default dangerous commands that should be blocked
 */
const DEFAULT_DENYLIST = [
  "rm",
  "sudo",
  "su",
  "format",
  "mkfs",
  "dd",
  "fdisk",
  "parted",
  "mkfs.*",
  "rm -rf",
  "rm -r",
  "rm -f",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "init 0",
  "init 6",
];

/**
 * Check if a command is allowed based on execution policy
 */
export function isCommandAllowed(
  command: string,
  policy: ExecutionSecurity,
): { allowed: boolean; reason?: string } {
  const cmd = command.toLowerCase().trim();

  // Build effective denylist
  const denylist = [
    ...DEFAULT_DENYLIST,
    ...(policy.denylist ?? []),
  ];

  // Check denylist first
  for (const pattern of denylist) {
    if (matchesPattern(cmd, pattern.toLowerCase())) {
      return {
        allowed: false,
        reason: `Command "${command}" is blocked by denylist pattern "${pattern}"`,
      };
    }
  }

  // If allowlist exists, only allow listed commands
  if (policy.allowlist && policy.allowlist.length > 0) {
    let found = false;
    for (const pattern of policy.allowlist) {
      if (matchesPattern(cmd, pattern.toLowerCase())) {
        found = true;
        break;
      }
    }
    if (!found) {
      return {
        allowed: false,
        reason: `Command "${command}" is not in the allowlist`,
      };
    }
  }

  // Check path restrictions
  if (policy.blockedPaths && policy.blockedPaths.length > 0) {
    // Extract path from command if it contains a path
    for (const blockedPath of policy.blockedPaths) {
      if (cmd.includes(blockedPath.toLowerCase())) {
        return {
          allowed: false,
          reason: `Command "${command}" references blocked path "${blockedPath}"`,
        };
      }
    }
  }

  // Default: allow if not explicitly denied
  return { allowed: true };
}

/**
 * Check if a path is allowed for execution
 */
export function isPathAllowed(
  path: string,
  policy: ExecutionSecurity,
): { allowed: boolean; reason?: string } {
  const normalizedPath = path.toLowerCase().trim();

  // Check blocked paths
  if (policy.blockedPaths && policy.blockedPaths.length > 0) {
    for (const blockedPath of policy.blockedPaths) {
      if (normalizedPath.includes(blockedPath.toLowerCase())) {
        return {
          allowed: false,
          reason: `Path "${path}" is blocked`,
        };
      }
    }
  }

  // If allowed paths exist, only allow those
  if (policy.allowedPaths && policy.allowedPaths.length > 0) {
    let found = false;
    for (const allowedPath of policy.allowedPaths) {
      if (normalizedPath.startsWith(allowedPath.toLowerCase())) {
        found = true;
        break;
      }
    }
    if (!found) {
      return {
        allowed: false,
        reason: `Path "${path}" is not in the allowed paths list`,
      };
    }
  }

  return { allowed: true };
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
