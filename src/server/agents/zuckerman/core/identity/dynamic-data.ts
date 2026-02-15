import { join, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";
import { cwd, uptime as processUptime } from "node:process";
import { platform, arch, hostname, type, release, cpus, userInfo, homedir } from "node:os";
import { version as nodeVersion } from "node:process";

export interface SystemContextOptions {
  /** Include directory information (agent dir, project root) */
  directories?: boolean;
  /** Include static system information (OS, CPU, Node version, etc.) */
  systemInfo?: boolean;
  /** Include user and environment information */
  environment?: boolean;
  /** Include current time and timezone */
  time?: boolean;
  /** Include agent runtime state */
  agentState?: {
    agentId?: string;
    isRunning?: boolean;
    coreInitialized?: boolean;
    workingMemorySize?: number;
  };
}

/**
 * Build system context with configurable sections
 */
export function getSystemContext(options: SystemContextOptions & { agentDir?: string }): string {
  const parts: string[] = [];
  const {
    directories = false,
    systemInfo = false,
    environment = false,
    time = false,
    agentState,
    agentDir,
  } = options;

  if (directories && agentDir) {
    const projectRoot = findProjectRoot();
    parts.push("## Available Directories");
    parts.push(`You have access to two key directories:`);
    parts.push("");
    parts.push(`1. **Agent Directory**: \`${agentDir}\``);
    parts.push(`   - Your own code, configuration, tools, and identity files`);
    parts.push(`   - This is where you can modify yourself (self-improvement)`);
    parts.push(`   - Contains: core modules, tools, conversations, identity`);
    parts.push("");
    parts.push(`2. **Project Root**: \`${projectRoot}\``);
    parts.push(`   - The entire Zuckerman project codebase`);
    parts.push(`   - Includes: World layer, all agents, interfaces, documentation`);
    parts.push(`   - Use this to understand the full system architecture and find shared utilities`);
    parts.push("");
  }

  if (systemInfo) {
    const platformName = getPlatformName();
    parts.push("## System Information");
    parts.push(`- **Operating System**: ${platformName} (${platform()})`);
    parts.push(`- **OS Version**: ${type()} ${release()}`);
    parts.push(`- **Architecture**: ${arch()}`);
    parts.push(`- **Hostname**: ${hostname()}`);
    parts.push(`- **CPU Cores**: ${cpus().length}`);
    parts.push(`- **Node.js Version**: ${nodeVersion}`);
    parts.push("");
  }

  if (environment) {
    const user = userInfo();
    parts.push("## Environment");
    parts.push(`- **Username**: ${user.username}`);
    parts.push(`- **Home Directory**: ${homedir()}`);
    parts.push(`- **Working Directory**: ${cwd()}`);
    parts.push(`- **Process ID**: ${process.pid}`);
    parts.push(`- **Process Uptime**: ${Math.floor(processUptime())} seconds`);
    parts.push("");
  }

  if (time || agentState) {
    parts.push("## Runtime Context");
    
    if (time) {
      const now = new Date();
      parts.push(`**Current Time**: ${now.toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`);
      parts.push(`**Timezone**: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    }

    if (agentState) {
      const stateParts: string[] = [];
      if (agentState.agentId !== undefined) {
        stateParts.push(`Agent: ${agentState.agentId}`);
      }
      if (agentState.isRunning !== undefined) {
        stateParts.push(`Running: ${agentState.isRunning ? 'Yes' : 'No'}`);
      }
      if (agentState.coreInitialized !== undefined) {
        stateParts.push(`Core Initialized: ${agentState.coreInitialized ? 'Yes' : 'No'}`);
      }
      if (agentState.workingMemorySize !== undefined) {
        stateParts.push(`Memory: ${agentState.workingMemorySize} items`);
      }
      if (stateParts.length > 0) {
        parts.push(`**State**: ${stateParts.join(', ')}`);
      }
    }
  }

  return parts.join("\n");
}

// ============================================================================
// Private Helper Functions
// ============================================================================

/**
 * Find project root by looking for root markers
 */
function findProjectRoot(): string {
  let dir = cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml")) || existsSync(join(dir, "turbo.json"))) {
      return dir;
    }
    
    const packageJsonPath = join(dir, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const content = readFileSync(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.name === "zuckerman") {
          return dir;
        }
      } catch {
        // Continue searching
      }
    }
    dir = dirname(dir);
  }
  
  return cwd();
}

/**
 * Get platform name from platform code
 */
function getPlatformName(): string {
  switch (platform()) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return platform();
  }
}
