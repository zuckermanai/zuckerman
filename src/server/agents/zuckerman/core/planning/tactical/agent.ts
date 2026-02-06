/**
 * Tactical Planning Agent
 * Role: You handle task execution steps. Given a task, decide the steps needed to complete it.
 */

import type { TaskStep } from "./steps.js";
import type { TaskUrgency } from "../types.js";
import type { LLMMessage } from "@server/world/providers/llm/types.js";
import { LLMManager } from "@server/world/providers/llm/index.js";

export class TacticalAgent {
  private llmManager: LLMManager;

  constructor() {
    this.llmManager = LLMManager.getInstance();
  }

  /**
   * Decompose task into steps using LLM
   */
  async decomposeTask(
    message: string,
    urgency: TaskUrgency,
    focus: null
  ): Promise<TaskStep[]> {
    const model = await this.llmManager.fastCheap();

    const systemPrompt = `You are responsible for tactical planning. Your role is to break down tasks into actionable steps.

Given a task, decide what steps are needed to complete it. Return your decision as JSON.

IMPORTANT: Each step must have a clear, descriptive title that explains what action will be performed. Do NOT use generic titles like "Step 1", "Step 2", or numbered steps. Use action verbs and be specific (e.g., "Create project directory", "Install npm dependencies", "Write configuration file").`;

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
      let jsonStr = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      
      const parsed = JSON.parse(jsonStr);

      if (parsed.stepsRequired === false || (Array.isArray(parsed.steps) && parsed.steps.length === 0)) {
        return [];
      }

      const stepsArray = parsed.steps || [];
      
      if (!Array.isArray(stepsArray)) {
        return this.createFallbackStep(message);
      }

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
      console.warn(`[TacticalAgent] Decomposition failed:`, error);
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
}
