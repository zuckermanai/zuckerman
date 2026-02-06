/**
 * Sleep mode runner - executes sleep mode processing
 */

import type { ConversationManager } from "../conversations/manager.js";
import { deriveConversationKey } from "../conversations/manager.js";
import { loadConversationStore } from "../conversations/store.js";
import type { ConversationEntry } from "../conversations/types.js";
import type { ZuckermanConfig } from "@server/world/config/types.js";
import { LLMManager } from "@server/world/providers/llm/index.js";
import { resolveSleepConfig } from "./config.js";
import { shouldSleep } from "./trigger.js";
import { processConversation } from "./processor.js";
import { consolidateMemories } from "./consolidator.js";
import { UnifiedMemoryManager } from "../core/memory/manager.js";

/**
 * Run sleep mode if needed
 */
export async function runSleepModeIfNeeded(params: {
  config: ZuckermanConfig;
  conversationManager: ConversationManager;
  conversationId: string;
  agentId: string;
  homedir: string;
}): Promise<ConversationEntry | undefined> {
  const { config, conversationManager, conversationId, agentId, homedir } = params;

  // Resolve sleep settings
  const sleepConfig = resolveSleepConfig({
    sleep: config.agent?.sleep,
    memoryFlush: config.agent?.memoryFlush, // Support migration from memoryFlush
  });

  if (!sleepConfig) {
    return undefined; // Sleep disabled
  }

  // Get large context model for sleep processing (available for future LLM-based processing)
  const llmManager = LLMManager.getInstance();
  const model = await llmManager.largeContext(config);

  // Get conversation entry to check token counts
  const conversation = conversationManager.getConversation(conversationId);
  if (!conversation) {
    return undefined;
  }

  const conversationKey = deriveConversationKey(agentId, conversation.conversation.type, conversation.conversation.label);
  const storePath = conversationManager.getStorePath();
  const store = loadConversationStore(storePath);
  const entry = store[conversationKey];

  // Check if sleep should run
  const shouldRun = shouldSleep({
    entry,
    config: sleepConfig,
    conversationMessageCount: conversation.messages?.length,
  });

  if (!shouldRun) {
    return entry;
  }

  // Run sleep mode
  try {
    // Phase 1: Process conversation
    // Get recent messages for processing
    const recentMessages = conversation.messages?.slice(-50) || []; // Last 50 messages
    
    // Convert to ContextMessage format
    const contextMessages = recentMessages.map((msg, idx) => ({
      role: msg.role as "user" | "assistant" | "system" | "tool",
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      timestamp: msg.timestamp || Date.now() - (recentMessages.length - idx) * 1000,
      tokens: Math.ceil((typeof msg.content === "string" ? msg.content.length : JSON.stringify(msg.content).length) / 4),
    }));

    const { importantMessages, summary } = processConversation(contextMessages);

    // Phase 2 & 3: Consolidate memories
    const consolidatedMemories = consolidateMemories(importantMessages, summary);

    // Phase 4: Save using UnifiedMemoryManager (creates structured memories + file persistence)
    const memoryManager = UnifiedMemoryManager.create(homedir);
    
    // Save consolidated memories (creates episodic/semantic memories automatically)
    memoryManager.saveConsolidatedMemories(consolidatedMemories, conversationId);

    // Update conversation entry with sleep metadata
    const updatedEntry = await conversationManager.updateConversationEntry(conversationId, (current) => ({
      sleepCount: (current.sleepCount ?? 0) + 1,
      sleepAt: Date.now(),
      // Keep memoryFlushCount for backward compatibility during migration
      memoryFlushCount: (current.memoryFlushCount ?? 0) + 1,
      memoryFlushAt: Date.now(),
    }));

    return updatedEntry || entry;
  } catch (err) {
    console.warn(`[SleepMode] Sleep mode run failed:`, err);
    return entry;
  }
}
