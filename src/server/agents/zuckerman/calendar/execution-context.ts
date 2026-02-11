import type { AgentRuntimeFactory } from "@server/world/runtime/agents/index.js";
import type { ChannelRegistry } from "@server/world/communication/messengers/channels/registry.js";

/**
 * Execution context for cron event execution
 * Provides dependencies needed to execute scheduled events
 */
export interface CronExecutionContext {
  agentFactory: AgentRuntimeFactory;
  channelRegistry?: ChannelRegistry;
}

let executionContext: CronExecutionContext | null = null;

/**
 * Set the execution context for cron event execution
 * Should be called during gateway server initialization
 */
export function setCronExecutionContext(context: CronExecutionContext): void {
  executionContext = context;
}

/**
 * Get the current execution context
 * Returns null if not set (execution will fail gracefully)
 */
export function getCronExecutionContext(): CronExecutionContext | null {
  return executionContext;
}
