import type { Tool, ModelMessage } from "ai";
import type { AgentEvent } from "./events.js";

export interface ToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ExecuteToolCallsResult {
  assistantMsg: ModelMessage;
  toolResultMsgs: ModelMessage[];
}

export class ToolExecutor {
  constructor(
    private emitEvent: (event: AgentEvent) => Promise<void>
  ) {}

  /**
   * Execute tool calls and return assistant message with tool calls + tool result messages
   */
  async executeToolCalls(
    toolCalls: ToolCall[],
    textContent: string,
    availableTools: Record<string, Tool>,
    contextMessages: ModelMessage[],
    conversationId: string,
    runId: string
  ): Promise<ExecuteToolCallsResult> {
    console.log(`[ToolExecutor] Tool calls: ${toolCalls.map(t => t.toolName).join(", ")}`);
    
    // Create assistant message with tool calls
    const toolCallParts = toolCalls.map(tc => ({
      type: "tool-call" as const,
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      input: tc.input,
    }));
    
    const assistantMsg: ModelMessage = {
      role: "assistant",
      content: textContent 
        ? [{ type: "text" as const, text: textContent }, ...toolCallParts]
        : toolCallParts,
    };
    
    // Execute tools and create result messages
    const toolResultMsgs: ModelMessage[] = await Promise.all(
      toolCalls.map(async (toolCall): Promise<ModelMessage> => {
        await this.emitEvent({
          type: "stream.tool.call",
          conversationId,
          runId,
          tool: toolCall.toolName,
          toolArgs: typeof toolCall.input === "object" && toolCall.input !== null && !Array.isArray(toolCall.input)
            ? toolCall.input as Record<string, unknown>
            : {},
        });
        
        const tool = availableTools[toolCall.toolName];
        if (!tool?.execute) {
          const error = `Tool "${toolCall.toolName}" not found or has no execute function`;
          await this.emitEvent({
            type: "stream.tool.result",
            conversationId,
            runId,
            tool: toolCall.toolName,
            toolResult: error,
          });
          return this.createToolResultMessage(toolCall, error);
        }
        
        try {
          const result = await tool.execute(toolCall.input, {
            toolCallId: toolCall.toolCallId,
            messages: contextMessages,
          });
          const output = typeof result === "string" ? result : JSON.stringify(result);
          await this.emitEvent({
            type: "stream.tool.result",
            conversationId,
            runId,
            tool: toolCall.toolName,
            toolResult: output,
          });
          return this.createToolResultMessage(toolCall, output);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          await this.emitEvent({
            type: "stream.tool.result",
            conversationId,
            runId,
            tool: toolCall.toolName,
            toolResult: `Error: ${errorMsg}`,
          });
          return this.createToolResultMessage(toolCall, `Error: ${errorMsg}`);
        }
      })
    );
    
    return { assistantMsg, toolResultMsgs };
  }

  /**
   * Create a tool result message from a tool call and output
   */
  private createToolResultMessage(
    toolCall: { toolCallId: string; toolName: string },
    output: string
  ): ModelMessage {
    return {
      role: "tool" as const,
      content: [{
        type: "tool-result" as const,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        output: { type: "text" as const, value: output },
      }],
    };
  }
}
