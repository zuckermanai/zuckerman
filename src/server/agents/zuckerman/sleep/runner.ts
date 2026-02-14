import type { ConversationManager } from "../conversations/manager.js";
import { deriveConversationKey } from "../conversations/manager.js";
import { loadConversationStore } from "../conversations/store.js";
import type { ConversationEntry } from "../conversations/types.js";
import type { ZuckermanConfig } from "@server/world/config/types.js";
import { MemorySystem } from "../core/memory/memory-service.js";
import type { MemoryType, Memory } from "../core/memory/types.js";
import { generateText, Output } from "ai";
import { z } from "zod";
import { LLMProvider } from "@server/world/providers/llm/index.js";

export interface SleepConfig {
  enabled: boolean;
  cooldownMinutes: number;
  minMessagesToSleep: number;
}

const DEFAULT_COOLDOWN_MINUTES = 5;
const DEFAULT_MIN_MESSAGES_TO_SLEEP = 10;

function resolveSleepConfig(cfg?: {
  sleep?: { enabled?: boolean; cooldownMinutes?: number; minMessagesToSleep?: number };
  memoryFlush?: { enabled?: boolean };
}): SleepConfig | null {
  const sleepCfg = cfg?.sleep;
  const memoryFlushCfg = cfg?.memoryFlush;
  
  if (sleepCfg?.enabled === false || (memoryFlushCfg?.enabled === false && !sleepCfg)) {
    return null;
  }
  
  const enabled = sleepCfg?.enabled ?? memoryFlushCfg?.enabled ?? true;
  if (!enabled) return null;
  
  const normalizeInt = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    const int = Math.floor(v);
    return int >= 0 ? int : null;
  };
  
  return {
    enabled,
    cooldownMinutes: normalizeInt(sleepCfg?.cooldownMinutes) ?? DEFAULT_COOLDOWN_MINUTES,
    minMessagesToSleep: normalizeInt(sleepCfg?.minMessagesToSleep) ?? DEFAULT_MIN_MESSAGES_TO_SLEEP,
  };
}

function shouldSleep(params: {
  entry?: Pick<ConversationEntry, "totalTokens" | "sleepCount" | "sleepAt">;
  config: SleepConfig;
  conversationMessageCount?: number;
}): boolean {
  const totalTokens = params.entry?.totalTokens;
  if (!totalTokens || totalTokens <= 0) return false;
  
  if (params.conversationMessageCount !== undefined) {
    if (params.conversationMessageCount < params.config.minMessagesToSleep) {
      return false;
    }
  }

  const lastSleepAt = params.entry?.sleepAt;
  if (lastSleepAt) {
    const cooldownMs = params.config.cooldownMinutes * 60 * 1000;
    if (Date.now() - lastSleepAt < cooldownMs) {
      return false;
    }
  }
  
  return true;
}

export async function runSleepModeIfNeeded(params: {
  config: ZuckermanConfig;
  conversationManager: ConversationManager;
  conversationId: string;
  agentId: string;
  homedir: string;
}): Promise<ConversationEntry | undefined> {
  const { config, conversationManager, conversationId, agentId, homedir } = params;

  const sleepConfig = resolveSleepConfig({
    sleep: config.agent?.sleep,
    memoryFlush: config.agent?.memoryFlush,
  });

  if (!sleepConfig) return undefined;

  const conversation = conversationManager.getConversation(conversationId);
  if (!conversation) return undefined;

  const conversationKey = deriveConversationKey(agentId, conversation.conversation.type, conversation.conversation.label);
  const storePath = conversationManager.getStorePath();
  const store = loadConversationStore(storePath);
  const entry = store[conversationKey];

  if (!shouldSleep({
    entry,
    config: sleepConfig,
    conversationMessageCount: conversation.messages?.length,
  })) {
    return entry;
  }

  try {
    const memoryManager = new MemorySystem(homedir, agentId);
    const allMemories = memoryManager.getMemories({ format: "full" }) as Memory[];
    
    if (allMemories.length > 0) {
      const model = await LLMProvider.getInstance().fastCheap();
      const memoryList = allMemories.map(m => `- [${m.id}] ${m.type}: ${m.content}`).join("\n");
      
      const response = await generateText({
        model,
        system: `Review all memories and determine which ones are still relevant and should be kept. Remove outdated, redundant, or irrelevant memories. Return only the IDs of memories to keep.`,
        messages: [
          { role: "user" as const, content: `Memories:\n${memoryList}\n\nWhich memory IDs should be kept?` },
        ],
        output: Output.object({ schema: z.object({ keepIds: z.array(z.string()) }) }),
        temperature: 0.3,
      });
      
      // Remove memories that are not in the keep list
      const keepIds = new Set(response.output.keepIds);
      const allMemoryTypes: MemoryType[] = [
        "semantic",
        "episodic",
        "procedural",
        "prospective",
        "emotional",
        "working",
      ];
      
      for (const type of allMemoryTypes) {
        const memories = memoryManager.getMemories({ type, format: "full" }) as Memory[];
        for (const memory of memories) {
          if (!keepIds.has(memory.id)) {
            memoryManager.remove(type, memory.id);
          }
        }
      }
    }

    const updatedEntry = await conversationManager.updateConversationEntry(conversationId, (current) => ({
      sleepCount: (current.sleepCount ?? 0) + 1,
      sleepAt: Date.now(),
      memoryFlushCount: (current.memoryFlushCount ?? 0) + 1,
      memoryFlushAt: Date.now(),
    }));

    return updatedEntry || entry;
  } catch (err) {
    console.warn(`[SleepMode] Sleep mode run failed:`, err);
    return entry;
  }
}
