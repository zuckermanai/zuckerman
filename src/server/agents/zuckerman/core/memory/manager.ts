/**
 * Unified Memory Manager
 * Coordinates all memory types and provides unified interface
 */

import { WorkingMemoryStore } from "./stores/working/index.js";
import { EpisodicMemoryStore } from "./stores/episodic/index.js";
import { SemanticMemoryStore } from "./stores/semantic/index.js";
import { ProceduralMemoryStore } from "./stores/procedural/index.js";
import { ProspectiveMemoryStore } from "./stores/prospective/index.js";
import { EmotionalMemoryStore } from "./stores/emotional/index.js";
import type {
  MemoryManager,
  MemoryType,
  WorkingMemory,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  ProspectiveMemory,
  EmotionalMemory,
  MemoryRetrievalOptions,
  MemoryRetrievalResult,
  BaseMemory,
} from "./types.js";

import { extractMemoriesFromMessage } from "./memory-classifier.js";
import type { ResolvedMemorySearchConfig } from "./config.js";
import { initializeDatabase } from "./retrieval/db.js";
import { existsSync, readFileSync } from "node:fs";

export class UnifiedMemoryManager implements MemoryManager {
  private workingMemory: WorkingMemoryStore;
  private episodicMemory: EpisodicMemoryStore;
  private semanticMemory: SemanticMemoryStore;
  private proceduralMemory: ProceduralMemoryStore;
  private prospectiveMemory: ProspectiveMemoryStore;
  private emotionalMemory: EmotionalMemoryStore;

  private homedir?: string;
  private agentId?: string;
  private dbInitialized: boolean = false;

  constructor(homedir?: string, agentId?: string) {
    this.homedir = homedir;
    this.agentId = agentId || "zuckerman";

    this.workingMemory = new WorkingMemoryStore();
    this.episodicMemory = new EpisodicMemoryStore(this.agentId);
    this.semanticMemory = new SemanticMemoryStore(this.agentId);
    this.proceduralMemory = new ProceduralMemoryStore(this.agentId);
    this.prospectiveMemory = new ProspectiveMemoryStore(this.agentId);
    this.emotionalMemory = new EmotionalMemoryStore(this.agentId);
  }


  /**
   * Create a memory manager instance from homedir directory and agent ID
   */
  static create(homedir: string, agentId?: string): UnifiedMemoryManager {
    return new UnifiedMemoryManager(homedir, agentId);
  }

  /**
   * Initialize the vector database for memory search.
   * This should be called once when the agent starts, before any memory operations.
   */
  async initializeDatabase(
    config: ResolvedMemorySearchConfig,
    agentId: string,
  ): Promise<void> {
    if (this.dbInitialized) return;

    if (!this.homedir) {
      console.warn("[Memory] Cannot initialize database: homedir not set");
      return;
    }

    try {
      const embeddingCacheTable = "embedding_cache";
      const ftsTable = "fts_memory";

      initializeDatabase(
        config,
        this.homedir,
        agentId,
        embeddingCacheTable,
        ftsTable,
      );

      this.dbInitialized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Memory] Failed to initialize database:`, message);
      // Don't throw - allow memory manager to work without vector search
    }
  }

  // ========== Internal Memory Management ==========
  // These methods are private and only used internally

  private addEpisodicMemory(
    memory: Omit<EpisodicMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.episodicMemory.add(memory);
  }

  private addSemanticMemory(
    memory: Omit<SemanticMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.semanticMemory.add(memory);
  }

  private addProceduralMemory(
    memory: Omit<ProceduralMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.proceduralMemory.add(memory);
  }

  private addProspectiveMemory(
    memory: Omit<ProspectiveMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.prospectiveMemory.add(memory);
  }

  private addEmotionalMemory(
    memory: Omit<EmotionalMemory, "id" | "type" | "createdAt" | "updatedAt">
  ): string {
    return this.emotionalMemory.add(memory);
  }


  // ========== Event-Driven Memory Methods ==========

  /**
   * Save consolidated memories from sleep mode
   * Creates structured episodic/semantic memories
   */
  saveConsolidatedMemories(
    memories: Array<{
      content: string;
      type: "fact" | "preference" | "decision" | "event" | "learning";
      importance: number;
    }>,
    conversationId?: string
  ): void {
    for (const memory of memories) {
      // Always save as semantic memory (long-term)
      this.addSemanticMemory({
        fact: memory.content,
        category: memory.type,
        confidence: memory.importance,
        source: conversationId,
      });
    }
  }

  /**
   * Process a new user message and extract/save important memories
   * This is called by the runtime when a new user message arrives
   */
  async onNewMessage(
    userMessage: string,
    conversationId?: string,
    conversationContext?: string
  ): Promise<void> {
    try {
      const extractionResult = await extractMemoriesFromMessage(
        userMessage,
        conversationContext
      );

      if (extractionResult.hasImportantInfo && extractionResult.memories.length > 0) {
        const now = Date.now();

        for (const memory of extractionResult.memories) {
          // Save to semantic memory (long-term): facts, preferences, learnings
          if (memory.type === "fact" || memory.type === "preference" || memory.type === "learning") {
            // Use structured data if available for better fact extraction
            const fact = memory.structuredData
              ? Object.entries(memory.structuredData)
                .filter(([k]) => k !== "field")
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ") || memory.content
              : memory.content;

            this.addSemanticMemory({
              fact,
              category: memory.type,
              confidence: memory.importance,
              source: conversationId,
            });
          }
          // Save to episodic memory (time-bound): decisions, events
          else if (memory.type === "decision" || memory.type === "event") {
            this.addEpisodicMemory({
              event: memory.type === "event" ? memory.content : `${memory.type}: ${memory.content}`,
              timestamp: now,
              context: {
                what: memory.content,
                when: now,
                why: `Importance: ${memory.importance.toFixed(2)}, Type: ${memory.type}`,
              },
              conversationId,
            });
          }
        }
      }
    } catch (extractionError) {
      // Don't fail if extraction fails - just log and continue
      console.warn(`[UnifiedMemoryManager] Memory extraction failed:`, extractionError);
    }
  }

  /**
   * Get relevant memories for a question/query
   * Fetches all memories from specified memory types
   */
  async getRelevantMemories(
    question: string,
    options?: {
      limit?: number;
      types?: MemoryType[];
    }
  ): Promise<MemoryRetrievalResult> {
    const allMemories: BaseMemory[] = [];
    const types = options?.types ?? ["semantic", "episodic", "procedural"];
    const limit = options?.limit ?? 20;

    // Fetch semantic memories (facts, knowledge)
    if (types.includes("semantic")) {
      const semanticMemories = this.semanticMemory.getAll();
      console.log(`[UnifiedMemoryManager] Semantic memories:`, semanticMemories);
      allMemories.push(...semanticMemories);
    }

    // Fetch episodic memories (events, experiences)
    if (types.includes("episodic")) {
      const episodicMemories = this.episodicMemory.getAll();
      allMemories.push(...episodicMemories);
    }

    // Fetch procedural memories (patterns, skills)
    if (types.includes("procedural")) {
      const proceduralMemories = this.proceduralMemory.getAll();
      allMemories.push(...proceduralMemories);
    }

    // Sort by recency (newest first)
    allMemories.sort((a, b) => b.updatedAt - a.updatedAt);

    // Apply final limit
    const limited = allMemories.slice(0, limit);

    return {
      memories: limited,
      total: allMemories.length,
    };
  }

  /**
   * Record goal creation event
   */
  onGoalCreated(
    goalId: string,
    title: string,
    description?: string,
    conversationId?: string
  ): void {
    const now = Date.now();
    this.addEpisodicMemory({
      event: `Goal created: ${title}`,
      timestamp: now,
      context: {
        what: `Created goal "${title}"${description ? `: ${description}` : ""}`,
        when: now,
        why: "New goal added to planning system",
      },
      conversationId,
    });

    // Also save as semantic memory for long-term reference
    this.addSemanticMemory({
      fact: `Goal: ${title}${description ? ` - ${description}` : ""}`,
      category: "goal",
      confidence: 1.0,
      source: conversationId,
    });
  }

  /**
   * Record task creation event
   */
  onTaskCreated(
    taskId: string,
    title: string,
    description?: string,
    urgency?: string,
    parentId?: string,
    conversationId?: string
  ): void {
    const now = Date.now();
    this.addEpisodicMemory({
      event: `Task created: ${title}`,
      timestamp: now,
      context: {
        what: `Created task "${title}"${description ? `: ${description}` : ""}`,
        when: now,
        why: urgency ? `Urgency: ${urgency}` : "New task added to planning system",
      },
      conversationId,
    });
  }

  /**
   * Record task completion event
   */
  onTaskCompleted(
    taskId: string,
    title: string,
    result?: unknown,
    executionTime?: number,
    conversationId?: string
  ): void {
    const now = Date.now();
    const resultSummary = result ? (typeof result === "string" ? result : JSON.stringify(result).slice(0, 100)) : "completed successfully";
    const timeInfo = executionTime ? ` (took ${Math.round(executionTime / 1000)}s)` : "";

    this.addEpisodicMemory({
      event: `Task completed: ${title}`,
      timestamp: now,
      context: {
        what: `Completed task "${title}"${timeInfo}`,
        when: now,
        why: resultSummary,
      },
      conversationId,
    });

    // Learn from successful task completion as procedural memory
    this.addProceduralMemory({
      pattern: title.toLowerCase(),
      trigger: title,
      action: `Complete task: ${title}`,
      successRate: 1.0,
      lastUsed: now,
      useCount: 1,
    });
  }

  /**
   * Record task failure event
   */
  onTaskFailed(
    taskId: string,
    title: string,
    error: string,
    conversationId?: string
  ): void {
    const now = Date.now();
    this.addEpisodicMemory({
      event: `Task failed: ${title}`,
      timestamp: now,
      context: {
        what: `Failed to complete task "${title}"`,
        when: now,
        why: error,
      },
      conversationId,
    });

    // Record emotional memory for frustration
    this.addEmotionalMemory({
      targetMemoryId: taskId,
      targetMemoryType: "episodic",
      tag: {
        emotion: "frustration",
        intensity: "medium",
        timestamp: now,
      },
      context: `Task "${title}" failed with error: ${error}`,
    });
  }

  /**
   * Record step completion event
   */
  onStepCompleted(
    taskId: string,
    stepTitle: string,
    stepOrder: number,
    conversationId?: string
  ): void {
    const now = Date.now();
    this.addEpisodicMemory({
      event: `Step completed: ${stepTitle}`,
      timestamp: now,
      context: {
        what: `Completed step ${stepOrder}: "${stepTitle}"`,
        when: now,
        why: `Part of task ${taskId}`,
      },
      conversationId,
    });
  }

  /**
   * Record step failure event
   */
  onStepFailed(
    taskId: string,
    stepTitle: string,
    stepOrder: number,
    error: string,
    conversationId?: string
  ): void {
    const now = Date.now();
    this.addEpisodicMemory({
      event: `Step failed: ${stepTitle}`,
      timestamp: now,
      context: {
        what: `Failed step ${stepOrder}: "${stepTitle}"`,
        when: now,
        why: error,
      },
      conversationId,
    });
  }

  /**
   * Record fallback strategy triggered event
   */
  onFallbackTriggered(
    originalTaskId: string,
    originalTaskTitle: string,
    fallbackTaskId: string,
    fallbackTaskTitle: string,
    error: string,
    conversationId?: string
  ): void {
    const now = Date.now();
    this.addEpisodicMemory({
      event: `Fallback triggered: ${fallbackTaskTitle}`,
      timestamp: now,
      context: {
        what: `Created fallback task "${fallbackTaskTitle}" after "${originalTaskTitle}" failed`,
        when: now,
        why: error,
      },
      conversationId,
    });

    // Learn from fallback as procedural memory
    this.addProceduralMemory({
      pattern: originalTaskTitle.toLowerCase(),
      trigger: `When "${originalTaskTitle}" fails`,
      action: `Try fallback: ${fallbackTaskTitle}`,
      successRate: 0.5, // Start with lower confidence
      lastUsed: now,
      useCount: 1,
    });
  }

  /**
   * Record goal completion event
   */
  onGoalCompleted(
    goalId: string,
    title: string,
    conversationId?: string
  ): void {
    const now = Date.now();
    this.addEpisodicMemory({
      event: `Goal completed: ${title}`,
      timestamp: now,
      context: {
        what: `Successfully completed goal "${title}"`,
        when: now,
        why: "All tasks completed",
      },
      conversationId,
    });

    // Update semantic memory with completion status
    this.addSemanticMemory({
      fact: `Completed goal: ${title}`,
      category: "achievement",
      confidence: 1.0,
      source: conversationId,
    });

    // Record positive emotional memory
    this.addEmotionalMemory({
      targetMemoryId: goalId,
      targetMemoryType: "episodic",
      tag: {
        emotion: "satisfaction",
        intensity: "high",
        timestamp: now,
      },
      context: `Successfully completed goal "${title}"`,
    });
  }
}
