import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createBrowserTool } from "@agents/zuckerman/tools/browser/index.js";
import type { SecurityContext } from "@world/security/types.js";

describe("Browser Tool", () => {
  let tool: ReturnType<typeof createBrowserTool>;
  let mockSecurityContext: SecurityContext | undefined;

  beforeEach(() => {
    tool = createBrowserTool();
    mockSecurityContext = {
      toolPolicy: {
        allow: ["browser"],
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
      expect(tool.definition.name).toBe("browser");
      expect(tool.definition.description).toContain("Chrome");
      expect(tool.definition.description).toContain("CDP");
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
          deny: ["browser"],
        },
        executionPolicy: {
          allowedCommands: [],
          deniedCommands: [],
        },
      };

      const result = await tool.handler(
        { action: "navigate", url: "https://example.com" },
        restrictedContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });

    it("should allow when tool is in allowlist", async () => {
      // Security check should pass - browser may or may not launch successfully
      const result = await tool.handler(
        { action: "navigate", url: "https://example.com" },
        mockSecurityContext,
      );

      // Should not fail on security check
      expect(result.error).not.toContain("not allowed");
      // Browser may succeed or fail, but security should pass
    }, 10000);
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

  describe("Navigate Action", () => {
    it("should require url parameter", async () => {
      const result = await tool.handler(
        { action: "navigate" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("url is required");
    });

    it("should validate url is string", async () => {
      const result = await tool.handler(
        { action: "navigate", url: 123 },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("url is required");
    });
  });

  describe("Snapshot Action", () => {
    it("should default to aria format", async () => {
      // Browser may succeed or fail, but format should be handled correctly
      const result = await tool.handler(
        { action: "snapshot" },
        mockSecurityContext,
      );

      // If it succeeds, should have aria format result
      // If it fails, should not be due to format validation
      if (result.success) {
        expect(result.result.format).toBe("aria");
      } else {
        expect(result.error).not.toContain("format");
      }
    }, 10000);

    it("should accept format parameter", async () => {
      const result = await tool.handler(
        { action: "snapshot", format: "ai" },
        mockSecurityContext,
      );

      // Format should be accepted - error should not mention format
      if (!result.success) {
        expect(result.error).not.toContain("format");
      }
    }, 10000);
  });

  describe("Screenshot Action", () => {
    it("should accept fullPage parameter", async () => {
      const result = await tool.handler(
        { action: "screenshot", fullPage: true },
        mockSecurityContext,
      );

      // fullPage parameter should be accepted
      if (!result.success) {
        expect(result.error).not.toContain("fullPage");
      }
    }, 10000);
  });

  describe("Click Action", () => {
    it("should require selector parameter", async () => {
      const result = await tool.handler(
        { action: "click" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("selector is required");
    });
  });

  describe("Type Action", () => {
    it("should require selector and text parameters", async () => {
      const result1 = await tool.handler(
        { action: "type" },
        mockSecurityContext,
      );
      expect(result1.success).toBe(false);
      expect(result1.error).toContain("selector and text are required");

      const result2 = await tool.handler(
        { action: "type", selector: "#input" },
        mockSecurityContext,
      );
      expect(result2.success).toBe(false);
      expect(result2.error).toContain("selector and text are required");
    });
  });

  describe("Evaluate Action", () => {
    it("should require code parameter", async () => {
      const result = await tool.handler(
        { action: "evaluate" },
        mockSecurityContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("code is required");
    });
  });
});
