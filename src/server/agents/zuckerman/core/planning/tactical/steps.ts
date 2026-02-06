/**
 * Tactical Planning - Step sequences
 * Manages step-by-step task execution
 */

import type { GoalTaskNode, TaskUrgency } from "../types.js";
import { TacticalAgent } from "./agent.js";
import { LLMManager } from "@server/world/providers/llm/index.js";
import type { LLMMessage } from "@server/world/providers/llm/types.js";

/**
 * Task step
 */
export interface TaskStep {
  id: string;
  title: string;
  description?: string;
  order: number;
  completed: boolean;
  requiresConfirmation: boolean; // LLM decides if step needs user confirmation
  confirmationReason?: string; // Why confirmation is needed
  result?: unknown;
  error?: string;
}

/**
 * Step sequence manager
 */
export class StepSequenceManager {
  private agent: TacticalAgent;

  constructor() {
    this.agent = new TacticalAgent();
  }

  /**
   * Decompose task into steps using LLM
   */
  async decomposeWithLLM(
    message: string,
    urgency: TaskUrgency,
    focus: null
  ): Promise<TaskStep[]> {
    return this.agent.decomposeTask(message, urgency, null);
  }

  /**
   * Legacy method - delegates to agent
   */
  async decomposeWithLLMLegacy(
    message: string,
    urgency: TaskUrgency,
    focus: null
  ): Promise<TaskStep[]> {
    const llmManager = LLMManager.getInstance();
    const model = await llmManager.fastCheap();

    const systemPrompt = `You are the tactical planning system. Analyze the user's request and determine if it needs to be broken down into steps.

If the task is simple and can be completed in a single action without needing tactical planning, set stepsRequired to false and return an empty steps array.

If the task requires multiple steps or tactical planning, set stepsRequired to true and break it down into clear, actionable steps. For each step, determine if it requires user confirmation before execution.

Steps that require confirmation:
- File deletion or modification
- System configuration changes
- Network operations
- Potentially destructive actions
- Sensitive operations

Return JSON:
{
  "stepsRequired": true/false,
  "steps": [
    {
      "title": "Clear, descriptive action title (e.g., 'Create project directory', 'Install dependencies', NOT 'Step 1' or generic names)",
      "description": "Detailed explanation of what this step does",
      "order": 0,
      "requiresConfirmation": true/false,
      "confirmationReason": "why confirmation is needed (if requiresConfirmation is true)"
    }
  ]
}

IMPORTANT: Each step title must be a clear, actionable description of what will be done. Do NOT use generic titles like "Step 1", "Step 2", or numbered steps. Use descriptive action verbs.

If stepsRequired is false, return an empty steps array.

Return ONLY valid JSON, no other text.`;

    const context = `Urgency: ${urgency}\n\nTask: ${message}`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: context },
    ];

    try {
      const response = await model.call({
        messages,
        temperature: 0.3,
        maxTokens: 500,
      });

      const content = response.content.trim();
      // Try to extract JSON from code blocks first (handles multiline)
      let jsonStr = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      const parsed = JSON.parse(jsonStr);

      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Invalid response format");
      }

      // If steps are not required, return empty array (skip tactical planning)
      if (parsed.stepsRequired === false) {
        return [];
      }

      // If stepsRequired is true or undefined (backward compatibility), process steps
      const stepsArray = parsed.steps || parsed.stepsArray || (Array.isArray(parsed) ? parsed : []);
      
      if (!Array.isArray(stepsArray)) {
        throw new Error("Invalid steps format");
      }

      // Convert to TaskStep format
      const steps: TaskStep[] = stepsArray.map((step: any, index: number) => {
        // Use title if provided, otherwise use description, otherwise use a descriptive fallback
        const title = step.title || step.description || `Complete task step ${index + 1}`;
        return {
          id: `step-${Date.now()}-${index}`,
          title: title,
          description: step.description,
          order: step.order ?? index,
          completed: false,
          requiresConfirmation: Boolean(step.requiresConfirmation),
          confirmationReason: step.confirmationReason,
        };
      });

      return steps.length > 0 ? steps : this.createFallbackStep(message);
    } catch (error) {
      console.warn(`[Tactical] LLM decomposition failed:`, error);
      return this.createFallbackStep(message);
    }
  }

  /**
   * Create fallback step if LLM fails
   */
  private createFallbackStep(message: string): TaskStep[] {
    return [
      {
        id: `step-${Date.now()}-0`,
        title: message,
        order: 0,
        completed: false,
        requiresConfirmation: false,
      },
    ];
  }

  /**
   * Create steps from task description (fallback)
   */
  createSteps(task: GoalTaskNode): TaskStep[] {
    const steps: TaskStep[] = [];

    if (task.description) {
      const stepTexts = task.description.split(/[→\n\-]/).filter((s) => s.trim());
      stepTexts.forEach((text, index) => {
        steps.push({
          id: `${task.id}-step-${index}`,
          title: text.trim(),
          order: index,
          completed: false,
          requiresConfirmation: false,
        });
      });
    }

    if (steps.length === 0) {
      steps.push({
        id: `${task.id}-step-0`,
        title: task.title,
        order: 0,
        completed: false,
        requiresConfirmation: false,
      });
    }

    return steps;
  }

  /**
   * Get current step
   */
  getCurrentStep(steps: TaskStep[]): TaskStep | null {
    return steps.find((s) => !s.completed) || null;
  }

  /**
   * Complete step
   */
  completeStep(steps: TaskStep[], stepId: string, result?: unknown): boolean {
    const step = steps.find((s) => s.id === stepId);
    if (!step) {
      return false;
    }

    step.completed = true;
    step.result = result;
    return true;
  }

  /**
   * Calculate progress from steps
   */
  calculateProgress(steps: TaskStep[]): number {
    if (steps.length === 0) {
      return 0;
    }

    const completed = steps.filter((s) => s.completed).length;
    return Math.round((completed / steps.length) * 100);
  }

  /**
   * Check if all steps completed
   */
  areAllStepsCompleted(steps: TaskStep[]): boolean {
    return steps.every((s) => s.completed);
  }
}
