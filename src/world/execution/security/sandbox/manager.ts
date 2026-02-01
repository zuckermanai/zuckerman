import type {
  SandboxConfig,
  SandboxContext,
  SandboxScope,
  WorkspaceAccess,
} from "../types.js";
import {
  createSandboxContainer,
  getContainerState,
  ensureContainerRunning,
  removeContainer,
  execInContainer,
  isDockerAvailable,
} from "./docker.js";
import {
  getRegistryEntry,
  updateRegistryEntry,
  removeRegistryEntry,
} from "./registry.js";
import { createHash } from "node:crypto";

const DEFAULT_CONTAINER_PREFIX = "zuckerman-sandbox-";
const DEFAULT_WORKDIR = "/workspace";

/**
 * Compute config hash for container identification
 */
function computeConfigHash(params: {
  docker: SandboxConfig["docker"];
  workspaceAccess: WorkspaceAccess;
  workspaceDir: string;
}): string {
  const data = JSON.stringify({
    docker: params.docker,
    workspaceAccess: params.workspaceAccess,
    workspaceDir: params.workspaceDir,
  });
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

/**
 * Resolve scope key for container naming
 */
function resolveScopeKey(
  scope: SandboxScope,
  sessionId: string,
  agentId: string,
): string {
  if (scope === "shared") {
    return "shared";
  }
  if (scope === "per-agent") {
    return agentId;
  }
  return sessionId; // per-session
}

/**
 * Generate container name
 */
function generateContainerName(
  prefix: string,
  scopeKey: string,
): string {
  // Docker container names must be lowercase and can contain [a-z0-9_-]
  const sanitized = scopeKey
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .slice(0, 50);
  return `${prefix}${sanitized}`.slice(0, 63); // Docker limit
}

/**
 * Ensure sandbox container exists and is running
 */
export async function ensureSandboxContainer(params: {
  sessionId: string;
  agentId: string;
  workspaceDir: string;
  agentWorkspaceDir?: string;
  config: SandboxConfig;
}): Promise<SandboxContext | null> {
  // Check if Docker is available
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    console.warn("[Sandbox] Docker is not available, sandboxing disabled");
    return null;
  }

  const scope = params.config.scope ?? "per-session";
  const scopeKey = resolveScopeKey(scope, params.sessionId, params.agentId);
  const workspaceAccess = params.config.workspaceAccess ?? "rw";
  const prefix = params.config.docker?.containerPrefix ?? DEFAULT_CONTAINER_PREFIX;
  const containerName = generateContainerName(prefix, scopeKey);

  // Check if container exists
  const state = await getContainerState(containerName);
  const configHash = computeConfigHash({
    docker: params.config.docker,
    workspaceAccess,
    workspaceDir: params.workspaceDir,
  });

  if (state.exists) {
    // Check if config matches
    const entry = await getRegistryEntry(containerName);
    if (entry?.configHash === configHash) {
      // Container exists and config matches, ensure it's running
      await ensureContainerRunning(containerName);
      await updateRegistryEntry({
        containerName,
        scopeKey,
        createdAt: entry.createdAt,
        lastUsedAt: Date.now(),
        configHash,
      });

      return {
        containerName,
        containerId: state.id,
        workspaceDir: params.workspaceDir,
        containerWorkdir: params.config.docker?.workdir ?? DEFAULT_WORKDIR,
        isRunning: true,
        createdAt: entry.createdAt,
        lastUsedAt: Date.now(),
      };
    } else {
      // Config changed, remove old container
      await removeContainer(containerName);
      await removeRegistryEntry(containerName);
    }
  }

  // Create new container
  await createSandboxContainer({
    name: containerName,
    config: {
      image: params.config.docker?.image ?? "debian:bookworm-slim",
      workdir: DEFAULT_WORKDIR,
      containerPrefix: prefix,
      ...params.config.docker,
    },
    workspaceDir: params.workspaceDir,
    workspaceAccess,
    agentWorkspaceDir: params.agentWorkspaceDir,
    scopeKey,
  });

  const now = Date.now();
  await updateRegistryEntry({
    containerName,
    scopeKey,
    createdAt: now,
    lastUsedAt: now,
    configHash,
  });

  const newState = await getContainerState(containerName);
  return {
    containerName,
    containerId: newState.id,
    workspaceDir: params.workspaceDir,
    containerWorkdir: params.config.docker?.workdir ?? DEFAULT_WORKDIR,
    isRunning: newState.running,
    createdAt: now,
    lastUsedAt: now,
  };
}

/**
 * Execute command in sandbox
 */
export async function executeInSandbox(
  sandbox: SandboxContext,
  command: string,
  args: string[] = [],
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    input?: string;
  },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Ensure container is running
  await ensureContainerRunning(sandbox.containerName);

  // Update last used time
  await updateRegistryEntry({
    containerName: sandbox.containerName,
    scopeKey: "", // Will be updated by registry
    createdAt: sandbox.createdAt,
    lastUsedAt: Date.now(),
    configHash: undefined,
  });

  // Execute command
  return execInContainer(sandbox.containerName, command, args, {
    ...options,
    cwd: options?.cwd ?? sandbox.containerWorkdir,
  });
}

/**
 * Cleanup sandbox container
 */
export async function cleanupSandbox(containerName: string): Promise<void> {
  await removeContainer(containerName);
  await removeRegistryEntry(containerName);
}
