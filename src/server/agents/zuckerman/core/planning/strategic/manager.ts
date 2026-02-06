/**
 * Strategic Planning Manager
 * Orchestrates strategic planning with tree structure
 */

import { randomUUID } from "node:crypto";
import type { GoalTaskNode, GoalTaskTree, TaskUrgency } from "../types.js";
import type { MemoryManager } from "../../memory/types.js";
import { TreeManager } from "./tree.js";
import { StrategicAgent } from "./agent.js";

export class StrategicManager {
  private treeManager: TreeManager;
  private agent: StrategicAgent;
  private memoryManager: MemoryManager | null = null;

  constructor(memoryManager?: MemoryManager | null) {
    this.memoryManager = memoryManager || null;
    this.treeManager = new TreeManager();
    this.agent = new StrategicAgent(this.memoryManager);
  }

  /**
   * Set memory manager (for memory integration)
   */
  setMemoryManager(memoryManager: MemoryManager): void {
    this.memoryManager = memoryManager;
    this.agent.setMemoryManager(memoryManager);
  }

  /**
   * Create goal from user message
   * ENHANCED: Stores goal in semantic memory
   */
  async createGoal(
    title: string,
    description: string,
    urgency: TaskUrgency,
    focus: null,
    conversationId?: string
  ): Promise<GoalTaskNode> {
    const goal: GoalTaskNode = {
      id: randomUUID(),
      type: "goal",
      title,
      description,
      goalStatus: "active",
      progress: 0,
      source: "user",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      children: [],
      order: 0,
      metadata: {},
    };

    // Add to tree
    this.treeManager.addNode(goal);

    // Record goal creation in memory
    if (this.memoryManager) {
      this.memoryManager.onGoalCreated(goal.id, goal.title, goal.description, conversationId);
    }

    // Auto-decompose if needed
    if (await this.agent.shouldDecompose(goal)) {
      const decomposition = await this.agent.decomposeGoal(goal, urgency, null);
      decomposition.children.forEach((child) => {
        this.treeManager.addNode(child, goal.id);
      });
    }

    return goal;
  }

  /**
   * Create task (leaf node)
   */
  createTask(
    title: string,
    description: string,
    urgency: TaskUrgency,
    priority: number,
    parentId?: string
  ): GoalTaskNode {
    const task: GoalTaskNode = {
      id: randomUUID(),
      type: "task",
      title,
      description,
      taskStatus: "pending",
      urgency,
      priority,
      progress: 0,
      source: "user",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      children: [],
      order: 0,
      metadata: {},
    };

    // Add to tree
    this.treeManager.addNode(task, parentId);

    // Record task creation in memory
    if (this.memoryManager) {
      this.memoryManager.onTaskCreated(
        task.id,
        task.title,
        task.description,
        task.urgency,
        parentId
      );
    }

    return task;
  }

  /**
   * Get tree structure
   */
  getTree(): GoalTaskTree {
    return this.treeManager.getTree();
  }

  /**
   * Initialize tree from existing structure
   */
  initializeTree(tree: GoalTaskTree): void {
    this.treeManager.initializeTree(tree);
  }

  /**
   * Get ready tasks (leaf tasks that are pending)
   */
  getReadyTasks(): GoalTaskNode[] {
    const tree = this.treeManager.getTree();
    const leaves = this.treeManager.getLeafTasks();
    return leaves.filter(node => 
      node.type === "task" && 
      node.taskStatus === "pending" &&
      this.areAncestorsComplete(tree, node.id)
    );
  }

  /**
   * Check if all ancestors are complete
   */
  private areAncestorsComplete(tree: GoalTaskTree, nodeId: string): boolean {
    const ancestors = this.treeManager.getAncestors(nodeId);
    return ancestors.every(ancestor => 
      (ancestor.type === "goal" && ancestor.goalStatus === "completed") ||
      (ancestor.type === "task" && ancestor.taskStatus === "completed")
    );
  }

  /**
   * Update node progress
   */
  updateProgress(nodeId: string, progress: number): void {
    this.treeManager.updateNodeProgress(nodeId, progress);
  }

  /**
   * Complete task and update tree
   */
  completeTask(nodeId: string, result?: unknown): boolean {
    const node = this.treeManager.getNode(nodeId);
    if (!node || node.type !== "task") return false;

    node.taskStatus = "completed";
    node.progress = 100;
    node.result = result;
    node.updatedAt = Date.now();

    // Update parent goals
    if (node.parentId) {
      this.treeManager.updateNodeStatus(node.parentId, "active");
      
      // Check if parent goal was completed
      const parent = this.treeManager.getNode(node.parentId);
      if (parent && parent.type === "goal" && parent.goalStatus === "completed") {
        // Record goal completion in memory
        if (this.memoryManager) {
          this.memoryManager.onGoalCompleted(parent.id, parent.title);
        }
      }
    }

    return true;
  }

  /**
   * Fail task
   */
  failTask(nodeId: string, error: string): boolean {
    const node = this.treeManager.getNode(nodeId);
    if (!node || node.type !== "task") return false;

    node.taskStatus = "failed";
    node.error = error;
    node.updatedAt = Date.now();

    return true;
  }

  /**
   * Cancel task
   */
  cancelTask(nodeId: string): boolean {
    const node = this.treeManager.getNode(nodeId);
    if (!node) return false;

    if (node.type === "goal") {
      node.goalStatus = "cancelled";
    } else {
      node.taskStatus = "cancelled";
    }
    node.updatedAt = Date.now();

    return true;
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): GoalTaskNode | null {
    return this.treeManager.getNode(nodeId);
  }

  /**
   * Set active node
   */
  setActiveNode(nodeId: string | null): void {
    this.treeManager.setActiveNode(nodeId);
  }

  /**
   * Get active node
   */
  getActiveNode(): GoalTaskNode | null {
    return this.treeManager.getActiveNode();
  }

  /**
   * Decompose goal (manual trigger)
   */
  async decomposeGoal(nodeId: string, urgency: TaskUrgency, focus: null): Promise<boolean> {
    const node = this.treeManager.getNode(nodeId);
    if (!node || node.type !== "goal") return false;

    if (await this.agent.shouldDecompose(node)) {
      const decomposition = await this.agent.decomposeGoal(node, urgency, null);
      decomposition.children.forEach((child) => {
        this.treeManager.addNode(child, node.id);
      });
      return true;
    }

    return false;
  }

  /**
   * Check and re-decompose goals if needed
   */
  async checkAndRedecomposeGoals(
    urgency: TaskUrgency,
    focus: null
  ): Promise<number> {
    // Use internal tree structure directly instead of getTree() which serializes
    // Get all nodes from the tree manager's internal Map
    const allNodes = this.treeManager.getAllNodes();
    let redecomposedCount = 0;

    // Check all active goals
    for (const node of allNodes) {
      if (node.type === "goal" && node.goalStatus === "active") {
        if (await this.agent.shouldDecompose(node)) {
          const decomposition = await this.agent.decomposeGoal(node, urgency, null);
          decomposition.children.forEach((child) => {
            this.treeManager.addNode(child, node.id);
          });
          redecomposedCount++;
        }
      }
    }

    return redecomposedCount;
  }

}
