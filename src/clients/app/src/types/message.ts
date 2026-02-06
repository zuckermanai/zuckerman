export interface Message {
  role: "user" | "assistant" | "system" | "thinking" | "tool";
  content: string;
  timestamp: number;
  rawResponse?: unknown; // Store raw JSON response for viewing
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>; // Tool calls made by the assistant
  toolCallId?: string; // For tool result messages
  isStreaming?: boolean; // For streaming responses
}

export interface BackendMessage {
  role: string;
  content: string;
  timestamp?: number;
  toolCallId?: string;
  toolCalls?: unknown[];
}
