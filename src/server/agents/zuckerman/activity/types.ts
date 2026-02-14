export type ActivityType = 
  | "agent.run"
  | "agent.run.complete"
  | "agent.run.error"
  | "agent.message"
  | "agent.response"
  | "tool.call"
  | "tool.result"
  | "tool.error"
  | "self.error"
  | "conversation.create"
  | "conversation.update"
  | "channel.message.incoming"
  | "channel.message.outgoing"
  | "calendar.event.triggered"
  | "calendar.event.created"
  | "calendar.event.updated"
  | "calendar.event.deleted"
  | "awareness.queue.drained";

export interface Activity {
  id: string;
  type: ActivityType;
  timestamp: number;
  agentId?: string;
  conversationId?: string;
  runId?: string;
  metadata: {
    // Agent run activities
    message?: string;
    response?: string;
    tokensUsed?: number;
    toolsUsed?: string[];
    error?: string;
    
    // Tool activities
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
    toolError?: string;
    
    // Self error activities
    errorContext?: string;
    errorMessage?: string;
    errorStack?: string;
    
    // Conversation activities
    conversationType?: string;
    conversationLabel?: string;
    
    // Channel activities
    channel?: string;
    from?: string;
    to?: string;
    content?: string;
    
    // Calendar activities
    eventId?: string;
    eventTitle?: string;
    
    // Generic metadata
    [key: string]: unknown;
  };
}

export interface ActivityQuery {
  from?: number; // Start timestamp
  to?: number; // End timestamp
  agentId?: string;
  conversationId?: string;
  type?: ActivityType | ActivityType[];
  limit?: number;
  offset?: number;
}
