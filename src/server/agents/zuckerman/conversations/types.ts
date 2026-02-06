export type ConversationId = string;
export type ConversationKey = string;
export type ConversationLabel = string;

export type ConversationType = "main" | "group" | "channel";

export interface Conversation {
  id: ConversationId;
  label: ConversationLabel;
  type: ConversationType;
  createdAt: number;
  lastActivity: number;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  ignore?: boolean;
}

export interface ConversationState {
  conversation: Conversation;
  messages: ConversationMessage[];
}

/**
 * Conversation entry stored in conversations.json
 * Tracks metadata and token usage per conversation
 */
export interface ConversationEntry {
  conversationId: ConversationId;
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
  timeoutSecondsOverride?: number; // Per-conversation timeout override
  lastTranscriptId?: string; // Track last written transcript entry to prevent duplicates
  memoryFlushCount?: number; // Track number of memory flushes for this conversation (deprecated, use sleepCount)
  memoryFlushAt?: number; // Timestamp of last memory flush (deprecated, use sleepAt)
  sleepCount?: number; // Track number of sleep mode runs for this conversation
  sleepAt?: number; // Timestamp of last sleep mode run
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
