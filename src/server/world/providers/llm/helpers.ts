import type { ModelMessage, Tool } from "ai";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";

/**
 * Convert ConversationMessage[] to ModelMessage[]
 * Filters out ignored messages and converts to AI SDK format
 */
export function convertToModelMessages(
  messages: ConversationMessage[]
): ModelMessage[] {
  return messages
    .filter((msg) => {
      // Filter out ignored messages
      if (msg.ignore) return false;
      
      // Filter out messages with invalid content
      if (msg.role === "tool") {
        // Tool messages must have toolCallId and valid content
        if (!msg.toolCallId) return false;
        if (msg.content === undefined || msg.content === null) return false;
        return true;
      }
      
      // For user/assistant/system messages, content must be a non-empty string
      if (typeof msg.content !== "string" || msg.content.trim().length === 0) {
        return false;
      }
      
      return true;
    })
    .map((msg): ModelMessage => {
      if (msg.role === "tool") {
        // ToolContent is an array of ToolResultPart
        // Convert string content to array format
        // Note: We don't have toolName in ConversationMessage, so we'll use a placeholder
        return {
          role: "tool",
          content: typeof msg.content === "string" 
            ? [{ 
                type: "tool-result" as const, 
                toolCallId: msg.toolCallId!, 
                toolName: "unknown", // ConversationMessage doesn't store toolName
                output: msg.content 
              }]
            : msg.content,
        } as any;
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        // Assistant messages with tool calls need tool calls in the content array as ToolCallPart
        // But generateText handles this differently - it returns toolCalls separately
        // For now, we'll just return the content without tool calls embedded
        // The tool calls will be handled by generateText's return value
        return {
          role: msg.role as "assistant",
          content: msg.content as string,
        } as ModelMessage;
      }

      return {
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content as string,
      };
    });
}

/**
 * Convert ToolRegistry Map to AI SDK tools Record
 */
export function convertToAITools(toolsMap: Map<string, Tool>): Record<string, Tool> {
  return Object.fromEntries(toolsMap);
}
