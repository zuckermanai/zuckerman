import type { SessionId } from "@agents/zuckerman/sessions/types.js";
import type { SecurityContext } from "@world/execution/security/types.js";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface AgentRunParams {
  sessionId: SessionId;
  message: string;
  thinkingLevel?: ThinkingLevel;
  temperature?: number;
  model?: string;
  securityContext?: SecurityContext;
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
