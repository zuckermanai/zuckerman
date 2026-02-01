export type SessionId = string;
export type SessionKey = string;
export type SessionLabel = string;

export type SessionType = "main" | "group" | "channel";

export interface Session {
  id: SessionId;
  label: SessionLabel;
  type: SessionType;
  createdAt: number;
  lastActivity: number;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionState {
  session: Session;
  messages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestamp: number;
    toolCallId?: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: string;
    }>;
  }>;
}

/**
 * Session entry stored in sessions.json
 * Tracks metadata and token usage per session
 */
export interface SessionEntry {
  sessionId: SessionId;
  updatedAt: number;
  createdAt?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
  displayName?: string;
  channel?: string;
  subject?: string;
  room?: string;
  space?: string;
  groupChannel?: string;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
  deliveryContext?: {
    channel?: string;
    to?: string;
    accountId?: string;
    threadId?: string | number;
  };
  origin?: {
    label?: string;
    channel?: string;
    accountId?: string;
  };
  agentId?: string;
  thinkingLevel?: string;
  verboseLevel?: string;
  reasoningLevel?: string;
  modelOverride?: string;
  providerOverride?: string;
  temperatureOverride?: number;
  timeoutSecondsOverride?: number; // Per-session timeout override
  lastTranscriptId?: string; // Track last written transcript entry to prevent duplicates
}

/**
 * Transcript entry stored in JSONL files
 * Represents a single message or event in the conversation
 */
export interface TranscriptEntry {
  id: string;
  parentId?: string;
  role: "user" | "assistant" | "system" | "tool" | "command";
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  thinking?: string;
  metadata?: Record<string, unknown>;
  runId?: string; // Link messages from same agent run
}
