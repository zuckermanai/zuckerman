import type { SessionId } from "@server/agents/zuckerman/sessions/types.js";
import type { SecurityContext } from "@server/world/execution/security/types.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface StreamEvent {
  type: "lifecycle" | "token" | "tool.call" | "tool.result" | "thinking" | "done";
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
  };
}

export type StreamCallback = (event: StreamEvent) => void | Promise<void>;

export interface AgentRunParams {
  sessionId: SessionId;
  message: string;
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
  model?: string;
  securityContext?: SecurityContext;
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
