import { getBaseDir } from "@server/world/homedir/paths.js";
import type {
  Conversation,
  ConversationId,
  ConversationKey,
  ConversationLabel,
  ConversationType,
  ConversationState,
  ConversationEntry,
  TranscriptEntry,
  ConversationMessage,
  TextPart,
  ToolCallPart,
  ToolResultPart,
} from "./types.js";
import {
  loadConversationStore,
  saveConversationStore,
  resolveConversationStorePath,
} from "./store.js";
import {
  appendTranscriptEntry,
  loadTranscript,
  resolveTranscriptPath,
  messagesToTranscriptEntries,
} from "./transcript.js";
import { generateShortID } from "@shared/utils/id.js";
import { activityRecorder } from "@server/agents/zuckerman/activity/index.js";

// Helper to convert message content to string for transcript
function contentToString(content: ConversationMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.map(part => 
    part.type === "text" ? part.text : `[${part.type}: ${part.toolName || ""}]`
  ).join(" ");
}

// Convert ConversationMessage to transcript format
function messageToTranscriptFormat(msg: ConversationMessage) {
  return {
    role: msg.role,
    content: contentToString(msg.content),
    timestamp: msg.timestamp,
    ...(msg.role === "tool" && msg.toolCallId && { toolCallId: msg.toolCallId }),
    ...(msg.role === "assistant" && msg.toolCalls && {
      toolCalls: msg.toolCalls.map(tc => ({
        id: tc.toolCallId,
        name: tc.toolName,
        arguments: JSON.stringify(tc.args),
      })),
    }),
  };
}

export function deriveConversationKey(
  agentId: string,
  type: ConversationType,
  label?: ConversationLabel,
): ConversationKey {
  return type === "main" 
    ? `agent:${agentId}:main`
    : `agent:${agentId}:${type}:${label || "default"}`;
}

export class ConversationManager {
  private conversations = new Map<ConversationId, ConversationState>();
  private storePath: string;
  private stateDir: string;
  private agentId: string;
  private writeLocks = new Map<ConversationId, Promise<void>>();

  constructor(agentId: string, stateDir?: string) {
    this.agentId = agentId;
    this.stateDir = stateDir || getBaseDir();
    this.storePath = resolveConversationStorePath(agentId, this.stateDir);
    this.loadConversations();
  }

  /**
   * Load conversations from persistent store
   */
  private loadConversations(): void {
    try {
      const store = loadConversationStore(this.storePath);
      for (const [conversationKey, entry] of Object.entries(store)) {
        // Load transcript for this conversation
        const transcriptPath = resolveTranscriptPath(
          this.agentId,
          entry.conversationId,
          this.stateDir,
        );
        const transcriptEntries = loadTranscript(transcriptPath);

        // Convert transcript entries to messages
        const messages: ConversationMessage[] = transcriptEntries.map((entry): ConversationMessage => {
          const base = { timestamp: entry.timestamp };

          if (entry.role === "system") {
            return { ...base, role: "system", content: entry.content };
          }
          if (entry.role === "user") {
            return { ...base, role: "user", content: entry.content };
          }
          if (entry.role === "assistant") {
            return {
              ...base,
              role: "assistant",
              content: entry.content,
              toolCalls: entry.toolCalls?.map(tc => ({
                type: "tool-call" as const,
                toolCallId: tc.id,
                toolName: tc.name,
                args: JSON.parse(tc.arguments),
              })),
            };
          }
          // tool
          return {
            ...base,
            role: "tool",
            content: entry.toolCallId ? [{
              type: "tool-result" as const,
              toolCallId: entry.toolCallId,
              toolName: "unknown",
              output: entry.content,
            }] : [],
            toolCallId: entry.toolCallId,
          };
        });

        const conversation: Conversation = {
          id: entry.conversationId,
          label: entry.displayName || conversationKey,
          type: this.inferConversationType(conversationKey),
          createdAt: entry.createdAt || entry.updatedAt,
          lastActivity: entry.updatedAt,
          agentId: entry.agentId || this.agentId,
        };

        const state: ConversationState = {
          conversation,
          messages,
        };

        this.conversations.set(entry.conversationId, state);
      }
    } catch (error) {
      console.warn(`Failed to load conversations for agent ${this.agentId}:`, error);
    }
  }

  private inferConversationType(key: ConversationKey): ConversationType {
    return key.includes(":group:") ? "group"
      : key.includes(":channel:") ? "channel"
      : "main";
  }

  private getConversationKey(state: ConversationState): ConversationKey {
    return deriveConversationKey(this.agentId, state.conversation.type, state.conversation.label);
  }

  private async getOrCreateEntry(conversationId: ConversationId): Promise<{ key: ConversationKey; entry: ConversationEntry } | null> {
    const state = this.conversations.get(conversationId);
    if (!state) return null;
    const store = loadConversationStore(this.storePath);
    const key = this.getConversationKey(state);
    const entry = store[key] || {
      conversationId,
      updatedAt: Date.now(),
      createdAt: state.conversation.createdAt,
      displayName: state.conversation.label,
      agentId: this.agentId,
    };
    store[key] = entry;
    return { key, entry };
  }

  /**
   * Acquire write lock for a conversation
   */
  private async acquireWriteLock(conversationId: ConversationId): Promise<() => void> {
    const existingLock = this.writeLocks.get(conversationId);
    if (existingLock) {
      await existingLock;
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.writeLocks.set(conversationId, lockPromise);

    return () => {
      releaseLock();
      this.writeLocks.delete(conversationId);
    };
  }

  /**
   * Persist conversations to disk (only metadata, not transcripts)
   */
  private async persistConversations(): Promise<void> {
    const store: Record<ConversationKey, ConversationEntry> = {};
    const existingStore = loadConversationStore(this.storePath);

    for (const [conversationId, state] of this.conversations.entries()) {
      const key = this.getConversationKey(state);
      const existing = existingStore[key];
      store[key] = {
        ...existing,
        conversationId,
        updatedAt: state.conversation.lastActivity,
        createdAt: existing?.createdAt || state.conversation.createdAt,
        displayName: state.conversation.label,
        agentId: this.agentId,
        inputTokens: existing?.inputTokens || 0,
        outputTokens: existing?.outputTokens || 0,
        totalTokens: existing?.totalTokens || 0,
        contextTokens: existing?.contextTokens || 0,
      };
    }

    await saveConversationStore(this.storePath, store);
  }

  /**
   * Update token counts for a conversation
   */
  async updateTokenCounts(
    conversationId: ConversationId,
    counts: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      contextTokens?: number;
    },
  ): Promise<void> {
    const result = await this.getOrCreateEntry(conversationId);
    if (!result) return;

    const { entry } = result;
    if (counts.inputTokens !== undefined) entry.inputTokens = (entry.inputTokens || 0) + counts.inputTokens;
    if (counts.outputTokens !== undefined) entry.outputTokens = (entry.outputTokens || 0) + counts.outputTokens;
    if (counts.totalTokens !== undefined) entry.totalTokens = (entry.totalTokens || 0) + counts.totalTokens;
    if (counts.contextTokens !== undefined) entry.contextTokens = counts.contextTokens;
    entry.updatedAt = Date.now();

    const store = loadConversationStore(this.storePath);
    store[result.key] = entry;
    await saveConversationStore(this.storePath, store);
  }

  /**
   * Update conversation entry with custom update function
   */
  async updateConversationEntry(
    conversationId: ConversationId,
    updateFn: (entry: ConversationEntry) => Partial<ConversationEntry>,
  ): Promise<ConversationEntry | undefined> {
    const result = await this.getOrCreateEntry(conversationId);
    if (!result) return undefined;

    const { entry } = result;
    Object.assign(entry, updateFn(entry));
    entry.updatedAt = Date.now();

    const store = loadConversationStore(this.storePath);
    store[result.key] = entry;
    await saveConversationStore(this.storePath, store);
    return entry;
  }

  /**
   * Get store path (for external access)
   */
  getStorePath(): string {
    return this.storePath;
  }

  createConversation(
    label: ConversationLabel,
    type: ConversationType = "main",
    agentId?: string,
  ): Conversation {
    const id = generateShortID();
    const now = Date.now();

    const conversation: Conversation = {
      id,
      label,
      type,
      createdAt: now,
      lastActivity: now,
      agentId: agentId || this.agentId,
    };

    const state: ConversationState = {
      conversation,
      messages: [],
    };

    this.conversations.set(id, state);
    this.persistConversations().catch((err) => {
      console.error("Failed to persist conversation:", err);
    });

    // Record conversation creation
    activityRecorder.recordConversationCreate(
      agentId || this.agentId,
      id,
      type,
      label,
    ).catch((err) => {
      console.warn("Failed to record conversation creation activity:", err);
    });

    return conversation;
  }

  getConversation(id: ConversationId): ConversationState | undefined {
    return this.conversations.get(id);
  }

  updateActivity(id: ConversationId): void {
    const state = this.conversations.get(id);
    if (state) {
      state.conversation.lastActivity = Date.now();
      this.persistConversations().catch((err) => {
        console.error("Failed to persist conversation update:", err);
      });
      
      // Record conversation update
      activityRecorder.recordConversationUpdate(
        this.agentId,
        id,
      ).catch((err) => {
        console.warn("Failed to record conversation update activity:", err);
      });
    }
  }

  async addMessage(
    id: ConversationId,
    role: "user" | "assistant" | "system" | "tool",
    content: string | Array<TextPart | ToolCallPart> | Array<ToolResultPart>,
    options?: {
      toolCallId?: string;
      toolName?: string;
      toolCalls?: Array<ToolCallPart | { id: string; name: string; arguments: string }>;
      runId?: string; // For tracking, not stored in message
    },
  ): Promise<void> {
    const state = this.conversations.get(id);
    if (!state) return;

    const releaseLock = await this.acquireWriteLock(id);
    try {
      const timestamp = Date.now();
      let message: ConversationMessage;

      if (role === "system") {
        message = {
          role: "system",
          content: typeof content === "string" ? content : contentToString(content),
          timestamp,
        };
      } else if (role === "user") {
        message = {
          role: "user",
          content: typeof content === "string" ? content : content as Array<TextPart>,
          timestamp,
        };
      } else if (role === "assistant") {
        message = {
          role: "assistant",
          content: typeof content === "string" ? content : content as Array<TextPart | ToolCallPart>,
          timestamp,
          toolCalls: options?.toolCalls?.map(tc => 
            "toolCallId" in tc ? tc as ToolCallPart : {
              type: "tool-call" as const,
              toolCallId: tc.id,
              toolName: tc.name,
              args: JSON.parse(tc.arguments),
            }
          ),
        };
      } else { // role === "tool"
        const toolContent = typeof content === "string" && options?.toolCallId && options?.toolName
          ? [{ type: "tool-result" as const, toolCallId: options.toolCallId, toolName: options.toolName, output: content }]
          : content as Array<ToolResultPart>;
        
        message = {
          role: "tool",
          content: toolContent,
          timestamp,
          toolCallId: options?.toolCallId,
        };
      }
      
      state.messages.push(message);
      state.conversation.lastActivity = Date.now();

      const result = await this.getOrCreateEntry(id);
      if (!result) return;

      const transcriptPath = resolveTranscriptPath(this.agentId, id, this.stateDir);
      const transcriptEntries = messagesToTranscriptEntries(
        [messageToTranscriptFormat(message)],
        result.entry.lastTranscriptId,
      );

      if (transcriptEntries.length > 0) {
        const transcriptEntry = transcriptEntries[0];
        appendTranscriptEntry(transcriptPath, transcriptEntry);
        result.entry.lastTranscriptId = transcriptEntry.id;
        result.entry.updatedAt = Date.now();

        const store = loadConversationStore(this.storePath);
        store[result.key] = result.entry;
        await saveConversationStore(this.storePath, store);
      }
    } finally {
      releaseLock();
    }
  }

  listConversations(): Conversation[] {
    return Array.from(this.conversations.values()).map((state) => state.conversation);
  }

  deleteConversation(id: ConversationId): boolean {
    const deleted = this.conversations.delete(id);
    if (deleted) {
      this.persistConversations().catch((err) => {
        console.error("Failed to persist conversation deletion:", err);
      });
    }
    return deleted;
  }

  getOrCreateMainConversation(agentId?: string): Conversation {
    const main = Array.from(this.conversations.values())
      .find(s => s.conversation.type === "main")?.conversation;
    return main || this.createConversation("main", "main", agentId);
  }

  getConversationEntryByKey(key: ConversationKey): ConversationEntry | undefined {
    return loadConversationStore(this.storePath)[key];
  }

  getAllConversationEntries(): Record<ConversationKey, ConversationEntry> {
    return loadConversationStore(this.storePath);
  }

  /**
   * Update conversation channel metadata (for channel tools to access)
   */
  async updateChannelMetadata(
    conversationId: ConversationId,
    metadata: { channel?: string; to?: string; accountId?: string },
  ): Promise<void> {
    const result = await this.getOrCreateEntry(conversationId);
    if (!result) return;

    const { entry } = result;
    if (metadata.channel) entry.lastChannel = metadata.channel;
    if (metadata.to) entry.lastTo = metadata.to;
    entry.deliveryContext = { ...entry.deliveryContext, ...metadata };
    entry.origin = { ...entry.origin, channel: metadata.channel, accountId: metadata.accountId };
    entry.updatedAt = Date.now();

    const store = loadConversationStore(this.storePath);
    store[result.key] = entry;
    await saveConversationStore(this.storePath, store);
  }

  /**
   * Get transcript entries for a conversation (with IDs)
   */
  getTranscriptEntries(conversationId: ConversationId): TranscriptEntry[] {
    const state = this.conversations.get(conversationId);
    if (!state) return [];

    const transcriptPath = resolveTranscriptPath(
      this.agentId,
      conversationId,
      this.stateDir,
    );
    return loadTranscript(transcriptPath);
  }

  getMessagesForContext(
    conversationId: ConversationId,
    maxTokens?: number,
    maxMessages: number = 50,
  ) {
    const state = this.conversations.get(conversationId);
    if (!state) return [];
    return state.messages.slice(-maxMessages).map(messageToTranscriptFormat);
  }

  /**
   * Set conversation overrides (model, provider, thinking level, etc.)
   */
  async setConversationOverrides(
    conversationId: ConversationId,
    overrides: {
      modelOverride?: string;
      providerOverride?: string;
      temperatureOverride?: number;
      thinkingLevel?: string;
      verboseLevel?: string;
      reasoningLevel?: string;
      timeoutSecondsOverride?: number;
    },
  ): Promise<void> {
    const releaseLock = await this.acquireWriteLock(conversationId);
    try {
      const result = await this.getOrCreateEntry(conversationId);
      if (!result) return;

      Object.assign(result.entry, overrides);
      result.entry.updatedAt = Date.now();

      const store = loadConversationStore(this.storePath);
      store[result.key] = result.entry;
      await saveConversationStore(this.storePath, store);
    } finally {
      releaseLock();
    }
  }

  getConversationEntry(conversationId: ConversationId): ConversationEntry | undefined {
    const state = this.conversations.get(conversationId);
    if (!state) return undefined;
    return loadConversationStore(this.storePath)[this.getConversationKey(state)];
  }
}
