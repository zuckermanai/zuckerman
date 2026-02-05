/**
 * Planning System
 * Task queue management and planning
 */

import type { Task, PlanningState, PlanningStats, PendingInterruption, ProcessQueueResult } from "./types.js";
import type { MemoryManager } from "../memory/types.js";
import type { FocusState, UrgencyLevel } from "../attention/types.js";
import type { TaskStep } from "./tactical/steps.js";
import type { ExecutiveController } from "../attention/index.js";
import type { LLMMessage } from "@server/world/providers/llm/types.js";
import { TaskQueueManager } from "./queue.js";
import { DependencyManager } from "./hierarchical/index.js";
import { TacticalExecutor, StepSequenceManager } from "./tactical/index.js";
import { TaskSwitcher } from "./reactive/index.js";
import { TemporalScheduler } from "./temporal/index.js";
import { FallbackStrategyManager } from "./contingency/index.js";
import { scoreRelevance } from "../attention/selective/index.js";
import { LLMManager } from "@server/world/providers/llm/index.js";

/**
 * Planning Manager
 * Orchestrates all planning components
 */
export class PlanningManager {
  private agentId: string;
  private queueManager: TaskQueueManager;
  private dependencyManager: DependencyManager;
  private executor: TacticalExecutor;
  private switcher: TaskSwitcher;
  private scheduler: TemporalScheduler;
  private fallbackManager: FallbackStrategyManager;
  private stepManager: StepSequenceManager;
  private stats: PlanningStats;
  private currentFocus: FocusState | null = null;
  private attentionController: ExecutiveController | null = null;
  private pendingInterruption: PendingInterruption | null = null;
  private llmManager: LLMManager;

  constructor(agentId: string, attentionController?: ExecutiveController) {
    this.agentId = agentId;
    this.queueManager = new TaskQueueManager();
    this.dependencyManager = new DependencyManager();
    this.executor = new TacticalExecutor();
    this.switcher = new TaskSwitcher();
    this.scheduler = new TemporalScheduler();
    this.fallbackManager = new FallbackStrategyManager();
    this.stepManager = new StepSequenceManager();
    this.attentionController = attentionController || null;
    this.llmManager = LLMManager.getInstance();
    this.stats = {
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
      averageCompletionTime: 0,
    };
  }

  /**
   * Set attention controller (for bidirectional feedback)
   */
  setAttentionController(controller: ExecutiveController): void {
    this.attentionController = controller;
  }

  /**
   * Set current focus state (from attention system)
   */
  setFocus(focus: FocusState | null): void {
    this.currentFocus = focus;
  }

  /**
   * Decompose task into steps using tactical planning (LLM-based)
   */
  async decomposeTask(
    message: string,
    urgency: UrgencyLevel,
    focus: FocusState | null
  ): Promise<TaskStep[]> {
    return await this.stepManager.decomposeWithLLM(message, urgency, focus);
  }

  /**
   * Add task to queue
   */
  addTask(task: Omit<Task, "id" | "status" | "createdAt" | "updatedAt" | "priority">): string {
    // Calculate priority based on urgency (from attention system)
    const priority = this.calculatePriorityFromUrgency(task.urgency);

    const taskId = this.queueManager.addTask({
      ...task,
      priority,
    });

    // Re-prioritize queue based on attention focus
    this.reprioritizeQueue();

    return taskId;
  }

  /**
   * Calculate priority from urgency level (attention-based)
   */
  private calculatePriorityFromUrgency(urgency: Task["urgency"]): number {
    const urgencyWeights: Record<Task["urgency"], number> = {
      critical: 1.0,
      high: 0.8,
      medium: 0.5,
      low: 0.3,
    };
    return urgencyWeights[urgency];
  }

  /**
   * Process queue - get next task to execute
   * ENHANCED: Uses LLM-based continuity assessment and updates attention
   * Returns ProcessQueueResult which can be a task, pending interruption, or none
   */
  async processQueue(conversationId?: string, originalUserMessage?: string): Promise<ProcessQueueResult> {
    const queue = this.queueManager.getQueue();
    const completedIds = new Set(
      queue.completed.filter((t) => t.status === "completed").map((t) => t.id)
    );

    // Filter ready tasks (dependencies satisfied)
    const readyTasks = this.dependencyManager.filterReadyTasks(queue.pending, completedIds);

    if (readyTasks.length === 0) {
      return { type: "none", task: null };
    }

    // Prioritize ready tasks using attention system
    const prioritized = this.prioritizeByAttention(readyTasks);

    // Get current task
    const currentTask = this.executor.getCurrentTask();

    // Check if should switch using LLM-based continuity assessment
    const nextTask = prioritized[0];
    let shouldSwitch = true;
    let assessment = null;
    
    if (currentTask) {
      if (currentTask.id === nextTask.id) {
        // Same task - continue
        return { type: "task", task: currentTask };
      }

      // Critical urgency always switches immediately without asking
      if (nextTask.urgency === "critical") {
        shouldSwitch = true;
      } else {
        // Use LLM to assess continuity and switching decision
        assessment = await this.switcher.shouldSwitchWithLLM(
          currentTask,
          nextTask,
          this.currentFocus
        );
        
        shouldSwitch = assessment.shouldSwitch;
        
        // Log assessment for debugging
        if (!shouldSwitch && assessment.continuityStrength > 0.7) {
          console.log(`[Planning] Continuity assessment: strength=${assessment.continuityStrength.toFixed(2)}, switch=${shouldSwitch}, reason: ${assessment.reasoning}`);
        }
      }
    }

    // If switching would interrupt current task and not critical, ask for confirmation
    if (currentTask && shouldSwitch && nextTask.urgency !== "critical") {
      // Store pending interruption for user confirmation
      // Use original user message if provided, otherwise fall back to task description/title
      const originalMessage = originalUserMessage || nextTask.description || nextTask.title;
      
      this.pendingInterruption = {
        currentTask,
        newTask: nextTask,
        originalUserMessage: originalMessage,
        assessment: assessment || {
          continuityStrength: 0.5,
          shouldSwitch: true,
          reasoning: "Task switching required",
        },
        createdAt: Date.now(),
        conversationId,
      };

      return {
        type: "pending_interruption",
        interruption: this.pendingInterruption,
      };
    }

    // Switch to new task if needed (critical or no current task)
    if (currentTask && shouldSwitch) {
      // Save context of current task before switching
      this.switcher.saveTaskContext(currentTask.id, {
        progress: currentTask.progress || 0,
        status: currentTask.status,
        metadata: currentTask.metadata || {},
      });

      // Mark current task as pending (interrupted) and add back to queue
      const interruptedTask: Task = {
        ...currentTask,
        status: "pending",
        updatedAt: Date.now(),
      };
      this.queueManager.addTask(interruptedTask);

      // Clear executor
      this.executor.clear();
      this.switcher.switchTask(currentTask, nextTask);
      
      // Update attention focus for new task
      this.updateAttentionForTask(nextTask, conversationId);
    } else if (!currentTask && nextTask) {
      // Starting first task
      this.updateAttentionForTask(nextTask, conversationId);
    }

    // Start new task
    this.queueManager.startTask(nextTask.id);
    const activeTask = this.queueManager.getActiveTask();
    if (activeTask) {
      this.executor.startExecution(activeTask);
      return { type: "task", task: activeTask };
    }

    return { type: "none", task: null };
  }

  /**
   * Get pending interruption (if any)
   */
  getPendingInterruption(): PendingInterruption | null {
    return this.pendingInterruption;
  }

  /**
   * Handle interruption confirmation response
   * Uses LLM to interpret user response (yes/no/later/nevermind)
   */
  async handleInterruptionConfirmation(
    userResponse: string,
    conversationId?: string
  ): Promise<{ proceed: boolean; addToQueue: boolean; message?: string; newTask?: Task }> {
    if (!this.pendingInterruption) {
      return { proceed: false, addToQueue: false };
    }

    try {
      const model = await this.llmManager.fastCheap();
      const systemPrompt = `You are interpreting a user's response to an interruption confirmation request.

The agent asked if they should interrupt their current task to do a new task.
User responded: "${userResponse}"

Determine:
1. Does user want to proceed? (yes/proceed/go ahead = true, no/nevermind/cancel = false)
2. Should the new task be added to queue for later? (later/not now/after = true, nevermind/no = false)

Return JSON:
{
  "proceed": true/false,
  "addToQueue": true/false,
  "reasoning": "brief explanation"
}

Return ONLY valid JSON, no other text.`;

      const response = await model.call({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `User response: "${userResponse}"` },
        ],
        temperature: 0.3,
        maxTokens: 150,
      });

      const content = response.content.trim();
      const jsonMatch = content.match(/```(?:json)?\s*(\{.*?\})\s*```/s);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      const parsed = JSON.parse(jsonStr);

      const proceed = Boolean(parsed.proceed);
      const addToQueue = Boolean(parsed.addToQueue);

      if (proceed) {
        // User confirmed - proceed with interruption
        const interruption = this.pendingInterruption;
        this.pendingInterruption = null;

        // Perform the switch
        this.switcher.saveTaskContext(interruption.currentTask.id, {
          progress: interruption.currentTask.progress || 0,
          status: interruption.currentTask.status,
          metadata: interruption.currentTask.metadata || {},
        });

        const interruptedTask: Task = {
          ...interruption.currentTask,
          status: "pending",
          updatedAt: Date.now(),
        };
        this.queueManager.addTask(interruptedTask);

        this.executor.clear();
        this.switcher.switchTask(interruption.currentTask, interruption.newTask);
        this.updateAttentionForTask(interruption.newTask, conversationId);

        this.queueManager.startTask(interruption.newTask.id);
        const activeTask = this.queueManager.getActiveTask();
        if (activeTask) {
          this.executor.startExecution(activeTask);
        }

        return {
          proceed: true,
          addToQueue: false,
          message: parsed.reasoning,
          newTask: activeTask || interruption.newTask,
        };
      } else if (addToQueue) {
        // User said "later" - task is already in queue, just clear pending state
        const interruption = this.pendingInterruption;
        this.pendingInterruption = null;
        return {
          proceed: false,
          addToQueue: true,
          message: parsed.reasoning,
        };
      } else {
        // User said "nevermind" - remove task from queue and discard
        const interruption = this.pendingInterruption;
        this.pendingInterruption = null;
        
        // Remove the task from queue if it exists
        const queue = this.queueManager.getQueue();
        const taskIndex = queue.pending.findIndex(t => t.id === interruption.newTask.id);
        if (taskIndex !== -1) {
          queue.pending.splice(taskIndex, 1);
        }

        return {
          proceed: false,
          addToQueue: false,
          message: parsed.reasoning,
        };
      }
    } catch (error) {
      console.warn(`[Planning] Failed to interpret confirmation:`, error);
      // Fallback: simple keyword matching
      const lower = userResponse.toLowerCase();
      const proceed = lower.includes("yes") || lower.includes("sure") || lower.includes("go ahead");
      const addToQueue = lower.includes("later") || lower.includes("not now") || lower.includes("after");
      
      if (proceed && this.pendingInterruption) {
        const interruption = this.pendingInterruption;
        this.pendingInterruption = null;

        this.switcher.saveTaskContext(interruption.currentTask.id, {
          progress: interruption.currentTask.progress || 0,
          status: interruption.currentTask.status,
          metadata: interruption.currentTask.metadata || {},
        });

        const interruptedTask: Task = {
          ...interruption.currentTask,
          status: "pending",
          updatedAt: Date.now(),
        };
        this.queueManager.addTask(interruptedTask);

        this.executor.clear();
        this.switcher.switchTask(interruption.currentTask, interruption.newTask);
        this.updateAttentionForTask(interruption.newTask, conversationId);

        this.queueManager.startTask(interruption.newTask.id);
        const activeTask = this.queueManager.getActiveTask();
        if (activeTask) {
          this.executor.startExecution(activeTask);
        }

        return { proceed: true, addToQueue: false, newTask: activeTask || interruption.newTask };
      } else if (addToQueue) {
        this.pendingInterruption = null;
        return { proceed: false, addToQueue: true };
      } else {
        // User said "nevermind" - remove task from queue and discard
        const interruption = this.pendingInterruption;
        this.pendingInterruption = null;
        
        if (interruption) {
          // Remove task from queue
          const queue = this.queueManager.getQueue();
          const taskIndex = queue.pending.findIndex(t => t.id === interruption.newTask.id);
          if (taskIndex !== -1) {
            queue.pending.splice(taskIndex, 1);
          }
        }

        return { proceed: false, addToQueue: false };
      }
    }
  }

  /**
   * Generate interruption confirmation message using LLM
   */
  async generateInterruptionConfirmation(
    currentTask: Task,
    newRequest: string,
    newUrgency: string
  ): Promise<string> {
    try {
      const model = await this.llmManager.fastCheap();
      const progressText = currentTask.progress 
        ? ` (${currentTask.progress}% complete)` 
        : "";

      const systemPrompt = `You are a helpful AI assistant. The user is asking you to do something, but you're currently working on another task.

Generate a polite, professional confirmation message asking if they want you to interrupt your current work.

Be:
- Respectful and professional
- Brief and clear
- Include what you're currently working on
- Use the EXACT user request wording - do not rephrase or interpret
- Ask if they're sure they want you to switch

Format like: "Sir, I'm working right now on [current task]. Are you sure you want me to [use exact user request here]?"

IMPORTANT: Use the user's exact words from "New Request" below. Do not rephrase, interpret, or change the wording.

Return ONLY the message text, no other formatting or markdown.`;

      const userPrompt = `Current Task: ${currentTask.title}${progressText} (${currentTask.urgency} urgency)
New Request (use EXACT wording): "${newRequest}" (${newUrgency} urgency)

Generate a confirmation message asking if they want to interrupt. Use the exact wording from "New Request" above.`;

      const response = await model.call({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 150,
      });

      return response.content.trim();
    } catch (error) {
      console.warn(`[Planning] Failed to generate interruption confirmation:`, error);
      // Fallback message
      return `Sir, I'm working right now on "${currentTask.title}". Are you sure you want me to check "${newRequest}"?`;
    }
  }

  /**
   * Update attention focus for task
   */
  private updateAttentionForTask(task: Task, conversationId?: string): void {
    if (!this.attentionController) {
      return;
    }

    this.attentionController.updateTaskFocus(
      this.agentId,
      task.title,
      task.urgency,
      conversationId
    );
  }

  /**
   * Get current task
   */
  getCurrentTask(): Task | null {
    return this.executor.getCurrentTask() || this.queueManager.getActiveTask();
  }

  /**
   * Complete current task
   * ENHANCED: Clears task from attention focus and processes queue for next task
   */
  async completeCurrentTask(result?: unknown, conversationId?: string): Promise<Task | null> {
    const currentTask = this.executor.getCurrentTask();
    if (!currentTask) {
      return null;
    }

    const executionTime = this.executor.getExecutionTime() || 0;
    this.executor.completeExecution(currentTask, result);
    this.queueManager.completeTask(currentTask.id, result);

    // Update stats
    this.updateStats("completed", executionTime);
    this.switcher.clearContext(currentTask.id);

    // Clear task from attention focus (but keep topic)
    if (this.attentionController) {
      this.attentionController.clearTaskFocus(this.agentId);
    }

    // Process queue to get next task (if any)
    const queueResult = await this.processQueue(conversationId);
    
    // If there's a next task, attention will be updated by processQueue()
    // If no next task, attention focus remains cleared (topic only, no task)

    if (queueResult.type === "task") {
      return queueResult.task;
    }
    return null;
  }

  /**
   * Fail current task
   */
  failCurrentTask(error: string): boolean {
    const currentTask = this.executor.getCurrentTask();
    if (!currentTask) {
      return false;
    }

    this.executor.failExecution(currentTask, error);
    this.queueManager.failTask(currentTask.id, error);

    // Try fallback strategy
    const fallbackTask = this.fallbackManager.handleFailure(currentTask, error);
    if (fallbackTask) {
      // Add fallback task to queue (use queueManager directly since task already has ID)
      this.queueManager.addTask(fallbackTask);
      // Re-prioritize queue
      this.reprioritizeQueue();
    }

    // Update stats
    this.updateStats("failed", 0);
    this.switcher.clearContext(currentTask.id);

    return true;
  }

  /**
   * Update task progress
   */
  updateProgress(progress: number): boolean {
    const currentTask = this.executor.getCurrentTask();
    if (!currentTask) {
      return false;
    }

    this.executor.updateProgress(currentTask, progress);
    this.queueManager.updateProgress(currentTask.id, progress);
    return true;
  }

  /**
   * Complete current step (tactical planning)
   */
  completeCurrentStep(result?: unknown): boolean {
    return this.executor.completeCurrentStep(result);
  }

  /**
   * Get current step (tactical planning)
   */
  getCurrentStep(): TaskStep | null {
    return this.executor.getCurrentStep();
  }

  /**
   * Get all steps for current task
   */
  getSteps(): TaskStep[] {
    return this.executor.getSteps();
  }

  /**
   * Check if all steps are completed
   */
  areAllStepsCompleted(): boolean {
    return this.executor.areAllStepsCompleted();
  }

  /**
   * Check if current step requires confirmation
   */
  currentStepRequiresConfirmation(): boolean {
    const step = this.executor.getCurrentStep();
    return step?.requiresConfirmation || false;
  }

  /**
   * Handle step failure with contingency planning
   * ENHANCED: Updates attention focus if fallback created
   */
  async handleStepFailure(step: TaskStep, error: string, conversationId?: string): Promise<Task | null> {
    const currentTask = this.executor.getCurrentTask();
    if (!currentTask) {
      return null;
    }

    // Try fallback strategy
    const fallbackTask = this.fallbackManager.handleFailure(currentTask, error);
    if (fallbackTask) {
      // Add fallback task to queue (use queueManager directly since task already has ID)
      this.queueManager.addTask(fallbackTask);
      // Re-prioritize queue
      this.reprioritizeQueue();
      
      // Update attention focus for fallback task
      this.updateAttentionForTask(fallbackTask, conversationId);
      
      return fallbackTask;
    }

    return null;
  }

  /**
   * Get queue state
   */
  getQueueState(): PlanningState {
    const queue = this.queueManager.getQueue();
    const currentTask = this.getCurrentTask();

    return {
      agentId: this.agentId,
      queue,
      currentTask,
      lastSwitched: this.switcher.getSwitchHistory()[this.switcher.getSwitchHistory().length - 1]?.timestamp || 0,
      stats: { ...this.stats },
    };
  }

  /**
   * Integrate with Prospective Memory
   * Load tasks from prospective memory
   */
  async integrateProspectiveMemory(memoryManager: MemoryManager): Promise<void> {
    try {
      const prospectiveMemories = await memoryManager.getProspectiveMemories({
        limit: 100,
      });

      for (const memory of prospectiveMemories) {
        if (memory.status !== "pending") {
          continue;
        }

        // Check if task already exists
        const existingTask = this.queueManager.getTask(memory.id);
        if (existingTask) {
          continue;
        }

        // Convert prospective memory to task
        const urgency: Task["urgency"] = (memory.priority || 0) >= 0.8 ? "high" : (memory.priority || 0) >= 0.5 ? "medium" : "low";

        this.addTask({
          title: memory.intention,
          description: `From prospective memory: ${memory.intention}`,
          type: memory.triggerTime ? "scheduled" : "immediate",
          source: "prospective",
          urgency,
          prospectiveMemoryId: memory.id,
          metadata: {
            triggerTime: memory.triggerTime,
            triggerContext: memory.triggerContext,
          },
        });
      }

      // Check for due scheduled tasks
      const queue = this.queueManager.getQueue();
      const dueTasks = this.scheduler.filterDueTasks(queue.pending);
      for (const task of dueTasks) {
        // Tasks are already in queue, scheduler just identifies them
      }
    } catch (error) {
      console.warn(`[Planning] Failed to integrate prospective memory:`, error);
    }
  }

  /**
   * Sync task completion back to Prospective Memory
   */
  async syncWithProspectiveMemory(memoryManager: MemoryManager): Promise<void> {
    const queue = this.queueManager.getQueue();
    const completed = queue.completed.filter((t) => t.prospectiveMemoryId);

    for (const task of completed) {
      if (task.prospectiveMemoryId && task.status === "completed") {
        try {
          memoryManager.completeProspectiveMemory(task.prospectiveMemoryId);
        } catch (error) {
          console.warn(`[Planning] Failed to sync task ${task.id} to prospective memory:`, error);
        }
      }
    }
  }

  /**
   * Register fallback plan for a task
   */
  registerFallback(taskId: string, fallbackDescription: string, priority: number = 0.5): string {
    return this.fallbackManager.registerFallback(taskId, fallbackDescription, priority);
  }

  /**
   * Prioritize tasks using attention system
   */
  private prioritizeByAttention(tasks: Task[]): Task[] {
    // Score tasks by relevance to current focus
    const tasksWithScores = tasks.map((task) => {
      let priority = this.calculatePriorityFromUrgency(task.urgency);

      // Boost priority if task matches current focus
      if (this.currentFocus) {
        const taskContent = `${task.title} ${task.description || ""}`;
        const relevance = scoreRelevance(taskContent, this.currentFocus);
        
        // If task matches focus topic, boost priority
        if (relevance.score > 0.5) {
          priority += relevance.score * 0.3;
        }

        // If task matches current task from focus, boost more
        if (this.currentFocus.currentTask && task.title.toLowerCase().includes(this.currentFocus.currentTask.toLowerCase())) {
          priority += 0.2;
        }
      }

      // Source weight (user requests prioritized)
      const sourceWeight = task.source === "user" ? 0.1 : task.source === "prospective" ? 0.05 : 0.0;
      priority += sourceWeight;

      // Dependencies reduce priority
      if (task.dependencies && task.dependencies.length > 0) {
        priority *= 0.8;
      }

      return {
        task,
        priority: Math.max(0, Math.min(1, priority)),
      };
    });

    // Sort by priority (highest first), then by creation time (oldest first)
    tasksWithScores.sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return a.task.createdAt - b.task.createdAt; // FIFO within same priority
    });

    // Update task priorities and return sorted tasks
    return tasksWithScores.map((item) => {
      item.task.priority = item.priority;
      return item.task;
    });
  }

  /**
   * Reprioritize queue
   */
  private reprioritizeQueue(): void {
    const queue = this.queueManager.getQueue();
    const prioritized = this.prioritizeByAttention(queue.pending);
    this.queueManager.setPendingTasks(prioritized);
  }

  /**
   * Update statistics
   */
  private updateStats(status: "completed" | "failed" | "cancelled", executionTime: number): void {
    if (status === "completed") {
      this.stats.totalCompleted++;
      this.stats.lastCompletedAt = Date.now();

      // Update average completion time
      const total = this.stats.totalCompleted;
      const currentAvg = this.stats.averageCompletionTime;
      this.stats.averageCompletionTime = (currentAvg * (total - 1) + executionTime) / total;
    } else if (status === "failed") {
      this.stats.totalFailed++;
    } else if (status === "cancelled") {
      this.stats.totalCancelled++;
    }
  }

  /**
   * Cancel task
   */
  cancelTask(taskId: string): boolean {
    const cancelled = this.queueManager.cancelTask(taskId);
    if (cancelled) {
      this.updateStats("cancelled", 0);
      this.switcher.clearContext(taskId);
    }
    return cancelled;
  }
}

// Export types and classes
export * from "./types.js";
export { TaskQueueManager } from "./queue.js";
export { TacticalExecutor } from "./tactical/index.js";
export { TaskSwitcher } from "./reactive/index.js";
export { TemporalScheduler } from "./temporal/index.js";
export { FallbackStrategyManager } from "./contingency/index.js";
export { DependencyManager } from "./hierarchical/index.js";

// Export planning type modules
export * from "./strategic/index.js";
export * from "./tactical/index.js";
export * from "./hierarchical/index.js";
export * from "./reactive/index.js";
export * from "./temporal/index.js";
export * from "./contingency/index.js";
