/**
 * Planning Manager
 * Orchestrates all planning components
 */

import type { GoalTaskNode, PlanningState, PlanningStats, PendingInterruption, ProcessQueueResult } from "./types.js";
import type { MemoryManager } from "../memory/types.js";
import type { FocusState, UrgencyLevel } from "../attention/types.js";
import type { TaskStep } from "./tactical/steps.js";
import type { ExecutiveController } from "../attention/index.js";
import { StrategicManager } from "./strategic/index.js";
import { TacticalExecutor, StepSequenceManager } from "./tactical/index.js";
import { TaskSwitcher } from "./reactive/index.js";
import { TemporalScheduler } from "./temporal/index.js";
import { FallbackStrategyManager } from "./contingency/index.js";
import { LLMManager } from "@server/world/providers/llm/index.js";

export class PlanningManager {
  private agentId: string;
  private strategicManager: StrategicManager; // Tree-based planning
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
  private memoryManager: MemoryManager | null = null;

  constructor(agentId: string, attentionController?: ExecutiveController, memoryManager?: MemoryManager) {
    this.agentId = agentId;
    this.memoryManager = memoryManager || null;
    this.strategicManager = new StrategicManager(this.memoryManager);
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
   * Set memory manager (for memory integration)
   */
  setMemoryManager(memoryManager: MemoryManager): void {
    this.memoryManager = memoryManager;
    // Update strategic manager with memory manager
    this.strategicManager.setMemoryManager(memoryManager);
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
   * Add goal or task to tree
   * UPDATED: Uses tree structure instead of queue
   */
  async addGoalOrTask(
    title: string,
    description: string,
    urgency: UrgencyLevel,
    isGoal: boolean = false,
    parentId?: string,
    conversationId?: string
  ): Promise<string> {
    if (isGoal) {
      const goal = await this.strategicManager.createGoal(title, description, urgency, this.currentFocus, conversationId);
      return goal.id;
    } else {
      // LLM will decide priority - use default for now
      const task = this.strategicManager.createTask(title, description, urgency, 0.5, parentId);
      return task.id;
    }
  }



  /**
   * Process tree - get next task to execute
   * UPDATED: Uses tree structure instead of queue
   * ENHANCED: Uses LLM-based continuity assessment and updates attention
   * Returns ProcessQueueResult which can be a task, pending interruption, or none
   */
  async processTree(conversationId?: string, originalUserMessage?: string): Promise<ProcessQueueResult> {
    // Check for goals that need re-decomposition due to context changes
    if (this.currentFocus) {
      const redecomposedCount = await this.strategicManager.checkAndRedecomposeGoals(
        this.currentFocus.urgency || "medium",
        this.currentFocus
      );
      if (redecomposedCount > 0) {
        console.log(`[Planning] Re-decomposed ${redecomposedCount} goal(s) due to context changes`);
      }
    }

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

      // Use LLM to decide switching
      assessment = await this.switcher.shouldSwitchWithLLM(
        currentNode,
        nextNode,
        this.currentFocus
      );
      
      shouldSwitch = assessment.shouldSwitch;
    }

    // If switching would interrupt current task, ask for confirmation
    if (currentNode && shouldSwitch && nextNode) {
      // Store pending interruption for user confirmation
      const originalMessage = originalUserMessage || nextNode.description || nextNode.title;
      
      this.pendingInterruption = {
        currentNode,
        newNode: nextNode,
        originalUserMessage: originalMessage,
        assessment: {
          continuityStrength: assessment?.continuityStrength ?? 0.5,
          shouldSwitch: assessment?.shouldSwitch ?? true,
          reasoning: assessment?.reasoning || "Task switching required",
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
      
      // Update attention focus for new task
      this.updateAttentionForNode(nextNode, conversationId);
    } else if (!currentNode && nextNode) {
      // Starting first task
      this.updateAttentionForNode(nextNode, conversationId);
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
   * Process queue (legacy method - delegates to processTree)
   * @deprecated Use processTree instead
   */
  async processQueue(conversationId?: string, originalUserMessage?: string): Promise<ProcessQueueResult> {
    return this.processTree(conversationId, originalUserMessage);
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
  ): Promise<{ proceed: boolean; addToQueue: boolean; message?: string; newTask?: GoalTaskNode }> {
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

        // Perform the switch (using tree structure)
        const currentNode = interruption.currentNode;
        const newNode = interruption.newNode;
        
        // Save context
        this.switcher.saveTaskContext(currentNode.id, {
          progress: currentNode.progress || 0,
          status: currentNode.type === "task" ? (currentNode.taskStatus || "pending") : "pending",
          metadata: currentNode.metadata || {},
        });

        // Mark current node as pending (interrupted)
        if (currentNode.type === "task") {
          currentNode.taskStatus = "pending";
          currentNode.updatedAt = Date.now();
        }

        this.executor.clear();
        
        this.switcher.switchTask(currentNode, newNode);
        
        // Update attention
        this.updateAttentionForNode(newNode, conversationId);

        // Start new task
        if (newNode.type === "task") {
          newNode.taskStatus = "active";
          newNode.updatedAt = Date.now();
          this.strategicManager.setActiveNode(newNode.id);
          
          this.executor.startExecution(newNode);
        }

        return {
          proceed: true,
          addToQueue: false,
          message: parsed.reasoning,
          newTask: newNode,
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
        // User said "nevermind" - cancel the new task
        const interruption = this.pendingInterruption;
        this.pendingInterruption = null;
        
        // Cancel the new node in tree
        if (interruption.newNode.type === "task") {
          this.strategicManager.cancelTask(interruption.newNode.id);
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

        const currentNode = interruption.currentNode;
        const newNode = interruption.newNode;
        
        this.switcher.saveTaskContext(currentNode.id, {
          progress: currentNode.progress || 0,
          status: currentNode.type === "task" ? (currentNode.taskStatus || "pending") : "pending",
          metadata: currentNode.metadata || {},
        });

        if (currentNode.type === "task") {
          currentNode.taskStatus = "pending";
          currentNode.updatedAt = Date.now();
        }

        this.executor.clear();
        
        this.switcher.switchTask(currentNode, newNode);
        this.updateAttentionForNode(newNode, conversationId);

        if (newNode.type === "task") {
          newNode.taskStatus = "active";
          newNode.updatedAt = Date.now();
          this.strategicManager.setActiveNode(newNode.id);
          
          this.executor.startExecution(newNode);
        }

        return { proceed: true, addToQueue: false, newTask: newNode };
      } else if (addToQueue) {
        this.pendingInterruption = null;
        return { proceed: false, addToQueue: true };
      } else {
        // User said "nevermind" - cancel the new task
        const interruption = this.pendingInterruption;
        this.pendingInterruption = null;
        
        if (interruption) {
          if (interruption.newNode.type === "task") {
            this.strategicManager.cancelTask(interruption.newNode.id);
          }
        }

        return { proceed: false, addToQueue: false };
      }
    }
  }

  /**
   * Generate interruption confirmation message using LLM
   * Generates contextual, natural confirmations that adapt to the user's request type
   */
  async generateInterruptionConfirmation(
    currentNode: GoalTaskNode,
    newRequest: string,
    newUrgency: string
  ): Promise<string> {
    try {
      const model = await this.llmManager.fastCheap();
      
      // Handle both GoalTaskNode and Task
      const currentTitle = currentNode.title;
      const currentProgress = currentNode.progress || 0;
      const progressText = currentProgress ? ` (${currentProgress}% complete)` : "";

      const systemPrompt = `You're a helpful assistant who's currently busy working on something. The user just asked you something new.

You want to be helpful, but you're in the middle of something. Respond naturally - like a real person would when they're busy but want to help. 

Understand what they're asking and respond in a way that makes sense. Don't just repeat their words back to them.`;

      const userPrompt = `You're currently working on: ${currentTitle}${progressText}

The user just asked: "${newRequest}"

Respond naturally - like you're a busy person who wants to help but needs to check if they want you to switch tasks.`;

      const response = await model.call({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
        maxTokens: 150,
      });

      return response.content.trim();
    } catch (error) {
      console.warn(`[Planning] Failed to generate interruption confirmation:`, error);
      throw error;
    }
  }

  /**
   * Update attention focus for node
   */
  private updateAttentionForNode(node: GoalTaskNode, conversationId?: string): void {
    if (!this.attentionController || node.type !== "task") {
      return;
    }

    this.attentionController.updateTaskFocus(
      this.agentId,
      node.title,
      node.urgency || "medium",
      conversationId
    );
  }

  /**
   * Update attention focus for task
   */
  private updateAttentionForTask(node: GoalTaskNode, conversationId?: string): void {
    if (!this.attentionController || node.type !== "task") {
      return;
    }

    this.attentionController.updateTaskFocus(
      this.agentId,
      node.title,
      node.urgency || "medium",
      conversationId
    );
  }


  /**
   * Get current task
   */
  getCurrentTask(): GoalTaskNode | null {
    return this.executor.getCurrentTask() || this.strategicManager.getActiveNode();
  }

  /**
   * Get current node (tree-based)
   */
  getCurrentNode(): GoalTaskNode | null {
    return this.executor.getCurrentTask() || this.strategicManager.getActiveNode();
  }

  /**
   * Complete current task
   * ENHANCED: Clears task from attention focus, records in episodic memory, and processes tree for next task
   */
  async completeCurrentTask(result?: unknown, conversationId?: string): Promise<GoalTaskNode | null> {
    const currentNode = this.getCurrentNode();
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

    // Clear task from attention focus (but keep topic)
    if (this.attentionController) {
      this.attentionController.clearTaskFocus(this.agentId);
    }

    // Process tree to get next task (if any)
    const treeResult = await this.processTree(conversationId);
    
    // If there's a next task, attention will be updated by processTree()
    // If no next task, attention focus remains cleared (topic only, no task)

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
    const currentNode = this.getCurrentNode();
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
    const currentNode = this.getCurrentNode();
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
    const currentTask = this.getCurrentNode();
    
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
  async handleStepFailure(step: TaskStep, error: string, conversationId?: string): Promise<GoalTaskNode | null> {
    const currentNode = this.getCurrentNode();
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
      
      // Update attention focus for fallback task
      this.updateAttentionForTask(fallbackNode, conversationId);
      
      return fallbackNode;
    }

    return null;
  }

  /**
   * Get queue state (tree-based)
   */
  getQueueState(): PlanningState {
    const tree = this.strategicManager.getTree();
    const currentNode = this.getCurrentNode();

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
