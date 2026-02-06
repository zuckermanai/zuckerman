/**
 * Planning Manager
 * Orchestrates all planning components
 */

import type { GoalTaskNode, PlanningState, PlanningStats, ProcessQueueResult, PlanResult, TaskUrgency } from "./types.js";
import type { MemoryManager } from "../memory/types.js";
import type { TaskStep } from "./tactical/steps.js";
import { StrategicManager } from "./strategic/index.js";
import { TacticalExecutor, StepSequenceManager } from "./tactical/index.js";
import { TaskSwitcher } from "./reactive/index.js";
import { FallbackStrategyManager } from "./contingency/index.js";
import { LLMManager } from "@server/world/providers/llm/index.js";

export class PlanningManager {
  private agentId: string;
  private strategicManager: StrategicManager; // Tree-based planning
  private executor: TacticalExecutor;
  private switcher: TaskSwitcher;
  private fallbackManager: FallbackStrategyManager;
  private stepManager: StepSequenceManager;
  private stats: PlanningStats;
  private llmManager: LLMManager;
  private memoryManager: MemoryManager | null = null;

  constructor(agentId: string, memoryManager?: MemoryManager) {
    this.agentId = agentId;
    this.memoryManager = memoryManager || null;
    this.strategicManager = new StrategicManager(this.memoryManager);
    this.executor = new TacticalExecutor();
    this.switcher = new TaskSwitcher();
    this.fallbackManager = new FallbackStrategyManager();
    this.stepManager = new StepSequenceManager();
    this.llmManager = LLMManager.getInstance();
    this.stats = {
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
      averageCompletionTime: 0,
    };
  }

  /**
   * Set memory manager (for memory integration)
   */
  setMemoryManager(memoryManager: MemoryManager): void {
    this.memoryManager = memoryManager;
    // Update strategic manager with memory manager
    this.strategicManager.setMemoryManager(memoryManager);
  }

  /**
   * Plan for a new message - unified entry point
   * Handles everything internally: adding task, decomposing steps, processing tree, deciding what to do
   * Returns a simple user-friendly message
   */
  async plan(
    userMessage: string,
    urgency: TaskUrgency,
    focus: null,
    conversationId?: string
  ): Promise<PlanResult> {
    try {

      // Get current task before processing (to detect switches)
      const previousTask = this.executor.getCurrentTask() || this.strategicManager.getActiveNode();

      // Decompose task into steps using tactical planning (LLM-based)
      const steps = await this.stepManager.decomposeWithLLM(userMessage, urgency, null);

      // Add task to tree (always a task, not a goal for user messages)
      const taskId = this.strategicManager.createTask(userMessage, userMessage, urgency, 0.5, undefined).id;
      const newTask = this.strategicManager.getTree().nodes.get(taskId);
      if (!newTask) {
        return {
          message: "Processing your request...",
        };
      }

      // Process tree to decide what to execute (uses LLM internally)
      const queueResult = await this.processTree(conversationId, userMessage);

      // Handle no action case
      if (queueResult.type === "none") {
        return {
          message: "Processing your request...",
        };
      }

      const currentTask = queueResult.node;
      if (!currentTask) {
        return {
          message: "Processing your request...",
        };
      }

      // If the new task is active, set its steps
      if (currentTask.id === taskId) {
        this.executor.setSteps(steps);
      }

      return {
        message: "Processing your request...",
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Planning] Error: ${errorMessage}`);
      
      return {
        message: "Processing your request...",
      };
    }
  }


  /**
   * Process tree - get next task to execute
   * Uses LLM to automatically decide task switching, busy status, and everything internally
   * Returns ProcessQueueResult which can be a task or none
   * @internal Private method - use plan() instead
   */
  private async processTree(conversationId?: string, originalUserMessage?: string): Promise<ProcessQueueResult> {

    // Get ready tasks from tree
    const readyTasks = this.strategicManager.getReadyTasks();

    if (readyTasks.length === 0) {
      return { type: "none", node: null };
    }

    // LLM will decide priority - for now just use ready tasks as-is
    const prioritized = readyTasks;

    // Get current node
    const currentNode = this.executor.getCurrentTask() || this.strategicManager.getActiveNode();

    // Use LLM to decide if should switch
    const nextNode = prioritized[0];
    let shouldSwitch = true;
    let assessment = null;
    
    if (currentNode && nextNode) {
      if (currentNode.id === nextNode.id) {
        // Same task - continue
        return { type: "task", node: currentNode };
      }

      // Use LLM to decide switching - automatically decides without user confirmation
      assessment = await this.switcher.shouldSwitchWithLLM(
        currentNode,
        nextNode,
        null
      );
      
      shouldSwitch = assessment.shouldSwitch;
    }

    // Automatically switch to new task if LLM decides we should (no user confirmation needed)
    if (currentNode && shouldSwitch && nextNode) {
      // Save context of current task before switching
      this.switcher.saveTaskContext(currentNode.id, {
        progress: currentNode.progress || 0,
        status: currentNode.taskStatus || "pending",
        metadata: currentNode.metadata || {},
      });

      // Mark current node as pending (interrupted)
      if (currentNode.type === "task") {
        currentNode.taskStatus = "pending";
        currentNode.updatedAt = Date.now();
      }

      // Clear executor
      this.executor.clear();
    }

    // Start new task
    if (nextNode && nextNode.type === "task") {
      nextNode.taskStatus = "active";
      nextNode.updatedAt = Date.now();
      this.strategicManager.setActiveNode(nextNode.id);
      
      this.executor.startExecution(nextNode);
      
      return { type: "task", node: nextNode };
    }

    return { type: "none", node: null };
  }

  /**
   * Get current task/node
   */
  getCurrentTask(): GoalTaskNode | null {
    return this.executor.getCurrentTask() || this.strategicManager.getActiveNode();
  }

  /**
   * Complete current task
   * Records in episodic memory and processes tree for next task
   */
  async completeCurrentTask(result?: unknown, conversationId?: string): Promise<GoalTaskNode | null> {
    const currentNode = this.getCurrentTask();
    if (!currentNode || currentNode.type !== "task") {
      return null;
    }

    const executionTime = this.executor.getExecutionTime() || 0;
    
    // Complete in tree
    this.strategicManager.completeTask(currentNode.id, result);
    
    // Complete in executor
    this.executor.completeExecution(currentNode, result);

    // Record task completion in memory
    if (this.memoryManager) {
      this.memoryManager.onTaskCompleted(
        currentNode.id,
        currentNode.title,
        result,
        executionTime,
        conversationId
      );
    }

    // Update stats
    this.updateStats("completed", executionTime);
    this.switcher.clearContext(currentNode.id);

    // Process tree to get next task (if any)
    const treeResult = await this.processTree(conversationId);

    if (treeResult.type === "task") {
      return treeResult.node;
    }
    return null;
  }

  /**
   * Fail current task
   * UPDATED: Uses tree structure
   */
  async failCurrentTask(error: string): Promise<boolean> {
    const currentNode = this.getCurrentTask();
    if (!currentNode || currentNode.type !== "task") {
      return false;
    }

    // Fail in tree
    this.strategicManager.failTask(currentNode.id, error);
    
    // Fail in executor
    this.executor.failExecution(currentNode, error);

    // Record task failure in memory
    if (this.memoryManager) {
      this.memoryManager.onTaskFailed(
        currentNode.id,
        currentNode.title,
        error
      );
    }

    // Try fallback strategy using LLM
    const fallbackNode = await this.fallbackManager.handleFailure(currentNode, error);
    if (fallbackNode) {
      // Add fallback task to tree
      const createdFallback = this.strategicManager.createTask(
        fallbackNode.title,
        fallbackNode.description || "",
        fallbackNode.urgency || "medium",
        fallbackNode.priority || 0.5,
        currentNode.parentId
      );

      // Record fallback triggered in memory
      if (this.memoryManager) {
        this.memoryManager.onFallbackTriggered(
          currentNode.id,
          currentNode.title,
          createdFallback.id,
          createdFallback.title,
          error
        );
      }
    }

    // Update stats
    this.updateStats("failed", 0);
    this.switcher.clearContext(currentNode.id);

    return true;
  }

  /**
   * Update task progress
   * UPDATED: Uses tree structure
   */
  updateProgress(progress: number): boolean {
    const currentNode = this.getCurrentTask();
    if (!currentNode || currentNode.type !== "task") {
      return false;
    }

    // Update in tree
    this.strategicManager.updateProgress(currentNode.id, progress);
    
    // Update in executor
    this.executor.updateProgress(currentNode, progress);
    
    return true;
  }

  /**
   * Complete current step (tactical planning)
   */
  completeCurrentStep(result?: unknown, conversationId?: string): boolean {
    const currentStep = this.executor.getCurrentStep();
      const currentTask = this.getCurrentTask();
    
    const completed = this.executor.completeCurrentStep(result);
    
    // Record step completion in memory
    if (completed && currentStep && currentTask && this.memoryManager) {
      this.memoryManager.onStepCompleted(
        currentTask.id,
        currentStep.title,
        currentStep.order,
        conversationId
      );
    }
    
    return completed;
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
   * Check if task should be completed (no tool calls, task is done)
   * Returns true if task was completed, false otherwise
   */
  async checkAndCompleteTaskIfDone(resultContent: string, hasToolCalls: boolean, conversationId?: string): Promise<boolean> {
    const currentTask = this.getCurrentTask();
    if (!currentTask) {
      return false;
    }

    // If there are no more steps or all steps are completed, mark task as done
    const steps = this.getSteps();
    const hasSteps = steps.length > 0;
    const allStepsCompleted = hasSteps && this.areAllStepsCompleted();
    const noMoreSteps = !hasSteps || !this.getCurrentStep();
    
    if (allStepsCompleted || (noMoreSteps && !hasToolCalls)) {
      // Complete the task
      await this.completeCurrentTask(resultContent, conversationId);
      return true;
    }

    return false;
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
   */
  async handleStepFailure(step: TaskStep, error: string, conversationId?: string): Promise<GoalTaskNode | null> {
    const currentNode = this.getCurrentTask();
    if (!currentNode || currentNode.type !== "task") {
      return null;
    }

    // Record step failure in memory
    if (this.memoryManager) {
      this.memoryManager.onStepFailed(
        currentNode.id,
        step.title,
        step.order,
        error,
        conversationId
      );
    }

    // Try fallback strategy using LLM
    const fallbackNode = await this.fallbackManager.handleFailure(currentNode, error);
    if (fallbackNode) {
      // Add fallback task to tree
      this.strategicManager.createTask(
        fallbackNode.title,
        fallbackNode.description || "",
        fallbackNode.urgency || "medium",
        fallbackNode.priority || 0.5,
        currentNode.parentId
      );
      
      return fallbackNode;
    }

    return null;
  }

  /**
   * Get queue state (tree-based)
   */
  getQueueState(): PlanningState {
    const tree = this.strategicManager.getTree();
    const currentNode = this.getCurrentTask();

    return {
      agentId: this.agentId,
      tree,
      currentNode,
      lastSwitched: this.switcher.getSwitchHistory()[this.switcher.getSwitchHistory().length - 1]?.timestamp || 0,
      stats: { ...this.stats },
    };
  }


  /**
   * Register fallback plan for a task
   */
  registerFallback(taskId: string, fallbackDescription: string, priority: number = 0.5): string {
    return this.fallbackManager.registerFallback(taskId, fallbackDescription, priority);
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
   * UPDATED: Uses tree structure
   */
  cancelTask(taskId: string): boolean {
    const cancelled = this.strategicManager.cancelTask(taskId);
    if (cancelled) {
      this.updateStats("cancelled", 0);
      this.switcher.clearContext(taskId);
    }
    return cancelled;
  }
}
