/**
 * Strategic Planning Agent
 * Role: You handle goal decomposition. Given a goal, decide how to break it down into sub-goals and tasks.
 */

import type { GoalTaskNode, DecompositionResult, TaskUrgency } from "../types.js";
import type { MemoryManager } from "../../memory/types.js";
import type { LLMMessage } from "@server/world/providers/llm/types.js";
import { LLMManager } from "@server/world/providers/llm/index.js";
import { randomUUID } from "node:crypto";

export class StrategicAgent {
  private llmManager: LLMManager;
  private memoryManager: MemoryManager | null = null;

  constructor(memoryManager?: MemoryManager | null) {
    this.llmManager = LLMManager.getInstance();
    this.memoryManager = memoryManager || null;
  }

  setMemoryManager(memoryManager: MemoryManager): void {
    this.memoryManager = memoryManager;
  }


  /**
   * Decompose goal using LLM
   */
  async decomposeGoal(
    goal: GoalTaskNode,
    urgency: TaskUrgency,
    focus: null
  ): Promise<DecompositionResult> {
    const model = await this.llmManager.fastCheap();

    const systemPrompt = `You are responsible for strategic planning. Your role is to decompose goals into sub-goals and tasks.

Given a goal, decide how to break it down. Return your decision as JSON.`;

    const context = `Goal: ${goal.title}
${goal.description ? `Description: ${goal.description}` : ""}
Urgency: ${urgency}`;

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
      let jsonContent = content;
      if (content.includes("```json")) {
        jsonContent = content.split("```json")[1].split("```")[0].trim();
      } else if (content.includes("```")) {
        jsonContent = content.split("```")[1].split("```")[0].trim();
      }

      const parsed = JSON.parse(jsonContent);

      const children: GoalTaskNode[] = (parsed.children || []).map((child: any, index: number) => ({
        id: `${goal.id}-child-${index}-${randomUUID().slice(0, 8)}`,
        type: child.type || "task",
        title: child.title,
        description: child.description || child.title,
        order: child.order ?? index,
        source: goal.source,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        children: [],
        parentId: goal.id,
        metadata: child.metadata || {},
        ...(child.type === "goal" 
          ? { goalStatus: "active" as const, progress: 0 }
          : { 
              taskStatus: "pending" as const,
              urgency: child.urgency || urgency,
              priority: child.priority ?? 0.5
            }
        ),
      }));

      return {
        parentNodeId: goal.id,
        children,
        executionOrder: children.map((_, i) => i),
      };
    } catch (error) {
      console.error("[StrategicAgent] Decomposition failed:", error);
      return {
        parentNodeId: goal.id,
        children: [],
        executionOrder: [],
      };
    }
  }

  /**
   * Check if goal should be decomposed
   */
  async shouldDecompose(goal: GoalTaskNode): Promise<boolean> {
    if (goal.type !== "goal" || goal.goalStatus !== "active") {
      return false;
    }

    if (goal.children.length > 0) {
      return false;
    }

    // Use LLM to decide if decomposition is needed
    const model = await this.llmManager.fastCheap();
    const systemPrompt = `You are responsible for strategic planning. Decide if a goal needs to be decomposed into smaller parts.`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Goal: ${goal.title}\n${goal.description || ""}\n\nDoes this goal need to be broken down into smaller parts? Return JSON: {"needsDecomposition": true/false, "reasoning": "why"}` },
    ];

    try {
      const response = await model.call({
        messages,
        temperature: 0.3,
        maxTokens: 200,
      });

      const content = response.content.trim();
      const jsonMatch = content.match(/\{.*\}/s);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { needsDecomposition: true };
      
      return Boolean(parsed.needsDecomposition);
    } catch (error) {
      // Default to decomposing if LLM fails
      return true;
    }
  }
}
