import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";
import type { Tool } from "ai";

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
  executeTool: (toolName: string, params: Record<string, unknown>) => Promise<string>;
  getAvailableTools: () => string[];
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
const batchToolInputSchema = z.object({
  tool_calls: z.array(z.object({
    tool: z.string(),
    parameters: z.record(z.string(), z.any()),
  })).min(1).max(MAX_BATCH_SIZE).describe(`Array of tool calls to execute in parallel. Maximum ${MAX_BATCH_SIZE} tools per batch. Each element should be an object with 'tool' (string) and 'parameters' (object) properties.`),
});

type BatchToolInput = z.infer<typeof batchToolInputSchema>;

export function createBatchTool(context: BatchExecutionContext): Tool {
  const aiTool = tool<BatchToolInput, string>({
    description: `Execute multiple tools in parallel for improved performance. Use this when you need to perform multiple independent operations (e.g., reading multiple files, searching multiple directories, running multiple commands). Can execute up to ${MAX_BATCH_SIZE} tools concurrently. Tools are executed in parallel using Promise.all(), providing 5-10x speedup for multi-step tasks.`,
    inputSchema: zodSchema(batchToolInputSchema),
    execute: async (params) => {
      const startTime = Date.now();
      
      if (!params.tool_calls?.length) {
        return JSON.stringify({ success: false, error: "At least one tool call is required" });
      }

      if (params.tool_calls.length > MAX_BATCH_SIZE) {
        return JSON.stringify({ success: false, error: `Maximum ${MAX_BATCH_SIZE} tools allowed per batch. Received ${params.tool_calls.length} tools.` });
      }

      const toolCalls = params.tool_calls.slice(0, MAX_BATCH_SIZE);
      const discardedCalls = params.tool_calls.slice(MAX_BATCH_SIZE);
      const availableTools = context.getAvailableTools();

      const executeCall = async (call: { tool: string; parameters: Record<string, unknown> }): Promise<BatchToolResult> => {
        const start = Date.now();
        const { tool: toolName, parameters } = call;

        if (DISALLOWED_TOOLS.has(toolName) || !availableTools.includes(toolName)) {
          return { tool: toolName, success: false, error: DISALLOWED_TOOLS.has(toolName) ? `Tool '${toolName}' is not allowed in batch` : `Tool '${toolName}' not found`, executionTime: Date.now() - start };
        }

        try {
          const result = await context.executeTool(toolName, parameters);
          const isError = result.startsWith("Error:");
          return { tool: toolName, success: !isError, result: isError ? undefined : result, error: isError ? result : undefined, executionTime: Date.now() - start };
        } catch (error) {
          return { tool: toolName, success: false, error: error instanceof Error ? error.message : String(error), executionTime: Date.now() - start };
        }
      };

      const results = await Promise.all(toolCalls.map(executeCall));
      const discarded: BatchToolResult[] = discardedCalls.map(call => ({
        tool: call.tool,
        success: false,
        result: undefined,
        error: `Maximum of ${MAX_BATCH_SIZE} tools allowed in batch`,
        executionTime: 0,
      }));

      const allResults: BatchToolResult[] = [...results, ...discarded];
      const successful = allResults.filter(r => r.success).length;
      const failed = allResults.length - successful;
      const totalTime = Date.now() - startTime;

      return JSON.stringify({
        success: failed === 0,
        result: {
          summary: { total: allResults.length, successful, failed, totalExecutionTime: totalTime },
          results: allResults.map(r => ({ tool: r.tool, success: r.success, executionTime: r.executionTime, error: r.error })),
          successfulResults: allResults.filter(r => r.success && r.result !== undefined).map(r => ({ tool: r.tool, result: r.result })),
        },
        error: failed > 0 ? `${failed} tool(s) failed` : undefined,
      });
    },
  });

  return aiTool;
}
