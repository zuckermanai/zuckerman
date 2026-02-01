import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  Session,
  SessionId,
  SessionKey,
  SessionLabel,
  SessionType,
  SessionState,
  SessionEntry,
} from "./types.js";
import {
  loadSessionStore,
  saveSessionStore,
  resolveSessionStorePath,
} from "./store.js";
import {
  appendTranscriptEntry,
  loadTranscript,
  resolveTranscriptPath,
  messagesToTranscriptEntries,
} from "./transcript.js";

/**
 * Derive session key from agent ID and session type/label
 */
export function deriveSessionKey(
  agentId: string,
  type: SessionType,
  label?: SessionLabel,
): SessionKey {
  if (type === "main") {
    return `agent:${agentId}:main`;
  }
  if (type === "group" || type === "channel") {
    return `agent:${agentId}:${type}:${label || "default"}`;
  }
  return `agent:${agentId}:${label || "default"}`;
}

export class SessionManager {
  private sessions = new Map<SessionId, SessionState>();
  private storePath: string;
  private stateDir: string;
  private agentId: string;
  private writeLocks = new Map<SessionId, Promise<void>>();

  constructor(agentId: string, stateDir?: string) {
    this.agentId = agentId;
    this.stateDir = stateDir || join(homedir(), ".zuckerman");
    this.storePath = resolveSessionStorePath(agentId, this.stateDir);
    this.loadSessions();
  }

  /**
   * Load sessions from persistent store
   */
  private loadSessions(): void {
    try {
      const store = loadSessionStore(this.storePath);
      for (const [sessionKey, entry] of Object.entries(store)) {
        // Load transcript for this session
        const transcriptPath = resolveTranscriptPath(
          this.agentId,
          entry.sessionId,
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

        const session: Session = {
          id: entry.sessionId,
          label: entry.displayName || sessionKey,
          type: this.inferSessionType(sessionKey),
          createdAt: entry.createdAt || entry.updatedAt,
          lastActivity: entry.updatedAt,
          agentId: entry.agentId || this.agentId,
        };

        const state: SessionState = {
          session,
          messages,
        };

        this.sessions.set(entry.sessionId, state);
      }
    } catch (error) {
      console.warn(`Failed to load sessions for agent ${this.agentId}:`, error);
    }
  }

  /**
   * Infer session type from session key
   */
  private inferSessionType(sessionKey: SessionKey): SessionType {
    if (sessionKey.includes(":main")) return "main";
    if (sessionKey.includes(":group:")) return "group";
    if (sessionKey.includes(":channel:")) return "channel";
    return "main";
  }

  /**
   * Acquire write lock for a session
   */
  private async acquireWriteLock(sessionId: SessionId): Promise<() => void> {
    const existingLock = this.writeLocks.get(sessionId);
    if (existingLock) {
      await existingLock;
    }

    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.writeLocks.set(sessionId, lockPromise);

    return () => {
      releaseLock();
      this.writeLocks.delete(sessionId);
    };
  }

  /**
   * Persist sessions to disk (only metadata, not transcripts)
   */
  private async persistSessions(): Promise<void> {
    const store: Record<SessionKey, SessionEntry> = {};
    const existingStore = loadSessionStore(this.storePath);

    for (const [sessionId, state] of this.sessions.entries()) {
      const sessionKey = deriveSessionKey(
        this.agentId,
        state.session.type,
        state.session.label,
      );

      // Update or create session entry
      const existing = existingStore[sessionKey];
      const entry: SessionEntry = {
        sessionId,
        updatedAt: state.session.lastActivity,
        createdAt: existing?.createdAt || state.session.createdAt,
        displayName: state.session.label,
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

      store[sessionKey] = entry;
    }

    await saveSessionStore(this.storePath, store);
  }

  /**
   * Update token counts for a session
   */
  async updateTokenCounts(
    sessionId: SessionId,
    counts: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      contextTokens?: number;
    },
  ): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (!state) return;

    const store = loadSessionStore(this.storePath);
    const sessionKey = deriveSessionKey(
      this.agentId,
      state.session.type,
      state.session.label,
    );

    const entry = store[sessionKey];
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

      await saveSessionStore(this.storePath, store);
    }
  }

  createSession(
    label: SessionLabel,
    type: SessionType = "main",
    agentId?: string,
  ): Session {
    const id = randomUUID();
    const now = Date.now();

    const session: Session = {
      id,
      label,
      type,
      createdAt: now,
      lastActivity: now,
      agentId: agentId || this.agentId,
    };

    const state: SessionState = {
      session,
      messages: [],
    };

    this.sessions.set(id, state);
    this.persistSessions().catch((err) => {
      console.error("Failed to persist session:", err);
    });

    return session;
  }

  getSession(id: SessionId): SessionState | undefined {
    return this.sessions.get(id);
  }

  updateActivity(id: SessionId): void {
    const state = this.sessions.get(id);
    if (state) {
      state.session.lastActivity = Date.now();
      this.persistSessions().catch((err) => {
        console.error("Failed to persist session update:", err);
      });
    }
  }

  async addMessage(
    id: SessionId,
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
    const state = this.sessions.get(id);
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
      state.session.lastActivity = Date.now();

      // Get existing session entry to check lastTranscriptId
      const sessionKey = deriveSessionKey(
        this.agentId,
        state.session.type,
        state.session.label,
      );
      const store = loadSessionStore(this.storePath);
      const entry = store[sessionKey];

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

        // Update lastTranscriptId in session entry
        if (entry) {
          entry.lastTranscriptId = transcriptEntry.id;
          entry.updatedAt = Date.now();
          await saveSessionStore(this.storePath, store);
        } else {
          // Create new entry if it doesn't exist
          const newSessionEntry: SessionEntry = {
            sessionId: id,
            updatedAt: Date.now(),
            createdAt: state.session.createdAt,
            displayName: state.session.label,
            agentId: this.agentId,
            lastTranscriptId: transcriptEntry.id,
          };
          store[sessionKey] = newSessionEntry;
          await saveSessionStore(this.storePath, store);
        }
      }
    } finally {
      releaseLock();
    }
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values()).map((state) => state.session);
  }

  deleteSession(id: SessionId): boolean {
    const deleted = this.sessions.delete(id);
    if (deleted) {
      this.persistSessions().catch((err) => {
        console.error("Failed to persist session deletion:", err);
      });
    }
    return deleted;
  }

  getOrCreateMainSession(agentId?: string): Session {
    // Find existing main session
    for (const state of this.sessions.values()) {
      if (state.session.type === "main") {
        return state.session;
      }
    }

    // Create new main session
    return this.createSession("main", "main", agentId);
  }

  /**
   * Get session entry from store by session key
   */
  getSessionEntryByKey(sessionKey: SessionKey): SessionEntry | undefined {
    const store = loadSessionStore(this.storePath);
    return store[sessionKey];
  }

  /**
   * Get all session entries
   */
  getAllSessionEntries(): Record<SessionKey, SessionEntry> {
    return loadSessionStore(this.storePath);
  }

  /**
   * Get messages for context, respecting token limits
   * Loads from transcript if needed, prioritizing recent messages
   */
  getMessagesForContext(
    sessionId: SessionId,
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
    const state = this.sessions.get(sessionId);
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
   * Set session overrides (model, provider, thinking level, etc.)
   */
  async setSessionOverrides(
    sessionId: SessionId,
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
    const state = this.sessions.get(sessionId);
    if (!state) return;

    const releaseLock = await this.acquireWriteLock(sessionId);
    try {
      const sessionKey = deriveSessionKey(
        this.agentId,
        state.session.type,
        state.session.label,
      );
      const store = loadSessionStore(this.storePath);
      const entry = store[sessionKey] || {
        sessionId,
        updatedAt: Date.now(),
        createdAt: state.session.createdAt,
        displayName: state.session.label,
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
      store[sessionKey] = entry;
      await saveSessionStore(this.storePath, store);
    } finally {
      releaseLock();
    }
  }

  /**
   * Get session entry with overrides
   */
  getSessionEntry(sessionId: SessionId): SessionEntry | undefined {
    const state = this.sessions.get(sessionId);
    if (!state) return undefined;

    const sessionKey = deriveSessionKey(
      this.agentId,
      state.session.type,
      state.session.label,
    );
    const store = loadSessionStore(this.storePath);
    return store[sessionKey];
  }
}
