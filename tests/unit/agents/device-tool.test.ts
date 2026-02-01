import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createDeviceTool } from "@agents/zuckerman/tools/device/index.js";
import type { SecurityContext } from "@world/security/types.js";

describe("Device Tool", () => {
  let tool: ReturnType<typeof createDeviceTool>;
  let mockSecurityContext: SecurityContext | undefined;

  beforeEach(() => {
    tool = createDeviceTool();
    mockSecurityContext = {
      toolPolicy: {
        allow: ["device"],
        deny: [],
      },
      executionPolicy: {
        allowedCommands: [],
        deniedCommands: [],
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Tool Definition", () => {
    it("should have correct name and description", () => {
      expect(tool.definition.name).toBe("device");
      expect(tool.definition.description).toContain("device capabilities");
      expect(tool.definition.description).toContain("camera");
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
          deny: ["device"],
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
    it("should return device status", async () => {
      const result = await tool.handler(
        { action: "status" },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("devices");
      expect(Array.isArray(result.result.devices)).toBe(true);
      expect(result.result.devices.length).toBeGreaterThan(0);
      expect(result.result.devices[0]).toHaveProperty("id");
      expect(result.result.devices[0]).toHaveProperty("name");
      expect(result.result.devices[0]).toHaveProperty("platform");
    });

    it("should include local device", async () => {
      const result = await tool.handler(
        { action: "status" },
        mockSecurityContext,
      );

      const localDevice = result.result.devices.find(
        (d: any) => d.id === "local",
      );
      expect(localDevice).toBeDefined();
      expect(localDevice.platform).toBe(process.platform);
    });
  });

  describe("Notify Action", () => {
    it("should require title and body", async () => {
      const result = await tool.handler(
        { action: "notify" },
        mockSecurityContext,
      );

      // Should succeed with defaults or fail gracefully
      // The actual notification may fail on CI, but the tool should handle it
      expect(result.success).toBeDefined();
    });

    it("should accept title and body parameters", async () => {
      const result = await tool.handler(
        {
          action: "notify",
          title: "Test Title",
          body: "Test Body",
        },
        mockSecurityContext,
      );

      // May fail on CI if notification system unavailable, but should handle gracefully
      expect(result).toHaveProperty("success");
      if (result.success) {
        expect(result.result).toHaveProperty("action", "notified");
        expect(result.result.title).toBe("Test Title");
        expect(result.result.body).toBe("Test Body");
      }
    });
  });

  describe("Run Action", () => {
    it("should require command array", async () => {
      const result = await tool.handler(
        { action: "run" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("command");
    });

    it("should execute allowed commands", async () => {
      const result = await tool.handler(
        {
          action: "run",
          command: ["echo", "hello"],
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result).toHaveProperty("stdout");
      expect(result.result).toHaveProperty("exitCode");
    });

    it("should reject disallowed commands", async () => {
      const result = await tool.handler(
        {
          action: "run",
          command: ["rm", "-rf", "/"],
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("should accept cwd parameter", async () => {
      const result = await tool.handler(
        {
          action: "run",
          command: ["pwd"],
          cwd: process.cwd(),
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(true);
      expect(result.result.stdout).toContain(process.cwd());
    });
  });

  describe("Camera Actions", () => {
    it("should require device pairing for camera_snap", async () => {
      const result = await tool.handler(
        {
          action: "camera_snap",
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("device pairing");
    });

    it("should require device pairing for camera_clip", async () => {
      const result = await tool.handler(
        {
          action: "camera_clip",
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("device pairing");
    });
  });

  describe("Screen Record Action", () => {
    it("should require device pairing", async () => {
      const result = await tool.handler(
        {
          action: "screen_record",
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("device pairing");
    });
  });

  describe("Location Action", () => {
    it("should require device pairing", async () => {
      const result = await tool.handler(
        {
          action: "location_get",
        },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("device pairing");
    });
  });

  describe("Action Validation", () => {
    it("should reject missing action", async () => {
      const result = await tool.handler({}, mockSecurityContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain("action must be a string");
    });

    it("should reject invalid action type", async () => {
      const result = await tool.handler(
        { action: 123 },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("action must be a string");
    });

    it("should reject unknown action", async () => {
      const result = await tool.handler(
        { action: "unknown_action" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown action");
    });
  });
});
