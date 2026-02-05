import type { ConversationId } from "@server/agents/zuckerman/conversations/types.js";
import type { SecurityContext } from "@server/world/execution/security/types.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface StreamEvent {
  type: "lifecycle" | "token" | "tool.call" | "tool.result" | "thinking" | "done" | "queue";
  data: {
    phase?: "start" | "end" | "error";
    error?: string;
    token?: string;
    tool?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
    thinking?: string;
    runId?: string;
    tokensUsed?: number;
    toolsUsed?: string[];
    response?: string;
    // Planning/step progress fields
    steps?: Array<{
      id: string;
      title: string;
      description?: string;
      order: number;
      requiresConfirmation: boolean;
      confirmationReason?: string;
    }>;
    step?: {
      id: string;
      title: string;
      description?: string;
      order?: number;
      requiresConfirmation?: boolean;
      confirmationReason?: string;
      completed?: boolean;
      error?: string;
    };
    progress?: number;
    confirmationRequired?: boolean;
    fallbackTask?: {
      id: string;
      title: string;
    };
    // Queue update fields
    agentId?: string;
    queue?: unknown;
    timestamp?: number;
  };
}

export type StreamCallback = (event: StreamEvent) => void | Promise<void>;

export interface AgentRunParams {
  conversationId: ConversationId;
  message: string;
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
  securityContext: SecurityContext;
  stream?: StreamCallback;
}

export interface AgentRunResult {
  response: string;
  runId: string;
  tokensUsed?: number;
  toolsUsed?: string[];
}

/**
 * Agent runtime interface - all agent runtimes must implement this
 */
export interface AgentRuntime {
  /**
   * Agent identifier
   */
  readonly agentId: string;

  /**
   * Initialize the agent (called once when agent is created)
   */
  initialize?(): Promise<void>;

  /**
   * Run the agent with given parameters
   */
  run(params: AgentRunParams): Promise<AgentRunResult>;

  /**
   * Load agent prompts (for inspection/debugging)
   */
  loadPrompts?(): Promise<unknown>;

  /**
   * Clear caches (for hot reload)
   */
  clearCache?(): void;
}
