import { executeProcess } from "@server/world/execution/process/index.js";
import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";

const terminalToolInputSchema = z.object({
  command: z.string().describe("The shell command to execute. Can be a simple command or a full shell command with arguments, pipes, redirects, etc. If a required tool isn't available, install it first (e.g., 'brew install imagemagick', 'brew install wget', etc.)."),
  args: z.array(z.string()).optional().describe("Command arguments (optional). Usually not needed - include arguments in the 'command' string instead."),
  cwd: z.string().optional().describe("Working directory (optional). If not specified, uses current working directory."),
  timeout: z.number().describe("Timeout in milliseconds. You MUST always specify a timeout value to prevent commands from hanging indefinitely. Consider the expected duration of the command and add appropriate buffer time. For quick commands (ls, cat, grep), use 5000-10000ms. For longer operations (builds, installs), use 300000-600000ms (5-10 minutes)."),
});

type TerminalToolInput = z.infer<typeof terminalToolInputSchema>;

export const terminalTool = tool<TerminalToolInput, string>({
  description: "Execute any shell command with full control over the computer. This is your primary tool for system operations - use it for everything: file operations (grep, find, ls, cat, etc.), package management (brew, apt, npm, etc.), process management, network operations, text processing, and any other command-line task. You have complete terminal access - use it to accomplish any task that requires system-level operations. Install tools, run scripts, search files, manipulate data, and control the system as needed.",
  inputSchema: zodSchema(terminalToolInputSchema),
  execute: async (params) => {
    try {
      const { command, args, cwd, timeout } = params;

      const result = await executeProcess({
        command,
        args: args ? args.map(String) : undefined,
        cwd: cwd,
        securityContext: {
          executionPolicy: {
            timeout,
          },
        },
      });

      return JSON.stringify({
        success: result.exitCode === 0,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        error: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
      });
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});
