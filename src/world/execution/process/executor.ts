import { spawn } from "node:child_process";
import type { ProcessOptions, ProcessResult } from "./types.js";
import { isCommandAllowed, isPathAllowed } from "../security/policy/command-policy.js";
import { executeInSandbox } from "../security/sandbox/manager.js";
import type { SandboxContext } from "../security/types.js";

export async function executeProcess(options: ProcessOptions): Promise<ProcessResult> {
  const { command, args = [], cwd, env, securityContext } = options;

  // Check command security if policy provided
  if (securityContext?.executionPolicy) {
    const commandCheck = isCommandAllowed(command, securityContext.executionPolicy);
    if (!commandCheck.allowed) {
      return {
        stdout: "",
        stderr: `Security error: ${commandCheck.reason}`,
        exitCode: 1,
      };
    }

    // Check path restrictions
    if (cwd && securityContext.executionPolicy.allowedPaths) {
      const pathCheck = isPathAllowed(cwd, securityContext.executionPolicy);
      if (!pathCheck.allowed) {
        return {
          stdout: "",
          stderr: `Security error: ${pathCheck.reason}`,
          exitCode: 1,
        };
      }
    }
  }

  // Execute in sandbox if container name provided
  if (securityContext?.sandboxContainerName) {
    try {
      const sandbox: SandboxContext = {
        containerName: securityContext.sandboxContainerName,
        workspaceDir: cwd || process.cwd(),
        containerWorkdir: "/workspace",
        isRunning: true,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      const timeout = securityContext.executionPolicy?.timeout ?? 30000;
      const result = await Promise.race([
        executeInSandbox(sandbox, command, args, { cwd, env }),
        new Promise<ProcessResult>((_, reject) =>
          setTimeout(() => reject(new Error("Command timeout")), timeout),
        ),
      ]);

      // Check output size limit
      const maxOutput = securityContext.executionPolicy?.maxOutput ?? 10485760; // 10MB
      if (result.stdout.length > maxOutput || result.stderr.length > maxOutput) {
        return {
          stdout: result.stdout.slice(0, maxOutput) + "\n[Output truncated]",
          stderr: result.stderr.slice(0, maxOutput) + "\n[Output truncated]",
          exitCode: result.exitCode,
        };
      }

      return result;
    } catch (err) {
      return {
        stdout: "",
        stderr: err instanceof Error ? err.message : "Sandbox execution failed",
        exitCode: 1,
      };
    }
  }

  // Execute on host
  return new Promise((resolve, reject) => {
    const timeout = securityContext?.executionPolicy?.timeout ?? 30000;
    const maxOutput = securityContext?.executionPolicy?.maxOutput ?? 10485760; // 10MB

    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: true,
    });

    let stdout = "";
    let stderr = "";
    let timeoutId: NodeJS.Timeout | null = null;

    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        proc.kill("SIGTERM");
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);
    }

    proc.stdout?.on("data", (data) => {
      const chunk = data.toString();
      stdout += chunk;
      
      // Check output size limit
      if (stdout.length > maxOutput) {
        proc.kill("SIGTERM");
        reject(new Error(`Output size limit exceeded (${maxOutput} bytes)`));
      }
    });

    proc.stderr?.on("data", (data) => {
      const chunk = data.toString();
      stderr += chunk;
      
      // Check output size limit
      if (stderr.length > maxOutput) {
        proc.kill("SIGTERM");
        reject(new Error(`Output size limit exceeded (${maxOutput} bytes)`));
      }
    });

    proc.on("close", (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve({
        stdout: stdout.slice(0, maxOutput),
        stderr: stderr.slice(0, maxOutput),
        exitCode: code ?? 0,
      });
    });

    proc.on("error", (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(err);
    });
  });
}
