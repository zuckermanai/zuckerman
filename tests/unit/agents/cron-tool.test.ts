import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCronTool } from "@agents/zuckerman/tools/cron/index.js";
import type { SecurityContext } from "@world/security/types.js";
import { readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { getCalendarEventsFile } from "@server/world/homedir/paths.js";

const EVENTS_FILE = getCalendarEventsFile();

describe("Cron Tool", () => {
  let tool: ReturnType<typeof createCronTool>;
  let mockSecurityContext: SecurityContext | undefined;

  beforeEach(() => {
    tool = createCronTool();
    mockSecurityContext = {
      toolPolicy: {
        allow: ["cron"],
        deny: [],
      },
      executionPolicy: {
        allowedCommands: [],
        deniedCommands: [],
      },
    };

    // Clean up test events file
    if (existsSync(EVENTS_FILE)) {
      unlinkSync(EVENTS_FILE);
    }
  });

  afterEach(() => {
    // Clean up test events file
    if (existsSync(EVENTS_FILE)) {
      unlinkSync(EVENTS_FILE);
    }
    vi.clearAllMocks();
  });

  describe("Tool Definition", () => {
    it("should have correct name and description", () => {
      expect(tool.definition.name).toBe("cron");
      expect(tool.definition.description).toContain("calendar");
      expect(tool.definition.description).toContain("events");
    });

    it("should have required action parameter", () => {
      const params = tool.definition.parameters;
      expect(params.required).toContain("action");
      expect(params.properties.action).toBeDefined();
    });
  });

  describe("Security", () => {
    it("should reject when tool is not allowed", async () => {
      const restrictedContext: SecurityContext = {
        toolPolicy: {
          allow: [],
          deny: ["cron"],
        },
        executionPolicy: {
          allowedCommands: [],
          deniedCommands: [],
        },
      };

      const result = await tool.handler(
        { action: "status" },
        restrictedContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });
  });

  describe("Status Action", () => {
    it("should return scheduler status", async () => {
      const result = await tool.handler(
        { action: "status" },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("enabled");
      expect(result.result).toHaveProperty("eventsCount");
      expect(result.result).toHaveProperty("activeEvents");
      expect(result.result).toHaveProperty("upcomingEvents");
    });
  });

  describe("List Action", () => {
    it("should return empty list initially", async () => {
      const result = await tool.handler(
        { action: "list" },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("events");
      expect(Array.isArray(result.result.events)).toBe(true);
    });

    it("should list created events", async () => {
      // Create an event first
      const createResult = await tool.handler(
        {
          action: "create",
          event: {
            title: "Test Event",
            startTime: Date.now() + 60000,
            action: {
              type: "systemEvent",
              actionMessage: "Test event",
            },
            recurrence: {
              type: "cron",
              cronExpression: "*/5 * * * *",
            },
          },
        },
        mockSecurityContext,
      );

      expect(createResult.success).toBe(true);

      // List events
      const listResult = await tool.handler(
        { action: "list" },
        mockSecurityContext,
      );

      expect(listResult.success).toBe(true);
      expect(listResult.result.events.length).toBeGreaterThan(0);
      expect(listResult.result.events[0].title).toBe("Test Event");
    });
  });

  describe("Create Action", () => {
    it("should require event object", async () => {
      const result = await tool.handler(
        { action: "create" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("event object");
    });

    it("should require startTime and action", async () => {
      const result = await tool.handler(
        {
          action: "create",
          event: {
            title: "Test",
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("startTime");
    });

    it("should require actionMessage in action", async () => {
      const result = await tool.handler(
        {
          action: "create",
          event: {
            startTime: Date.now() + 60000,
            action: {
              type: "systemEvent",
            },
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("actionMessage");
    });

    it("should create one-time event", async () => {
      const startTime = Date.now() + 60000; // 1 minute from now
      const result = await tool.handler(
        {
          action: "create",
          event: {
            title: "One-shot Event",
            startTime,
            action: {
              type: "systemEvent",
              actionMessage: "Test",
            },
            recurrence: {
              type: "none",
            },
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("eventId");
      expect(result.result.event.title).toBe("One-shot Event");
    });

    it("should create recurring event with cron expression", async () => {
      const result = await tool.handler(
        {
          action: "create",
          event: {
            title: "Recurring Event",
            startTime: Date.now(),
            action: {
              type: "agentTurn",
              actionMessage: "Do something",
              conversationTarget: "isolated",
            },
            recurrence: {
              type: "cron",
              cronExpression: "*/5 * * * *",
            },
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result.event.recurrence?.type).toBe("cron");
      expect(result.result.event.recurrence?.cronExpression).toBe("*/5 * * * *");
    });

    it("should create event with daily recurrence", async () => {
      const result = await tool.handler(
        {
          action: "create",
          event: {
            title: "Daily Event",
            startTime: Date.now(),
            action: {
              type: "systemEvent",
              actionMessage: "Daily check",
            },
            recurrence: {
              type: "daily",
            },
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result.event.recurrence?.type).toBe("daily");
    });

    it("should persist events to disk", async () => {
      const result = await tool.handler(
        {
          action: "create",
          event: {
            title: "Persistent Event",
            startTime: Date.now() + 60000,
            action: {
              type: "systemEvent",
              actionMessage: "Test",
            },
            recurrence: {
              type: "cron",
              cronExpression: "*/5 * * * *",
            },
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);

      // Check file exists and contains the event
      expect(existsSync(EVENTS_FILE)).toBe(true);
      const data = JSON.parse(readFileSync(EVENTS_FILE, "utf-8"));
      expect(data.some((e: any) => e.title === "Persistent Event")).toBe(true);
    });
  });

  describe("Update Action", () => {
    it("should require eventId and patch", async () => {
      const result = await tool.handler(
        { action: "update" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("eventId");
    });

    it("should update existing event", async () => {
      // Create an event first
      const createResult = await tool.handler(
        {
          action: "create",
          event: {
            title: "Original Name",
            startTime: Date.now() + 60000,
            action: {
              type: "systemEvent",
              actionMessage: "Test",
            },
            recurrence: {
              type: "cron",
              cronExpression: "*/5 * * * *",
            },
          },
        },
        mockSecurityContext,
      );

      const eventId = createResult.result.eventId;

      // Update the event
      const updateResult = await tool.handler(
        {
          action: "update",
          eventId,
          patch: {
            title: "Updated Name",
            enabled: false,
          },
        },
        mockSecurityContext,
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.result.event.title).toBe("Updated Name");
      expect(updateResult.result.event.enabled).toBe(false);
    });

    it("should reject update for non-existent event", async () => {
      const result = await tool.handler(
        {
          action: "update",
          eventId: "non-existent",
          patch: { title: "Test" },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("Delete Action", () => {
    it("should require eventId", async () => {
      const result = await tool.handler(
        { action: "delete" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("eventId is required");
    });

    it("should delete existing event", async () => {
      // Create an event first
      const createResult = await tool.handler(
        {
          action: "create",
          event: {
            title: "To Remove",
            startTime: Date.now() + 60000,
            action: {
              type: "systemEvent",
              actionMessage: "Test",
            },
            recurrence: {
              type: "cron",
              cronExpression: "*/5 * * * *",
            },
          },
        },
        mockSecurityContext,
      );

      const eventId = createResult.result.eventId;

      // Delete the event
      const deleteResult = await tool.handler(
        { action: "delete", eventId },
        mockSecurityContext,
      );

      expect(deleteResult.success).toBe(true);

      // Verify it's gone
      const listResult = await tool.handler(
        { action: "list" },
        mockSecurityContext,
      );
      expect(listResult.result.events.find((e: any) => e.id === eventId)).toBeUndefined();
    });
  });

  describe("Trigger Action", () => {
    it("should require eventId", async () => {
      const result = await tool.handler(
        { action: "trigger" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("eventId is required");
    });

    it("should trigger existing event", async () => {
      // Create an event first
      const createResult = await tool.handler(
        {
          action: "create",
          event: {
            title: "Test Trigger",
            startTime: Date.now() + 60000,
            action: {
              type: "systemEvent",
              actionMessage: "Test execution",
            },
            recurrence: {
              type: "cron",
              cronExpression: "*/5 * * * *",
            },
          },
        },
        mockSecurityContext,
      );

      const eventId = createResult.result.eventId;

      // Trigger the event
      const triggerResult = await tool.handler(
        { action: "trigger", eventId },
        mockSecurityContext,
      );

      expect(triggerResult.success).toBe(true);
      expect(triggerResult.result.triggered).toBe(true);
    });
  });
});
