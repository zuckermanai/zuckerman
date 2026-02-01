export type SessionType = "main" | "group" | "channel";

export interface Session {
  id: string;
  label: string;
  type: SessionType;
  agentId?: string;
}

export interface SessionState {
  session?: Session;
  messages?: Array<{
    role: string;
    content: string;
    timestamp?: number;
    toolCallId?: string;
    toolCalls?: unknown[];
  }>;
}
