/**
 * Core security types and interfaces
 */

import type { SessionType } from "@agents/zuckerman/sessions/types.js";

export type SandboxMode = "off" | "non-main" | "all";
export type SandboxScope = "per-session" | "per-agent" | "shared";
export type WorkspaceAccess = "ro" | "rw" | "none";
export type ToolProfile = "minimal" | "coding" | "messaging" | "full";

export interface DockerConfig {
  image?: string;
  containerPrefix?: string;
  workdir?: string;
  readOnlyRoot?: boolean;
  network?: "none" | "bridge" | string;
  user?: string;
  memory?: string;
  memorySwap?: string;
  cpus?: number;
  pidsLimit?: number;
  capDrop?: string[];
  tmpfs?: string[];
  env?: Record<string, string>;
  setupCommand?: string;
  binds?: string[];
  seccompProfile?: string;
  apparmorProfile?: string;
  dns?: string[];
  extraHosts?: string[];
}

export interface SandboxConfig {
  mode?: SandboxMode;
  scope?: SandboxScope;
  workspaceAccess?: WorkspaceAccess;
  enabled?: boolean;
  docker?: DockerConfig;
}

export interface ToolPolicy {
  profile?: ToolProfile;
  allow?: string[];
  deny?: string[];
  sandbox?: {
    tools?: {
      allow?: string[];
      deny?: string[];
    };
  };
}

export interface ExecutionSecurity {
  allowlist?: string[];
  denylist?: string[];
  timeout?: number;
  maxOutput?: number;
  maxProcesses?: number;
  allowedPaths?: string[];
  blockedPaths?: string[];
}

export interface SessionSecurity {
  sandbox?: boolean;
  tools?: ToolPolicy;
  execution?: ExecutionSecurity;
}

export interface GatewayAuthConfig {
  enabled?: boolean;
  tokens?: string[];
  apiKeys?: string[];
  rateLimit?: {
    requestsPerMinute?: number;
  };
}

export interface SecretConfig {
  encryption?: {
    enabled?: boolean;
    keyPath?: string;
  };
}

export interface SecurityConfig {
  sandbox?: SandboxConfig;
  tools?: ToolPolicy;
  execution?: ExecutionSecurity;
  sessions?: {
    main?: SessionSecurity;
    group?: SessionSecurity;
    channel?: SessionSecurity;
  };
  gateway?: GatewayAuthConfig;
  secrets?: SecretConfig;
}

export interface SecurityContext {
  sessionId: string;
  sessionType: SessionType;
  agentId: string;
  isSandboxed: boolean;
  toolPolicy: ToolPolicy;
  executionPolicy: ExecutionSecurity;
  workspaceAccess: WorkspaceAccess;
  sandboxContainerName?: string;
}

export interface SandboxContext {
  containerName: string;
  containerId?: string;
  workspaceDir: string;
  containerWorkdir: string;
  isRunning: boolean;
  createdAt: number;
  lastUsedAt: number;
}
