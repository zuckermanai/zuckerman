/**
 * Execution Order Calculator
 * Calculate optimal execution order from tree structure
 */

import type { GoalTaskNode, GoalTaskTree } from "../types.js";
import { TreeTraversal } from "./traversal.js";

export class ExecutionOrderCalculator {
  private traversal: TreeTraversal;

  constructor() {
    this.traversal = new TreeTraversal();
  }

  /**
   * Get next executable task
   */
  getNextTask(tree: GoalTaskTree): GoalTaskNode | null {
    const orderResult = this.traversal.getExecutionOrder(tree);
    return orderResult.readyNodes[0] || null;
  }

  /**
   * Get all ready tasks (can execute now)
   */
  getReadyTasks(tree: GoalTaskTree): GoalTaskNode[] {
    const orderResult = this.traversal.getExecutionOrder(tree);
    return orderResult.readyNodes;
  }

  /**
   * Check if task is ready to execute
   */
  isReady(tree: GoalTaskTree, nodeId: string): boolean {
    const orderResult = this.traversal.getExecutionOrder(tree);
    return orderResult.readyNodes.some((n) => n.id === nodeId);
  }

  /**
   * Get execution path (ordered list of task IDs)
   */
  getExecutionPath(tree: GoalTaskTree): string[] {
    const orderResult = this.traversal.getExecutionOrder(tree);
    return orderResult.path;
  }

  /**
   * Get blocked tasks
   */
  getBlockedTasks(tree: GoalTaskTree): GoalTaskNode[] {
    const orderResult = this.traversal.getExecutionOrder(tree);
    return orderResult.blockedNodes;
  }
}
