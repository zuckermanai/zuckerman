import type { SecurityContext } from "@server/world/execution/security/types.js";
import type { Tool, ToolDefinition, ToolResult, ToolExecutionContext } from "../terminal/index.js";
import type { StreamCallback } from "@server/world/runtime/agents/types.js";

/**
 * Maximum number of tools allowed in a single batch execution
 */
const MAX_BATCH_SIZE = 25;

/**
 * Tools that cannot be executed within a batch (to prevent recursion and issues)
 */
const DISALLOWED_TOOLS = new Set(["batch"]);

/**
 * Context passed to batch tool for executing nested tools
 */
export interface BatchExecutionContext {
  /**
   * Execute a tool by name with parameters
   */
  executeTool: (
    toolName: string,
    params: Record<string, unknown>,
    securityContext?: SecurityContext,
    executionContext?: ToolExecutionContext,
  ) => Promise<ToolResult>;
  
  /**
   * Get list of available tool names
   */
  getAvailableTools: () => string[];
  
  /**
   * Conversation ID for tracking
   */
  conversationId: string;
}

/**
 * Result of a single tool execution within a batch
 */
interface BatchToolResult {
  tool: string;
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
}

/**
 * Creates a batch tool that executes multiple tools in parallel
 * 
 * This tool allows the agent to execute up to 25 tools concurrently,
 * dramatically improving performance for multi-step tasks.
 */
export function createBatchTool(context: BatchExecutionContext): Tool {
  return {
    definition: {
      name: "batch",
      description: `Execute multiple tools in parallel for improved performance. Use this when you need to perform multiple independent operations (e.g., reading multiple files, searching multiple directories, running multiple commands). Can execute up to ${MAX_BATCH_SIZE} tools concurrently. Tools are executed in parallel using Promise.all(), providing 5-10x speedup for multi-step tasks.`,
      parameters: {
        type: "object",
        properties: {
          tool_calls: {
            type: "array",
            description: `Array of tool calls to execute in parallel. Maximum ${MAX_BATCH_SIZE} tools per batch. Each element should be an object with 'tool' (string) and 'parameters' (object) properties.`,
            items: {
              type: "object",
            } as {
              type: string;
              [key: string]: unknown;
            },
            minItems: 1,
            maxItems: MAX_BATCH_SIZE,
          } as {
            type: string;
            description: string;
            items: {
              type: string;
              [key: string]: unknown;
            };
            minItems: number;
            maxItems: number;
            [key: string]: unknown;
          },
        },
        required: ["tool_calls"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      const startTime = Date.now();
      
      // Validate input
      if (!params.tool_calls || !Array.isArray(params.tool_calls)) {
        return {
          success: false,
          error: "tool_calls must be an array",
        };
      }

      if (params.tool_calls.length === 0) {
        return {
          success: false,
          error: "At least one tool call is required",
        };
      }

      if (params.tool_calls.length > MAX_BATCH_SIZE) {
        return {
          success: false,
          error: `Maximum ${MAX_BATCH_SIZE} tools allowed per batch. Received ${params.tool_calls.length} tools.`,
        };
      }

      // Split into valid calls and discarded calls
      const toolCalls = params.tool_calls.slice(0, MAX_BATCH_SIZE);
      const discardedCalls = params.tool_calls.slice(MAX_BATCH_SIZE);
      const availableTools = context.getAvailableTools();

      // Execute a single tool call with error handling
      const executeCall = async (
        call: { tool: string; parameters: Record<string, unknown> },
        index: number,
      ): Promise<BatchToolResult> => {
        const callStartTime = Date.now();
        const { tool: toolName, parameters } = call;

        try {
          // Check if tool is disallowed
          if (DISALLOWED_TOOLS.has(toolName)) {
            throw new Error(
              `Tool '${toolName}' is not allowed in batch. Disallowed tools: ${Array.from(DISALLOWED_TOOLS).join(", ")}`,
            );
          }

          // Check if tool exists
          if (!availableTools.includes(toolName)) {
            const availableList = availableTools
              .filter((name) => !DISALLOWED_TOOLS.has(name))
              .join(", ");
            throw new Error(
              `Tool '${toolName}' not found. Available tools: ${availableList}`,
            );
          }

          // Emit tool start event if streaming
          if (executionContext?.stream) {
            executionContext.stream({
              type: "tool.call",
              data: {
                tool: toolName,
                toolArgs: parameters,
              },
            });
          }

          // Execute the tool with execution context
          const result = await context.executeTool(
            toolName,
            parameters,
            securityContext,
            executionContext,
          );

          // Emit tool result event if streaming
          if (executionContext?.stream) {
            executionContext.stream({
              type: "tool.result",
              data: {
                tool: toolName,
                toolResult: result,
              },
            });
          }

          const executionTime = Date.now() - callStartTime;

          return {
            tool: toolName,
            success: result.success,
            result: result.result,
            error: result.error,
            executionTime,
          };
        } catch (error) {
          const executionTime = Date.now() - callStartTime;
          const errorMsg = error instanceof Error ? error.message : String(error);

          // Emit error event if streaming
          if (executionContext?.stream) {
            executionContext.stream({
              type: "tool.result",
              data: {
                tool: toolName,
                toolResult: {
                  success: false,
                  error: errorMsg,
                },
              },
            });
          }

          return {
            tool: toolName,
            success: false,
            error: errorMsg,
            executionTime,
          };
        }
      };

      // Execute all tools in parallel
      const results = await Promise.all(
        toolCalls.map((call, index) => executeCall(call, index)),
      );

      // Handle discarded calls (beyond MAX_BATCH_SIZE)
      const discardedResults: BatchToolResult[] = discardedCalls.map((call) => ({
        tool: call.tool,
        success: false,
        error: `Maximum of ${MAX_BATCH_SIZE} tools allowed in batch`,
        executionTime: 0,
      }));

      const allResults = [...results, ...discardedResults];
      const successfulCalls = allResults.filter((r) => r.success).length;
      const failedCalls = allResults.length - successfulCalls;
      const totalExecutionTime = Date.now() - startTime;

      // Build output message
      const outputMessage = failedCalls > 0
        ? `Executed ${successfulCalls}/${allResults.length} tools successfully. ${failedCalls} failed.\n\nExecution time: ${totalExecutionTime}ms`
        : `All ${successfulCalls} tools executed successfully in ${totalExecutionTime}ms.\n\nKeep using the batch tool for optimal performance in your next response!`;

      // Build detailed results summary
      const details = allResults.map((r) => ({
        tool: r.tool,
        success: r.success,
        executionTime: r.executionTime,
        error: r.error,
      }));

      return {
        success: failedCalls === 0,
        result: {
          summary: {
            total: allResults.length,
            successful: successfulCalls,
            failed: failedCalls,
            totalExecutionTime,
          },
          results: details,
          // Include successful results for easy access
          successfulResults: allResults
            .filter((r) => r.success)
            .map((r) => ({
              tool: r.tool,
              result: r.result,
            })),
        },
        error: failedCalls > 0
          ? `${failedCalls} tool(s) failed. See details in result.summary`
          : undefined,
      };
    },
  };
}
