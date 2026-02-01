export interface Message {
  role: "user" | "assistant" | "system" | "thinking";
  content: string;
  timestamp: number;
  rawResponse?: unknown; // Store raw JSON response for viewing
  isStreaming?: boolean; // For streaming responses
}

export interface BackendMessage {
  role: string;
  content: string;
  timestamp?: number;
  toolCallId?: string;
  toolCalls?: unknown[];
}
