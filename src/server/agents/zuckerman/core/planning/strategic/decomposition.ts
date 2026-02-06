/**
 * Goal Decomposer
 * LLM-based goal decomposition into sub-goals and tasks
 */

import type { GoalTaskNode, DecompositionResult, TaskUrgency } from "../types.js";
import type { MemoryManager, SemanticMemory, EpisodicMemory } from "../../memory/types.js";
import type { LLMMessage } from "@server/world/providers/llm/types.js";
import { LLMManager } from "@server/world/providers/llm/index.js";
import { StepSequenceManager } from "../tactical/steps.js";
import { randomUUID } from "node:crypto";

/**
 * Decomposition context - tracks what was used during decomposition
 */
interface DecompositionContext {
  urgency: TaskUrgency;
  memoryHash?: string; // Hash of relevant memories at time of decomposition
  timestamp: number;
}

export class GoalDecomposer {
  private llmManager: LLMManager;
  private memoryManager: MemoryManager | null = null;
  private stepManager: StepSequenceManager;

  constructor(memoryManager?: MemoryManager | null) {
    this.llmManager = LLMManager.getInstance();
    this.memoryManager = memoryManager || null;
    this.stepManager = new StepSequenceManager();
  }

  /**
   * Set memory manager (for memory integration)
   */
  setMemoryManager(memoryManager: MemoryManager): void {
    this.memoryManager = memoryManager;
  }

  /**
   * Calculate context hash for change detection
   */
  private async calculateContextHash(
    goal: GoalTaskNode,
    urgency: TaskUrgency
  ): Promise<string> {
    const parts: string[] = [
      goal.title,
      goal.description || "",
      urgency,
    ];

    // Include memory state in hash
    if (this.memoryManager) {
      try {
        const semanticResult = await this.memoryManager.getRelevantMemories(goal.title, {
          types: ["semantic"],
          limit: 5,
        });
        const episodicResult = await this.memoryManager.getRelevantMemories(goal.title, {
          types: ["episodic"],
          limit: 3,
        });
        
        parts.push(
          semanticResult.memories.map((m: any) => m.id).join(","),
          episodicResult.memories.map((m: any) => m.id).join(",")
        );
      } catch (error) {
        // Ignore errors in hash calculation
      }
    }

    // Simple hash (could use crypto.createHash for production)
    return parts.join("|");
  }

  /**
   * Get stored decomposition context from goal metadata
   */
  private getStoredContext(goal: GoalTaskNode): DecompositionContext | null {
    const context = goal.metadata?.decompositionContext as DecompositionContext | undefined;
    return context || null;
  }

  /**
   * Store decomposition context in goal metadata
   */
  private storeContext(goal: GoalTaskNode, context: DecompositionContext): void {
    if (!goal.metadata) {
      goal.metadata = {};
    }
    goal.metadata.decompositionContext = context;
    goal.updatedAt = Date.now();
  }

  /**
   * Check if context has changed significantly
   */
  async hasContextChanged(
    goal: GoalTaskNode,
    urgency: TaskUrgency
  ): Promise<boolean> {
    const storedContext = this.getStoredContext(goal);
    if (!storedContext) {
      return true; // No previous context, consider it changed
    }

    const currentHash = await this.calculateContextHash(goal, urgency);
    
    // Check if urgency changed
    if (storedContext.urgency !== urgency) {
      return true;
    }

    // Check if memory hash changed (new memories added)
    if (storedContext.memoryHash !== currentHash) {
      return true;
    }

    return false;
  }

  /**
   * Query memory for comprehensive context
   * ENHANCED: Queries multiple memory types with expanded queries
   */
  private async queryMemoryContext(goal: GoalTaskNode): Promise<string> {
    if (!this.memoryManager) {
      return "";
    }

    let memoryContext = "";
    try {
      // Query semantic memory with multiple strategies
      const titleResult = await this.memoryManager.getRelevantMemories(goal.title, {
        types: ["semantic"],
        limit: 5,
      });
      const titleQuery = titleResult.memories.filter((m: any) => m.type === "semantic");
      
      const descriptionResult = goal.description
        ? await this.memoryManager.getRelevantMemories(goal.description, {
            types: ["semantic"],
            limit: 3,
          })
        : { memories: [] };
      const descriptionQuery = descriptionResult.memories.filter((m: any) => m.type === "semantic");

      // Query episodic memory for similar completions
      const episodicResult = await this.memoryManager.getRelevantMemories(goal.title, {
        types: ["episodic"],
        limit: 5, // Increased from 3
      });
      const episodicMemories = episodicResult.memories.filter((m: any) => m.type === "episodic");

      // Query for related goals (category-based) - use semantic search
      const relatedResult = await this.memoryManager.getRelevantMemories("goal", {
        types: ["semantic"],
        limit: 5,
      });
      const relatedGoals = relatedResult.memories.filter((m: any) => m.type === "semantic" && (m as any).category === "goal");

      // Combine and deduplicate semantic memories
      const allSemantic = new Map<string, any>();
      [...titleQuery, ...descriptionQuery].forEach(mem => {
        if (!allSemantic.has(mem.id)) {
          allSemantic.set(mem.id, mem);
        }
      });

      if (allSemantic.size > 0 || episodicMemories.length > 0 || relatedGoals.length > 0) {
        memoryContext = "\n\nRelevant Memory Context:\n";
        
        if (allSemantic.size > 0) {
          memoryContext += "Related Facts/Knowledge:\n";
          Array.from(allSemantic.values()).forEach((mem) => {
            const semantic = mem as SemanticMemory;
            memoryContext += `- ${semantic.fact}${semantic.category ? ` (${semantic.category})` : ""}\n`;
          });
        }

        if (relatedGoals.length > 0) {
          memoryContext += "\nRelated Goals:\n";
          relatedGoals
            .filter((g: any) => {
              const semantic = g as SemanticMemory;
              return semantic.fact.toLowerCase().includes("goal:");
            })
            .slice(0, 3)
            .forEach((mem) => {
              const semantic = mem as SemanticMemory;
              memoryContext += `- ${semantic.fact}\n`;
            });
        }

        if (episodicMemories.length > 0) {
          memoryContext += "\nSimilar Past Experiences:\n";
          episodicMemories.forEach((mem) => {
            const episodic = mem as EpisodicMemory;
            memoryContext += `- ${episodic.event}: ${episodic.context.what}${episodic.context.why ? ` (${episodic.context.why})` : ""}\n`;
          });
        }
      }
    } catch (error) {
      console.warn(`[GoalDecomposer] Failed to query memory:`, error);
    }

    return memoryContext;
  }

  /**
   * Decompose goal into sub-goals and tasks using LLM
   * ENHANCED: Queries memory for relevant context, tracks context for re-decomposition
   */
  async decomposeGoal(
    goal: GoalTaskNode,
    urgency: TaskUrgency,
    focus: null,
    forceRecompose: boolean = false
  ): Promise<DecompositionResult> {
    const model = await this.llmManager.fastCheap();

    // Query memory for comprehensive context
    const memoryContext = await this.queryMemoryContext(goal);

    // Calculate and store context hash
    const contextHash = await this.calculateContextHash(goal, urgency);
    const decompositionContext: DecompositionContext = {
      urgency,
      memoryHash: contextHash,
      timestamp: Date.now(),
    };

    const systemPrompt = `You are a strategic planning system. Decompose the given goal into a hierarchical structure of sub-goals and actionable tasks.

Rules:
1. Break down complex goals into 2-5 sub-goals or tasks
2. Sub-goals can have their own children (nested decomposition)
3. Tasks are leaf nodes (no children) - they are actionable items that can be executed directly
4. Tasks should be simple enough to complete in 1-3 tactical steps (if more complex, make it a sub-goal)
5. Determine execution order (order field: 0, 1, 2, ...)
6. For tasks, determine urgency and priority
7. Consider dependencies: earlier tasks/goals must complete before later ones
8. Use relevant memory context if provided to inform decomposition
9. Think about tactical execution: tasks will be broken down into steps later, so keep tasks focused and actionable

Return JSON:
{
  "children": [
    {
      "type": "goal" | "task",
      "title": "sub-goal or task title",
      "description": "detailed description",
      "order": 0,
      "urgency": "low" | "medium" | "high" | "critical" (only for tasks),
      "priority": 0.0-1.0 (only for tasks)
    }
  ]
}

Return ONLY valid JSON, no other text.`;

    const context = `Urgency: ${urgency}\n\nGoal: ${goal.title}\nDescription: ${goal.description || ""}${memoryContext}`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: context },
    ];

    try {
      const response = await model.call({
        messages,
        temperature: 0.3,
        maxTokens: 1000,
      });
      const content = response.content.trim();

      // Extract JSON from response (handle markdown code blocks)
      let jsonContent = content;
      if (content.includes("```json")) {
        jsonContent = content.split("```json")[1].split("```")[0].trim();
      } else if (content.includes("```")) {
        jsonContent = content.split("```")[1].split("```")[0].trim();
      }

      // Parse JSON response
      const parsed = JSON.parse(jsonContent);

      // Convert to GoalTaskNode[] and validate with tactical planning
      const children: GoalTaskNode[] = await Promise.all(
        parsed.children.map(async (child: any, index: number) => {
          let nodeType = child.type;
          let taskDescription = child.description || child.title;

          // Use tactical planning to validate tasks
          if (child.type === "task") {
            try {
              // Pre-validate task with tactical planning
              const steps = await this.stepManager.decomposeWithLLM(
                taskDescription,
                child.urgency || urgency,
                null
              );

              // If task needs many steps (complex), consider making it a sub-goal
              // Tasks with 4+ steps might be better as sub-goals
              if (steps.length >= 4) {
                // Convert complex task to sub-goal
                nodeType = "goal";
                // Store tactical steps in metadata for reference
                taskDescription = `${taskDescription} (requires ${steps.length} steps)`;
              } else if (steps.length > 0) {
                // Store pre-computed steps in metadata for later use
                child.metadata = child.metadata || {};
                child.metadata.precomputedSteps = steps.map((s: any) => ({
                  title: s.title,
                  description: s.description,
                  order: s.order,
                  requiresConfirmation: s.requiresConfirmation,
                }));
              }
            } catch (error) {
              console.warn(`[GoalDecomposer] Tactical validation failed for task "${child.title}":`, error);
              // Continue with original task type if tactical planning fails
            }
          }

          const node: GoalTaskNode = {
            id: `${goal.id}-child-${index}-${randomUUID().slice(0, 8)}`,
            type: nodeType,
            title: child.title,
            description: taskDescription,
            order: child.order !== undefined ? child.order : index,
            source: goal.source,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            children: [],
            parentId: goal.id,
            metadata: child.metadata || {},
          };

          if (nodeType === "goal") {
            node.goalStatus = "active";
            node.progress = 0;
          } else {
            node.taskStatus = "pending";
            node.urgency = child.urgency || "medium";
            node.priority = child.priority !== undefined ? child.priority : 0.5;
          }

          return node;
        })
      );

      // Store decomposition context
      this.storeContext(goal, decompositionContext);

      return {
        parentNodeId: goal.id,
        children,
        executionOrder: children.map((_, i) => i),
      };
    } catch (error) {
      console.error("[GoalDecomposer] LLM decomposition failed:", error);
      // Fallback: return empty decomposition
      return {
        parentNodeId: goal.id,
        children: [],
        executionOrder: [],
      };
    }
  }

  /**
   * Re-decompose goal (clears existing children and creates new decomposition)
   * ENHANCED: Automatically detects if re-decomposition is needed
   */
  async redecomposeGoal(
    goal: GoalTaskNode,
    urgency: TaskUrgency,
    focus: null
  ): Promise<DecompositionResult | null> {
    // Check if context has changed
    const contextChanged = await this.hasContextChanged(goal, urgency);
    
    if (!contextChanged && goal.children.length > 0) {
      // Context hasn't changed, no need to re-decompose
      return null;
    }

    // Clear existing children (they will be replaced)
    goal.children = [];
    goal.updatedAt = Date.now();

    // Perform new decomposition
    return await this.decomposeGoal(goal, urgency, focus, true);
  }

  /**
   * Check if goal should be decomposed
   */
  shouldDecompose(node: GoalTaskNode): boolean {
    // Decompose if:
    // 1. It's a goal (not a task)
    // 2. Has no children yet
    // 3. Is active
    return node.type === "goal" && node.children.length === 0 && node.goalStatus === "active";
  }

  /**
   * Check if goal should be re-decomposed
   */
  async shouldRedecompose(
    node: GoalTaskNode,
    urgency: TaskUrgency,
    focus: null
  ): Promise<boolean> {
    if (node.type !== "goal" || node.goalStatus !== "active") {
      return false;
    }

    // Re-decompose if context has changed
    return await this.hasContextChanged(node, urgency);
  }
}
