import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { getBaseDir } from "@server/world/homedir/paths.js";
import type {
  Conversation,
  ConversationId,
  ConversationKey,
  ConversationLabel,
  ConversationType,
  ConversationState,
  ConversationEntry,
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
import { activityRecorder } from "@server/world/activity/index.js";

/**
 * Derive conversation key from agent ID and conversation type/label
 */
export function deriveConversationKey(
  agentId: string,
  type: ConversationType,
  label?: ConversationLabel,
): ConversationKey {
  if (type === "main") {
    return `agent:${agentId}:main`;
  }
  if (type === "group" || type === "channel") {
    return `agent:${agentId}:${type}:${label || "default"}`;
  }
  return `agent:${agentId}:${label || "default"}`;
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
        const messages = transcriptEntries.map((entry) => ({
          role: entry.role as "user" | "assistant" | "system" | "tool",
          content: entry.content,
          timestamp: entry.timestamp,
          toolCallId: entry.toolCallId,
          toolCalls: entry.toolCalls,
        }));

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

  /**
   * Infer conversation type from conversation key
   */
  private inferConversationType(conversationKey: ConversationKey): ConversationType {
    if (conversationKey.includes(":main")) return "main";
    if (conversationKey.includes(":group:")) return "group";
    if (conversationKey.includes(":channel:")) return "channel";
    return "main";
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
      const conversationKey = deriveConversationKey(
        this.agentId,
        state.conversation.type,
        state.conversation.label,
      );

      // Update or create conversation entry
      const existing = existingStore[conversationKey];
      const entry: ConversationEntry = {
        conversationId,
        updatedAt: state.conversation.lastActivity,
        createdAt: existing?.createdAt || state.conversation.createdAt,
        displayName: state.conversation.label,
        agentId: this.agentId,
        // Token tracking will be updated by runtime
        inputTokens: existing?.inputTokens || 0,
        outputTokens: existing?.outputTokens || 0,
        totalTokens: existing?.totalTokens || 0,
        contextTokens: existing?.contextTokens || 0,
          // Preserve overrides and metadata
          modelOverride: existing?.modelOverride,
          providerOverride: existing?.providerOverride,
          temperatureOverride: existing?.temperatureOverride,
          timeoutSecondsOverride: existing?.timeoutSecondsOverride,
          thinkingLevel: existing?.thinkingLevel,
          verboseLevel: existing?.verboseLevel,
          reasoningLevel: existing?.reasoningLevel,
          origin: existing?.origin,
          deliveryContext: existing?.deliveryContext,
          lastTranscriptId: existing?.lastTranscriptId,
      };

      store[conversationKey] = entry;
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
    const state = this.conversations.get(conversationId);
    if (!state) return;

    const store = loadConversationStore(this.storePath);
    const conversationKey = deriveConversationKey(
      this.agentId,
      state.conversation.type,
      state.conversation.label,
    );

    const entry = store[conversationKey];
    if (entry) {
      if (counts.inputTokens !== undefined) {
        entry.inputTokens = (entry.inputTokens || 0) + counts.inputTokens;
      }
      if (counts.outputTokens !== undefined) {
        entry.outputTokens = (entry.outputTokens || 0) + counts.outputTokens;
      }
      if (counts.totalTokens !== undefined) {
        entry.totalTokens = (entry.totalTokens || 0) + counts.totalTokens;
      }
      if (counts.contextTokens !== undefined) {
        entry.contextTokens = counts.contextTokens;
      }
      entry.updatedAt = Date.now();

      await saveConversationStore(this.storePath, store);
    }
  }

  /**
   * Update conversation entry with custom update function
   */
  async updateConversationEntry(
    conversationId: ConversationId,
    updateFn: (entry: ConversationEntry) => Partial<ConversationEntry>,
  ): Promise<ConversationEntry | undefined> {
    const state = this.conversations.get(conversationId);
    if (!state) return undefined;

    const store = loadConversationStore(this.storePath);
    const conversationKey = deriveConversationKey(
      this.agentId,
      state.conversation.type,
      state.conversation.label,
    );

    const entry = store[conversationKey];
    if (entry) {
      const updates = updateFn(entry);
      Object.assign(entry, updates);
      entry.updatedAt = Date.now();
      await saveConversationStore(this.storePath, store);
      return entry;
    }

    return undefined;
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
    const id = randomUUID();
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
    content: string,
    options?: {
      toolCallId?: string;
      toolCalls?: Array<{
        id: string;
        name: string;
        arguments: string;
      }>;
      runId?: string;
    },
  ): Promise<void> {
    const state = this.conversations.get(id);
    if (!state) return;

    const releaseLock = await this.acquireWriteLock(id);
    try {
      const message = {
        role,
        content,
        timestamp: Date.now(),
        toolCallId: options?.toolCallId,
        toolCalls: options?.toolCalls,
      };
      state.messages.push(message);
      state.conversation.lastActivity = Date.now();

      // Get existing conversation entry to check lastTranscriptId
      const conversationKey = deriveConversationKey(
        this.agentId,
        state.conversation.type,
        state.conversation.label,
      );
      const store = loadConversationStore(this.storePath);
      const entry = store[conversationKey];

      // Only write to transcript if this is a new message (not already written)
      const transcriptPath = resolveTranscriptPath(
        this.agentId,
        id,
        this.stateDir,
      );
      const transcriptEntries = messagesToTranscriptEntries(
        [message],
        entry?.lastTranscriptId,
      );

      if (transcriptEntries.length > 0) {
        const transcriptEntry = transcriptEntries[0];
        appendTranscriptEntry(transcriptPath, transcriptEntry);

        // Update lastTranscriptId in conversation entry
        if (entry) {
          entry.lastTranscriptId = transcriptEntry.id;
          entry.updatedAt = Date.now();
          await saveConversationStore(this.storePath, store);
        } else {
          // Create new entry if it doesn't exist
          const newConversationEntry: ConversationEntry = {
            conversationId: id,
            updatedAt: Date.now(),
            createdAt: state.conversation.createdAt,
            displayName: state.conversation.label,
            agentId: this.agentId,
            lastTranscriptId: transcriptEntry.id,
          };
          store[conversationKey] = newConversationEntry;
          await saveConversationStore(this.storePath, store);
        }
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
    // Find existing main conversation
    for (const state of this.conversations.values()) {
      if (state.conversation.type === "main") {
        return state.conversation;
      }
    }

    // Create new main conversation
    return this.createConversation("main", "main", agentId);
  }

  /**
   * Get conversation entry from store by conversation key
   */
  getConversationEntryByKey(conversationKey: ConversationKey): ConversationEntry | undefined {
    const store = loadConversationStore(this.storePath);
    return store[conversationKey];
  }

  /**
   * Get all conversation entries
   */
  getAllConversationEntries(): Record<ConversationKey, ConversationEntry> {
    return loadConversationStore(this.storePath);
  }

  /**
   * Update conversation channel metadata (for channel tools to access)
   */
  async updateChannelMetadata(
    conversationId: ConversationId,
    metadata: {
      channel?: string;
      to?: string;
      accountId?: string;
    },
  ): Promise<void> {
    const state = this.conversations.get(conversationId);
    if (!state) return;

    const conversationKey = deriveConversationKey(
      this.agentId,
      state.conversation.type,
      state.conversation.label,
    );
    const store = loadConversationStore(this.storePath);
    const entry = store[conversationKey];

    if (entry) {
      entry.lastChannel = metadata.channel || entry.lastChannel;
      entry.lastTo = metadata.to || entry.lastTo;
      entry.deliveryContext = {
        channel: metadata.channel || entry.deliveryContext?.channel,
        to: metadata.to || entry.deliveryContext?.to,
        accountId: metadata.accountId || entry.deliveryContext?.accountId,
      };
      entry.origin = {
        channel: metadata.channel || entry.origin?.channel,
        accountId: metadata.accountId || entry.origin?.accountId,
      };
      entry.updatedAt = Date.now();
      await saveConversationStore(this.storePath, store);
    }
  }

  /**
   * Get messages for context, respecting token limits
   * Loads from transcript if needed, prioritizing recent messages
   */
  getMessagesForContext(
    conversationId: ConversationId,
    maxTokens?: number,
    maxMessages: number = 50,
  ): Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestamp: number;
    toolCallId?: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: string;
    }>;
  }> {
    const state = this.conversations.get(conversationId);
    if (!state) return [];

    // If we have messages in memory and no token limit, return recent ones
    if (!maxTokens) {
      return state.messages.slice(-maxMessages);
    }

    // For now, return recent messages (smart token counting can be added later)
    // This is a simple implementation - can be enhanced with actual token counting
    return state.messages.slice(-maxMessages);
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
    const state = this.conversations.get(conversationId);
    if (!state) return;

    const releaseLock = await this.acquireWriteLock(conversationId);
    try {
      const conversationKey = deriveConversationKey(
        this.agentId,
        state.conversation.type,
        state.conversation.label,
      );
      const store = loadConversationStore(this.storePath);
      const entry = store[conversationKey] || {
        conversationId,
        updatedAt: Date.now(),
        createdAt: state.conversation.createdAt,
        displayName: state.conversation.label,
        agentId: this.agentId,
      };

      if (overrides.modelOverride !== undefined) {
        entry.modelOverride = overrides.modelOverride;
      }
      if (overrides.providerOverride !== undefined) {
        entry.providerOverride = overrides.providerOverride;
      }
      if (overrides.temperatureOverride !== undefined) {
        entry.temperatureOverride = overrides.temperatureOverride;
      }
      if (overrides.thinkingLevel !== undefined) {
        entry.thinkingLevel = overrides.thinkingLevel;
      }
      if (overrides.verboseLevel !== undefined) {
        entry.verboseLevel = overrides.verboseLevel;
      }
      if (overrides.reasoningLevel !== undefined) {
        entry.reasoningLevel = overrides.reasoningLevel;
      }
      if (overrides.timeoutSecondsOverride !== undefined) {
        entry.timeoutSecondsOverride = overrides.timeoutSecondsOverride;
      }

      entry.updatedAt = Date.now();
      store[conversationKey] = entry;
      await saveConversationStore(this.storePath, store);
    } finally {
      releaseLock();
    }
  }

  /**
   * Get conversation entry with overrides
   */
  getConversationEntry(conversationId: ConversationId): ConversationEntry | undefined {
    const state = this.conversations.get(conversationId);
    if (!state) return undefined;

    const conversationKey = deriveConversationKey(
      this.agentId,
      state.conversation.type,
      state.conversation.label,
    );
    const store = loadConversationStore(this.storePath);
    return store[conversationKey];
  }
}
