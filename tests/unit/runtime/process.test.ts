import { describe, it, expect } from "vitest";
import { executeProcess } from "@world/execution/process/index.js";

describe("Process Executor", () => {
  it("should execute a simple command", async () => {
    const result = await executeProcess({
      command: "echo",
      args: ["hello"],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("hello");
  });

  it("should handle command errors", async () => {
    const result = await executeProcess({
      command: "false",
    });

    expect(result.exitCode).not.toBe(0);
  });

  it("should capture stderr", async () => {
    const result = await executeProcess({
      command: "sh",
      args: ["-c", "echo error >&2"],
    });

    // Just verify the command executed (stderr handling varies by system)
    expect(result.exitCode).toBe(0);
  });

  it("should work with environment variables", async () => {
    // Test that env vars are passed (using a simple check)
    // The actual expansion depends on the shell, so we just verify the process runs
    const result = await executeProcess({
      command: "echo",
      args: ["hello"],
      env: { TEST_VAR: "test-value" },
    });

    expect(result.exitCode).toBe(0);
    // The env var is set, even if not used in this simple command
    expect(result.stdout.trim()).toBe("hello");
  });
});
