import path from "node:path";
import fs from "node:fs/promises";
import type { SecurityContext } from "@server/world/execution/security/types.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import type { Tool, ToolDefinition, ToolResult, ToolExecutionContext } from "../terminal/index.js";

/**
 * Creates a multi-edit tool that performs multiple sequential edits on a file
 * 
 * This is more efficient than calling filesystem write_file multiple times,
 * as it reads the file once, applies all edits sequentially, and writes once.
 */
export function createMultiEditTool(): Tool {
  return {
    definition: {
      name: "multiedit",
      description: `Perform multiple sequential edits on a file in a single operation. More efficient than multiple separate file writes. Each edit replaces oldString with newString. Edits are applied in order, so later edits operate on the already-modified content.`,
      parameters: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "The absolute or relative path to the file to modify",
          },
          edits: {
            type: "array",
            description: "Array of edit operations to perform sequentially on the file. Each edit has oldString (text to replace), newString (replacement text), and optional replaceAll (boolean).",
            items: {
              type: "object",
            } as {
              type: string;
              [key: string]: unknown;
            },
            minItems: 1,
          } as {
            type: string;
            description: string;
            items: {
              type: string;
              [key: string]: unknown;
            };
            minItems: number;
            [key: string]: unknown;
          },
        },
        required: ["filePath", "edits"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        const { filePath, edits } = params;

        if (typeof filePath !== "string" || !filePath.trim()) {
          return {
            success: false,
            error: "filePath is required and must be a non-empty string",
          };
        }

        if (!Array.isArray(edits) || edits.length === 0) {
          return {
            success: false,
            error: "edits must be a non-empty array",
          };
        }

        // Check tool security
        if (securityContext) {
          const toolAllowed = isToolAllowed("multiedit", securityContext.toolPolicy);
          if (!toolAllowed) {
            return {
              success: false,
              error: "MultiEdit tool is not allowed by security policy",
            };
          }
        }

        // Resolve file path
        const resolvedPath = filePath.startsWith("~")
          ? filePath.replace("~", process.env.HOME || "")
          : path.resolve(filePath);

        // Validate edits
        for (let i = 0; i < edits.length; i++) {
          const edit = edits[i];
          if (typeof edit !== "object" || edit === null) {
            return {
              success: false,
              error: `Edit at index ${i} must be an object`,
            };
          }
          if (typeof edit.oldString !== "string") {
            return {
              success: false,
              error: `Edit at index ${i}: oldString must be a string`,
            };
          }
          if (typeof edit.newString !== "string") {
            return {
              success: false,
              error: `Edit at index ${i}: newString must be a string`,
            };
          }
          if (edit.oldString === edit.newString) {
            return {
              success: false,
              error: `Edit at index ${i}: oldString and newString must be different`,
            };
          }
        }

        // Read file
        let content: string;
        try {
          const buffer = await fs.readFile(resolvedPath);
          content = buffer.toString("utf8");
        } catch (err) {
          return {
            success: false,
            error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
          };
        }

        // Apply edits sequentially
        const results: Array<{
          index: number;
          success: boolean;
          replacements: number;
          error?: string;
        }> = [];

        let currentContent = content;

        for (let i = 0; i < edits.length; i++) {
          const edit = edits[i];
          const replaceAll = edit.replaceAll === true;

          try {
            if (replaceAll) {
              // Replace all occurrences
              const regex = new RegExp(escapeRegex(edit.oldString), "g");
              const matches = currentContent.match(regex);
              const count = matches ? matches.length : 0;
              
              if (count === 0) {
                results.push({
                  index: i,
                  success: false,
                  replacements: 0,
                  error: `Pattern not found in file`,
                });
                continue;
              }

              currentContent = currentContent.replace(regex, edit.newString);
              results.push({
                index: i,
                success: true,
                replacements: count,
              });
            } else {
              // Replace first occurrence only
              const index = currentContent.indexOf(edit.oldString);
              
              if (index === -1) {
                results.push({
                  index: i,
                  success: false,
                  replacements: 0,
                  error: `Pattern not found in file`,
                });
                continue;
              }

              currentContent = currentContent.replace(edit.oldString, edit.newString);
              results.push({
                index: i,
                success: true,
                replacements: 1,
              });
            }
          } catch (err) {
            results.push({
              index: i,
              success: false,
              replacements: 0,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        // Write modified content
        try {
          await fs.writeFile(resolvedPath, currentContent, "utf8");
        } catch (err) {
          return {
            success: false,
            error: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
          };
        }

        // Calculate summary
        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;
        const totalReplacements = results.reduce((sum, r) => sum + r.replacements, 0);

        // Build output message
        let output = `Applied ${successful}/${results.length} edits successfully. `;
        if (failed > 0) {
          output += `${failed} edit(s) failed. `;
        }
        output += `Total replacements: ${totalReplacements}.\n\n`;

        // Add details for each edit
        for (const result of results) {
          const edit = edits[result.index];
          if (result.success) {
            output += `✓ Edit ${result.index + 1}: Replaced "${truncate(edit.oldString, 50)}" -> "${truncate(edit.newString, 50)}" (${result.replacements} occurrence(s))\n`;
          } else {
            output += `✗ Edit ${result.index + 1}: Failed - ${result.error || "Unknown error"}\n`;
          }
        }

        return {
          success: failed === 0,
          result: {
            filePath: resolvedPath,
            totalEdits: results.length,
            successfulEdits: successful,
            failedEdits: failed,
            totalReplacements,
            results,
            output,
          },
          error: failed > 0 ? `${failed} edit(s) failed. See result.details for more information.` : undefined,
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

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Truncate string for display
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}
