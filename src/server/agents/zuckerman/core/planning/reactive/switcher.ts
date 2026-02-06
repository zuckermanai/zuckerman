/**
 * Reactive Planning - Task switching
 * Handles task switching logic with LLM-based continuity assessment
 */

import type { GoalTaskNode } from "../types.js";
import { SwitchingAgent, type SwitchingDecision } from "./agent.js";

/**
 * Task context for resumption
 */
export interface TaskContext {
  taskId: string;
  savedAt: number;
  context: Record<string, unknown>;
}

/**
 * Task Switcher
 */
export class TaskSwitcher {
  private savedContexts: Map<string, TaskContext> = new Map();
  private switchHistory: Array<{ from: string; to: string; timestamp: number }> = [];
  private agent: SwitchingAgent;

  constructor() {
    this.agent = new SwitchingAgent();
  }

  /**
   * Determine if should switch from current task to new task (LLM-based)
   */
  async shouldSwitchWithLLM(
    currentTask: GoalTaskNode | null,
    newTask: GoalTaskNode,
    currentFocus: null
  ): Promise<SwitchingDecision> {
    return await this.agent.decideSwitch(currentTask, newTask, null);
  }

  /**
   * Perform task switch
   */
  switchTask(fromTask: GoalTaskNode | null, toTask: GoalTaskNode): void {
    // Save context of current task if exists
    if (fromTask && fromTask.type === "task") {
      this.saveTaskContext(fromTask.id, {
        progress: fromTask.progress || 0,
        status: fromTask.taskStatus || "pending",
        metadata: fromTask.metadata || {},
      });
    }

    // Record switch in history
    this.switchHistory.push({
      from: fromTask?.id || "none",
      to: toTask.id,
      timestamp: Date.now(),
    });

    // Limit history size
    if (this.switchHistory.length > 100) {
      this.switchHistory.shift();
    }
  }

  /**
   * Get switch history
   */
  getSwitchHistory(): Array<{ from: string; to: string; timestamp: number }> {
    return [...this.switchHistory];
  }

  /**
   * Save task context for resumption
   */
  saveTaskContext(taskId: string, context: Record<string, unknown>): void {
    this.savedContexts.set(taskId, {
      taskId,
      savedAt: Date.now(),
      context,
    });
  }

  /**
   * Get saved task context
   */
  getTaskContext(taskId: string): TaskContext | null {
    return this.savedContexts.get(taskId) || null;
  }

  /**
   * Clear saved context for task
   */
  clearContext(taskId: string): void {
    this.savedContexts.delete(taskId);
  }
}
