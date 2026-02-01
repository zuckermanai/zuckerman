import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createCronTool } from "@agents/zuckerman/tools/cron/index.js";
import type { SecurityContext } from "@world/security/types.js";
import { readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CRON_DIR = join(homedir(), ".zuckerman", "cron");
const JOBS_FILE = join(CRON_DIR, "jobs.json");

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

    // Clean up test jobs file
    if (existsSync(JOBS_FILE)) {
      unlinkSync(JOBS_FILE);
    }
  });

  afterEach(() => {
    // Clean up test jobs file
    if (existsSync(JOBS_FILE)) {
      unlinkSync(JOBS_FILE);
    }
    vi.clearAllMocks();
  });

  describe("Tool Definition", () => {
    it("should have correct name and description", () => {
      expect(tool.definition.name).toBe("cron");
      expect(tool.definition.description).toContain("scheduled");
      expect(tool.definition.description).toContain("cron jobs");
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
      expect(result.result).toHaveProperty("jobsCount");
      expect(result.result).toHaveProperty("activeJobs");
    });
  });

  describe("List Action", () => {
    it("should return empty list initially", async () => {
      const result = await tool.handler(
        { action: "list" },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("jobs");
      expect(Array.isArray(result.result.jobs)).toBe(true);
    });

    it("should list added jobs", async () => {
      // Add a job first
      const addResult = await tool.handler(
        {
          action: "add",
          job: {
            name: "Test Job",
            schedule: {
              kind: "every",
              everyMs: 60000,
            },
            payload: {
              kind: "systemEvent",
              text: "Test event",
            },
            sessionTarget: "main",
          },
        },
        mockSecurityContext,
      );

      expect(addResult.success).toBe(true);

      // List jobs
      const listResult = await tool.handler(
        { action: "list" },
        mockSecurityContext,
      );

      expect(listResult.success).toBe(true);
      expect(listResult.result.jobs.length).toBeGreaterThan(0);
      expect(listResult.result.jobs[0].name).toBe("Test Job");
    });
  });

  describe("Add Action", () => {
    it("should require job object", async () => {
      const result = await tool.handler(
        { action: "add" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("job object");
    });

    it("should require schedule, payload, and sessionTarget", async () => {
      const result = await tool.handler(
        {
          action: "add",
          job: {
            name: "Test",
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("schedule");
    });

    it("should create job with 'at' schedule", async () => {
      const atMs = Date.now() + 60000; // 1 minute from now
      const result = await tool.handler(
        {
          action: "add",
          job: {
            name: "One-shot Job",
            schedule: {
              kind: "at",
              atMs,
            },
            payload: {
              kind: "systemEvent",
              text: "Test",
            },
            sessionTarget: "main",
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("jobId");
      expect(result.result.job.name).toBe("One-shot Job");
    });

    it("should create job with 'every' schedule", async () => {
      const result = await tool.handler(
        {
          action: "add",
          job: {
            name: "Recurring Job",
            schedule: {
              kind: "every",
              everyMs: 60000,
            },
            payload: {
              kind: "agentTurn",
              message: "Do something",
            },
            sessionTarget: "isolated",
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result.job.schedule.kind).toBe("every");
    });

    it("should create job with 'cron' schedule", async () => {
      const result = await tool.handler(
        {
          action: "add",
          job: {
            name: "Cron Job",
            schedule: {
              kind: "cron",
              expr: "0 * * * *",
            },
            payload: {
              kind: "systemEvent",
              text: "Hourly check",
            },
            sessionTarget: "main",
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result.job.schedule.kind).toBe("cron");
    });

    it("should persist jobs to disk", async () => {
      const result = await tool.handler(
        {
          action: "add",
          job: {
            name: "Persistent Job",
            schedule: {
              kind: "every",
              everyMs: 60000,
            },
            payload: {
              kind: "systemEvent",
              text: "Test",
            },
            sessionTarget: "main",
          },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);

      // Check file exists and contains the job
      expect(existsSync(JOBS_FILE)).toBe(true);
      const data = JSON.parse(readFileSync(JOBS_FILE, "utf-8"));
      expect(data.some((j: any) => j.name === "Persistent Job")).toBe(true);
    });
  });

  describe("Update Action", () => {
    it("should require jobId and patch", async () => {
      const result = await tool.handler(
        { action: "update" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("jobId and patch");
    });

    it("should update existing job", async () => {
      // Add a job first
      const addResult = await tool.handler(
        {
          action: "add",
          job: {
            name: "Original Name",
            schedule: {
              kind: "every",
              everyMs: 60000,
            },
            payload: {
              kind: "systemEvent",
              text: "Test",
            },
            sessionTarget: "main",
          },
        },
        mockSecurityContext,
      );

      const jobId = addResult.result.jobId;

      // Update the job
      const updateResult = await tool.handler(
        {
          action: "update",
          jobId,
          patch: {
            name: "Updated Name",
            enabled: false,
          },
        },
        mockSecurityContext,
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.result.job.name).toBe("Updated Name");
      expect(updateResult.result.job.enabled).toBe(false);
    });

    it("should reject update for non-existent job", async () => {
      const result = await tool.handler(
        {
          action: "update",
          jobId: "non-existent",
          patch: { name: "Test" },
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("Remove Action", () => {
    it("should require jobId", async () => {
      const result = await tool.handler(
        { action: "remove" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("jobId is required");
    });

    it("should remove existing job", async () => {
      // Add a job first
      const addResult = await tool.handler(
        {
          action: "add",
          job: {
            name: "To Remove",
            schedule: {
              kind: "every",
              everyMs: 60000,
            },
            payload: {
              kind: "systemEvent",
              text: "Test",
            },
            sessionTarget: "main",
          },
        },
        mockSecurityContext,
      );

      const jobId = addResult.result.jobId;

      // Remove the job
      const removeResult = await tool.handler(
        { action: "remove", jobId },
        mockSecurityContext,
      );

      expect(removeResult.success).toBe(true);

      // Verify it's gone
      const listResult = await tool.handler(
        { action: "list" },
        mockSecurityContext,
      );
      expect(listResult.result.jobs.find((j: any) => j.id === jobId)).toBeUndefined();
    });
  });

  describe("Run Action", () => {
    it("should require jobId", async () => {
      const result = await tool.handler(
        { action: "run" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("jobId is required");
    });

    it("should execute existing job", async () => {
      // Add a job first
      const addResult = await tool.handler(
        {
          action: "add",
          job: {
            name: "Test Run",
            schedule: {
              kind: "every",
              everyMs: 60000,
            },
            payload: {
              kind: "systemEvent",
              text: "Test execution",
            },
            sessionTarget: "main",
          },
        },
        mockSecurityContext,
      );

      const jobId = addResult.result.jobId;

      // Run the job
      const runResult = await tool.handler(
        { action: "run", jobId },
        mockSecurityContext,
      );

      expect(runResult.success).toBe(true);
      expect(runResult.result.executed).toBe(true);
    });
  });
});
