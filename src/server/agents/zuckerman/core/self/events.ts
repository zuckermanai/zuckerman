export interface SpeakEvent {
  type: "speak";
  conversationId: string;
  message: string;
  runId?: string;
}

export interface WriteEvent {
  type: "write";
  conversationId: string;
  content: string;
  role: "user" | "assistant" | "system" | "tool";
  runId?: string;
}

export interface ThinkEvent {
  type: "think";
  conversationId: string;
  thought: string;
  runId?: string;
}

export interface RememberEvent {
  type: "remember";
  conversationId: string;
  memory: string;
  runId?: string;
}

export interface ActEvent {
  type: "act";
  conversationId: string;
  action: string;
  runId?: string;
}

export interface LearnEvent {
  type: "learn";
  conversationId: string;
  knowledge: string;
  runId?: string;
}

export interface StreamTokenEvent {
  type: "stream.token";
  conversationId: string;
  runId: string;
  token: string;
}

export interface StreamLifecycleEvent {
  type: "stream.lifecycle";
  conversationId: string;
  runId: string;
  phase: "start" | "end" | "error";
  message?: string;
  tokensUsed?: number;
  toolsUsed?: string[];
  error?: string;
}

export interface StreamToolCallEvent {
  type: "stream.tool.call";
  conversationId: string;
  runId: string;
  tool: string;
  toolArgs: Record<string, unknown>;
}

export interface StreamToolResultEvent {
  type: "stream.tool.result";
  conversationId: string;
  runId: string;
  tool: string;
  toolResult: unknown;
}

export interface StreamResponseEvent {
  type: "stream.response";
  conversationId: string;
  runId: string;
  response: string;
}

export interface SelfErrorEvent {
  type: "self.error";
  conversationId: string;
  runId: string;
  errorContext: string;
  error: string;
  errorStack?: string;
}

export interface MessageEvent {
  type: "message";
  conversationId: string;
  message: string;
  runId?: string;
}

export type AgentEvent =
  | MessageEvent
  | SpeakEvent
  | WriteEvent
  | ThinkEvent
  | RememberEvent
  | ActEvent
  | LearnEvent
  | StreamTokenEvent
  | StreamLifecycleEvent
  | StreamToolCallEvent
  | StreamToolResultEvent
  | StreamResponseEvent
  | SelfErrorEvent;
