import { executeProcess } from "@world/execution/process/index.js";
import type { SecurityContext } from "@world/execution/security/types.js";
import { isToolAllowed } from "@world/execution/security/policy/tool-policy.js";
import { isCommandAllowed } from "@world/execution/security/policy/command-policy.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      items?: { type: string };
      [key: string]: unknown; // Allow additional JSON Schema properties
    }>;
    required?: string[];
  };
}

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface Tool {
  definition: ToolDefinition;
  handler: (
    params: Record<string, unknown>,
    securityContext?: SecurityContext,
  ) => Promise<ToolResult> | ToolResult;
}

export function createTerminalTool(): Tool {
  return {
    definition: {
      name: "terminal",
      description: "Execute a terminal command and return the output",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The command to execute",
          },
          args: {
            type: "array",
            description: "Command arguments",
            items: {
              type: "string",
            },
          },
          cwd: {
            type: "string",
            description: "Working directory",
          },
        },
        required: ["command"],
      },
    },
    handler: async (params, securityContext) => {
      try {
        const { command, args, cwd } = params;
        
        if (typeof command !== "string") {
          return {
            success: false,
            error: "command must be a string",
          };
        }

        // Check tool security
        if (securityContext) {
          const toolAllowed = isToolAllowed("terminal", securityContext.toolPolicy);
          if (!toolAllowed) {
            return {
              success: false,
              error: "Terminal tool is not allowed by security policy",
            };
          }

          // Check command security
          const commandCheck = isCommandAllowed(command, securityContext.executionPolicy);
          if (!commandCheck.allowed) {
            return {
              success: false,
              error: `Security error: ${commandCheck.reason}`,
            };
          }
        }

        const result = await executeProcess({
          command,
          args: Array.isArray(args) ? args.map(String) : undefined,
          cwd: typeof cwd === "string" ? cwd : undefined,
          securityContext: securityContext
            ? {
                executionPolicy: securityContext.executionPolicy,
                sandboxContainerName: securityContext.sandboxContainerName,
              }
            : undefined,
        });

        return {
          success: result.exitCode === 0,
          result: {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
          },
          error: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
  };
}
