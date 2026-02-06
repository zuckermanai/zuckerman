import type { LLMMessage, LLMTool } from "@server/world/providers/llm/types.js";
import type { SecurityContext } from "@server/world/execution/security/types.js";
import type { ConversationId } from "@server/agents/zuckerman/conversations/types.js";
import type { ConversationState } from "@server/agents/zuckerman/conversations/types.js";
import type { UnifiedMemoryManager } from "../memory/manager.js";
import type { LLMModel } from "@server/world/providers/llm/index.js";
import type { StreamEventEmitter } from "@server/world/communication/stream-emitter.js";
import type { ZuckermanToolRegistry } from "@server/agents/zuckerman/tools/registry.js";

/**
 * Execution context passed through stateless services
 * Contains all state needed for a single agent run
 */
export interface RunContext {
  // Run identification
  agentId: string;
  conversationId: ConversationId;
  runId: string;
  
  // User input
  message: string;
  temperature?: number;
  securityContext: SecurityContext;
  
  // Infrastructure
  homedir: string;
  memoryManager: UnifiedMemoryManager;
  toolRegistry: ZuckermanToolRegistry;
  llmModel: LLMModel;
  streamEmitter: StreamEventEmitter;
  
  // Conversation state
  conversation: ConversationState | null;
  
  // Execution state (built during run)
  messages: LLMMessage[];
  availableTools: LLMTool[];
  systemPrompt: string;
  relevantMemoriesText: string;
}
