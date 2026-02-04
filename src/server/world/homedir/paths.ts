/**
 * Centralized path definitions for all .zuckerman directory paths
 * All paths should be imported from here instead of being defined locally
 */

import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Get base .zuckerman directory
 */
export function getBaseDir(): string {
  return join(homedir(), ".zuckerman");
}

/**
 * Get base .zuckerman directory (alias for backward compatibility)
 */
export function getZuckermanBaseDir(): string {
  return getBaseDir();
}

// ============================================================================
// General Paths (shared across agents)
// ============================================================================

export function getConfigPath(): string {
  return join(getBaseDir(), "config.json");
}

export function getCalendarDir(): string {
  return join(getBaseDir(), "calendar");
}

export function getCalendarEventsFile(): string {
  return join(getCalendarDir(), "events.json");
}

export function getActivitiesDir(): string {
  return join(getBaseDir(), "activities");
}

export function getActivityFilePath(date: string): string {
  return join(getActivitiesDir(), `${date}.jsonl`);
}

export function getCredentialsDir(): string {
  return join(getBaseDir(), "credentials");
}

export function getWhatsAppAuthDir(): string {
  return join(getCredentialsDir(), "whatsapp");
}

export function getSecretsDir(): string {
  return join(getBaseDir(), "secrets");
}

export function getSecretsKeyFile(): string {
  return join(getSecretsDir(), ".key");
}

export function getSecretFile(key: string): string {
  return join(getSecretsDir(), `${key}.enc`);
}

export function getBrowserDataDir(): string {
  return join(getBaseDir(), "browser");
}

export function getAudioDir(): string {
  return join(getBaseDir(), "audio");
}

/**
 * Get audio file path
 */
export function getAudioFilePath(filename: string): string {
  return join(getAudioDir(), filename);
}

export function getSandboxRegistryPath(): string {
  return join(getBaseDir(), "sandbox-registry.json");
}

export function getCliConversationFile(): string {
  return join(getBaseDir(), "cli-conversation.json");
}

// ============================================================================
// Agent-Specific Paths
// ============================================================================

export function getAgentDir(agentId: string): string {
  return join(getBaseDir(), "agents", agentId);
}

export function getAgentConversationsDir(agentId: string): string {
  return join(getAgentDir(agentId), "conversations");
}

export function getAgentConversationStorePath(agentId: string): string {
  return join(getAgentConversationsDir(agentId), "conversations.json");
}

export function getAgentConversationTranscriptPath(
  agentId: string,
  conversationId: string,
): string {
  return join(getAgentConversationsDir(agentId), `${conversationId}.jsonl`);
}

export function getAgentMemoryDir(agentId: string): string {
  return join(getAgentDir(agentId), "memory");
}

export function getAgentMemoryDbPath(agentId: string): string {
  return join(getAgentMemoryDir(agentId), `${agentId}.sqlite`);
}

export function getAgentMemoryStoresDir(agentId: string): string {
  return join(getAgentMemoryDir(agentId), "stores");
}

export function getAgentMemoryStorePath(agentId: string, storeName: string): string {
  return join(getAgentMemoryStoresDir(agentId), `${storeName}.json`);
}

export function getAgentWorkspaceDir(agentId: string): string {
  return join(getAgentDir(agentId), "workspace");
}

// ============================================================================
// Custom StateDir Paths (for when stateDir is provided instead of using base)
// ============================================================================

/**
 * Resolve conversation store path with custom stateDir
 */
export function resolveConversationStorePathWithStateDir(
  stateDir: string,
  agentId: string,
): string {
  return join(stateDir, "agents", agentId, "conversations", "conversations.json");
}

/**
 * Resolve conversation transcript path with custom stateDir
 */
export function resolveConversationTranscriptPathWithStateDir(
  stateDir: string,
  agentId: string,
  conversationId: string,
): string {
  return join(stateDir, "agents", agentId, "conversations", `${conversationId}.jsonl`);
}

// ============================================================================
// Workspace Subdirectories
// ============================================================================

/**
 * Get workspace screenshots directory
 */
export function getWorkspaceScreenshotsDir(workspaceDir: string): string {
  return join(workspaceDir, "screenshots");
}

/**
 * Get workspace screenshot file path
 */
export function getWorkspaceScreenshotPath(workspaceDir: string, filename: string): string {
  return join(getWorkspaceScreenshotsDir(workspaceDir), filename);
}

/**
 * Get workspace memory directory (for memory files in workspace)
 */
export function getWorkspaceMemoryDir(workspaceDir: string): string {
  return join(workspaceDir, "memory");
}

/**
 * Get workspace memory file path
 */
export function getWorkspaceMemoryFilePath(workspaceDir: string, fileName: string): string {
  return join(workspaceDir, "memory", fileName);
}

/**
 * Get workspace file path (for any file relative to workspace)
 */
export function getWorkspaceFilePath(workspaceDir: string, relPath: string): string {
  return join(workspaceDir, relPath);
}
