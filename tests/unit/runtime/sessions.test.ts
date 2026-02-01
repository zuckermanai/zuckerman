import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionManager } from "@agents/zuckerman/sessions/index.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("SessionManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "zuckerman-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should create a session", () => {
    const manager = new SessionManager("test-agent", tempDir);
    const session = manager.createSession("test-session", "main");

    expect(session).toHaveProperty("id");
    expect(session.label).toBe("test-session");
    expect(session.type).toBe("main");
    expect(session.createdAt).toBeGreaterThan(0);
    expect(session.lastActivity).toBeGreaterThan(0);
  });

  it("should retrieve a session", () => {
    const manager = new SessionManager("test-agent", tempDir);
    const session = manager.createSession("test", "main");
    const state = manager.getSession(session.id);

    expect(state).toBeDefined();
    expect(state?.session.id).toBe(session.id);
    expect(state?.messages).toEqual([]);
  });

  it("should list all sessions", () => {
    const manager = new SessionManager("test-agent", tempDir);
    manager.createSession("session-1", "main");
    manager.createSession("session-2", "group");

    const sessions = manager.listSessions();
    expect(sessions.length).toBe(2);
  });

  it("should add messages to a session", async () => {
    const manager = new SessionManager("test-agent", tempDir);
    const session = manager.createSession("test", "main");

    await manager.addMessage(session.id, "user", "Hello");
    await manager.addMessage(session.id, "assistant", "Hi there");

    const state = manager.getSession(session.id);
    expect(state?.messages.length).toBe(2);
    expect(state?.messages[0].role).toBe("user");
    expect(state?.messages[0].content).toBe("Hello");
    expect(state?.messages[1].role).toBe("assistant");
    expect(state?.messages[1].content).toBe("Hi there");
  });

  it("should update activity timestamp", () => {
    const manager = new SessionManager("test-agent", tempDir);
    const session = manager.createSession("test", "main");
    const originalActivity = session.lastActivity;

    // Wait a bit
    const waitMs = 10;
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        manager.updateActivity(session.id);
        const state = manager.getSession(session.id);
        expect(state?.session.lastActivity).toBeGreaterThan(originalActivity);
        resolve();
      }, waitMs);
    });
  });

  it("should delete a session", () => {
    const manager = new SessionManager("test-agent", tempDir);
    const session = manager.createSession("test", "main");

    const deleted = manager.deleteSession(session.id);
    expect(deleted).toBe(true);

    const state = manager.getSession(session.id);
    expect(state).toBeUndefined();
  });

  it("should get or create main session", () => {
    const manager = new SessionManager("test-agent", tempDir);
    
    // First call should create
    const session1 = manager.getOrCreateMainSession();
    expect(session1.type).toBe("main");

    // Second call should return the same
    const session2 = manager.getOrCreateMainSession();
    expect(session2.id).toBe(session1.id);
  });
});
