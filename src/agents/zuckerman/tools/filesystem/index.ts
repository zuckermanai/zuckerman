import fs from "node:fs/promises";
import path from "node:path";
import { glob as globFn } from "glob";
import type { SecurityContext } from "@world/execution/security/types.js";
import { isToolAllowed } from "@world/execution/security/policy/tool-policy.js";
import type { Tool, ToolDefinition, ToolResult } from "../terminal/index.js";

export function createFilesystemTool(): Tool {
  return {
    definition: {
      name: "filesystem",
      description: "Perform file system operations: list directories, read files, write files, and search for files using glob patterns",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            description: "The operation to perform: 'list_dir', 'read_file', 'write_file', or 'glob'",
            enum: ["list_dir", "read_file", "write_file", "glob"],
          },
          path: {
            type: "string",
            description: "File or directory path (required for list_dir, read_file, write_file)",
          },
          pattern: {
            type: "string",
            description: "Glob pattern for searching files (required for glob operation)",
          },
          content: {
            type: "string",
            description: "Content to write to file (required for write_file operation)",
          },
          encoding: {
            type: "string",
            description: "File encoding (default: 'utf8' for text, 'base64' for binary)",
            enum: ["utf8", "base64"],
          },
        },
        required: ["operation"],
      },
    },
    handler: async (params, securityContext) => {
      try {
        const { operation, path: filePath, pattern, content, encoding = "utf8" } = params;

        if (typeof operation !== "string") {
          return {
            success: false,
            error: "operation must be a string",
          };
        }

        // Check tool security
        if (securityContext) {
          const toolAllowed = isToolAllowed("filesystem", securityContext.toolPolicy);
          if (!toolAllowed) {
            return {
              success: false,
              error: "Filesystem tool is not allowed by security policy",
            };
          }
        }

        switch (operation) {
          case "list_dir": {
            if (!filePath || typeof filePath !== "string") {
              return {
                success: false,
                error: "path is required for list_dir operation",
              };
            }

            try {
              const resolvedPath = filePath.startsWith("~")
                ? filePath.replace("~", process.env.HOME || "")
                : path.resolve(filePath);

              const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
              const result = entries.map((entry) => ({
                name: entry.name,
                type: entry.isDirectory() ? "directory" : "file",
                path: path.join(resolvedPath, entry.name),
              }));

              return {
                success: true,
                result: {
                  path: resolvedPath,
                  entries: result,
                },
              };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to list directory",
              };
            }
          }

          case "read_file": {
            if (!filePath || typeof filePath !== "string") {
              return {
                success: false,
                error: "path is required for read_file operation",
              };
            }

            try {
              const resolvedPath = filePath.startsWith("~")
                ? filePath.replace("~", process.env.HOME || "")
                : path.resolve(filePath);

              const buffer = await fs.readFile(resolvedPath);
              
              if (encoding === "base64") {
                return {
                  success: true,
                  result: {
                    path: resolvedPath,
                    content: buffer.toString("base64"),
                    encoding: "base64",
                    size: buffer.length,
                  },
                };
              } else {
                return {
                  success: true,
                  result: {
                    path: resolvedPath,
                    content: buffer.toString("utf8"),
                    encoding: "utf8",
                    size: buffer.length,
                  },
                };
              }
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to read file",
              };
            }
          }

          case "write_file": {
            if (!filePath || typeof filePath !== "string") {
              return {
                success: false,
                error: "path is required for write_file operation",
              };
            }

            if (content === undefined || typeof content !== "string") {
              return {
                success: false,
                error: "content is required for write_file operation",
              };
            }

            try {
              const resolvedPath = filePath.startsWith("~")
                ? filePath.replace("~", process.env.HOME || "")
                : path.resolve(filePath);

              // Ensure directory exists
              const dir = path.dirname(resolvedPath);
              await fs.mkdir(dir, { recursive: true });

              let buffer: Buffer;
              if (encoding === "base64") {
                buffer = Buffer.from(content, "base64");
              } else {
                buffer = Buffer.from(content, "utf8");
              }

              await fs.writeFile(resolvedPath, buffer);

              return {
                success: true,
                result: {
                  path: resolvedPath,
                  size: buffer.length,
                },
              };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to write file",
              };
            }
          }

          case "glob": {
            if (!pattern || typeof pattern !== "string") {
              return {
                success: false,
                error: "pattern is required for glob operation",
              };
            }

            try {
              const matches = await globFn(pattern, {
                absolute: true,
                ignore: ["node_modules/**", ".git/**"],
              });

              return {
                success: true,
                result: {
                  pattern,
                  matches,
                  count: matches.length,
                },
              };
            } catch (err) {
              return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to search files",
              };
            }
          }

          default:
            return {
              success: false,
              error: `Unknown operation: ${operation}. Supported operations: list_dir, read_file, write_file, glob`,
            };
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
  };
}
