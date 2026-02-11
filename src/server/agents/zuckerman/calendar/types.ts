export interface RecurrenceRule {
  type: "none" | "daily" | "weekly" | "monthly" | "yearly" | "cron";
  interval?: number;
  endDate?: number;
  count?: number;
  cronExpression?: string;
  timezone?: string;
}

export interface EventAction {
  type: "agentTurn" | "systemEvent";
  agentId?: string; // Defaults to current agent
  conversationTarget?: "main" | "isolated"; // Defaults to "isolated"
  conversationIdSource?: string; // Conversation ID that created this cron event
  contextMessage?: string;
  actionMessage: string;
  context?: {
    channel?: string;
    to?: string;
    accountId?: string;
    [key: string]: unknown; // Allow additional context fields
  };
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: number;
  endTime?: number;
  recurrence?: RecurrenceRule;
  action: EventAction;
  enabled: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
  nextOccurrenceAt?: number;
}
