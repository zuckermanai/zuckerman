import { spawn } from "node:child_process";
import { promisify } from "node:util";
import type { DockerConfig, SandboxScope } from "../types.js";

export const DEFAULT_IMAGE = "debian:bookworm-slim";
export const DEFAULT_CONTAINER_PREFIX = "zuckerman-sandbox-";
export const DEFAULT_WORKDIR = "/workspace";
export const AGENT_WORKSPACE_MOUNT = "/agent-workspace";

/**
 * Execute docker command
 */
export function execDocker(
  args: string[],
  opts?: { allowFailure?: boolean },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      const exitCode = code ?? 0;
      if (exitCode !== 0 && !opts?.allowFailure) {
        reject(new Error(stderr.trim() || `docker ${args.join(" ")} failed`));
        return;
      }
      resolve({ stdout, stderr, code: exitCode });
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Check if Docker is available
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    await execDocker(["version"], { allowFailure: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker image exists locally
 */
export async function imageExists(image: string): Promise<boolean> {
  try {
    await execDocker(["image", "inspect", image], { allowFailure: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pull Docker image if needed
 */
export async function ensureDockerImage(image: string): Promise<void> {
  const exists = await imageExists(image);
  if (!exists) {
    console.log(`[Sandbox] Pulling Docker image: ${image}`);
    await execDocker(["pull", image], { allowFailure: false });
  }
}

/**
 * Build Docker container creation arguments
 */
export function buildContainerCreateArgs(params: {
  name: string;
  config: DockerConfig;
  scopeKey: string;
  createdAtMs?: number;
}): string[] {
  const createdAtMs = params.createdAtMs ?? Date.now();
  const config = params.config;
  
  const args = ["create", "--name", params.name];
  
  // Labels
  args.push("--label", "zuckerman.sandbox=1");
  args.push("--label", `zuckerman.scopeKey=${params.scopeKey}`);
  args.push("--label", `zuckerman.createdAtMs=${createdAtMs}`);

  // Security options
  if (config.readOnlyRoot !== false) {
    args.push("--read-only");
  }

  // Tmpfs mounts
  for (const tmpfs of config.tmpfs ?? ["/tmp", "/var/tmp", "/run"]) {
    args.push("--tmpfs", tmpfs);
  }

  // Network
  const network = config.network ?? "none";
  if (network !== "bridge") {
    args.push("--network", network);
  }

  // User
  if (config.user) {
    args.push("--user", config.user);
  }

  // Capabilities
  for (const cap of config.capDrop ?? ["ALL"]) {
    args.push("--cap-drop", cap);
  }

  args.push("--security-opt", "no-new-privileges");

  // Resource limits
  if (config.memory) {
    args.push("--memory", config.memory);
  }

  if (config.memorySwap) {
    args.push("--memory-swap", config.memorySwap);
  }

  if (typeof config.cpus === "number" && config.cpus > 0) {
    args.push("--cpus", String(config.cpus));
  }

  if (typeof config.pidsLimit === "number" && config.pidsLimit > 0) {
    args.push("--pids-limit", String(config.pidsLimit));
  }

  // DNS
  for (const dns of config.dns ?? []) {
    if (dns.trim()) {
      args.push("--dns", dns);
    }
  }

  // Extra hosts
  for (const host of config.extraHosts ?? []) {
    if (host.trim()) {
      args.push("--add-host", host);
    }
  }

  // Binds
  for (const bind of config.binds ?? []) {
    args.push("-v", bind);
  }

  return args;
}

/**
 * Create sandbox container
 */
export async function createSandboxContainer(params: {
  name: string;
  config: DockerConfig;
  workspaceDir: string;
  workspaceAccess: "ro" | "rw" | "none";
  agentWorkspaceDir?: string;
  scopeKey: string;
}): Promise<void> {
  const { name, config, workspaceDir, workspaceAccess, agentWorkspaceDir, scopeKey } = params;
  const image = config.image ?? DEFAULT_IMAGE;
  
  await ensureDockerImage(image);

  const workdir = config.workdir ?? DEFAULT_WORKDIR;
  const args = buildContainerCreateArgs({
    name,
    config,
    scopeKey,
  });

  args.push("--workdir", workdir);

  // Mount workspace
  if (workspaceAccess !== "none") {
    const mountSuffix = workspaceAccess === "ro" ? ":ro" : "";
    args.push("-v", `${workspaceDir}:${workdir}${mountSuffix}`);
  }

  // Mount agent workspace if different
  if (agentWorkspaceDir && agentWorkspaceDir !== workspaceDir && workspaceAccess !== "none") {
    const agentMountSuffix = workspaceAccess === "ro" ? ":ro" : "";
    args.push("-v", `${agentWorkspaceDir}:${AGENT_WORKSPACE_MOUNT}${agentMountSuffix}`);
  }

  // Start command
  args.push(image, "sleep", "infinity");

  await execDocker(args);
  await execDocker(["start", name]);

  // Run setup command if provided
  if (config.setupCommand?.trim()) {
    await execDocker(["exec", "-i", name, "sh", "-lc", config.setupCommand]);
  }
}

/**
 * Get container state
 */
export async function getContainerState(
  containerName: string,
): Promise<{ exists: boolean; running: boolean; id?: string }> {
  try {
    const { stdout } = await execDocker(
      ["inspect", "--format", "{{.State.Running}} {{.Id}}", containerName],
      { allowFailure: false },
    );
    const [running, id] = stdout.trim().split(" ");
    return {
      exists: true,
      running: running === "true",
      id: id?.trim(),
    };
  } catch {
    return { exists: false, running: false };
  }
}

/**
 * Start container if not running
 */
export async function ensureContainerRunning(containerName: string): Promise<void> {
  const state = await getContainerState(containerName);
  if (state.exists && !state.running) {
    await execDocker(["start", containerName]);
  }
}

/**
 * Remove container
 */
export async function removeContainer(containerName: string): Promise<void> {
  await execDocker(["rm", "-f", containerName], { allowFailure: true });
}

/**
 * Execute command in container
 */
export async function execInContainer(
  containerName: string,
  command: string,
  args: string[] = [],
  options?: {
    cwd?: string;
    env?: Record<string, string>;
    input?: string;
  },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const execArgs = ["exec", "-i"];

  if (options?.cwd) {
    execArgs.push("-w", options.cwd);
  }

  if (options?.env) {
    for (const [key, value] of Object.entries(options.env)) {
      execArgs.push("-e", `${key}=${value}`);
    }
  }

  execArgs.push(containerName, command, ...args);

  return execDocker(execArgs, { allowFailure: true }).then((result) => ({
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.code,
  }));
}
