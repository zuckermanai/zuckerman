/**
 * Tree Traversal
 * Tree traversal algorithms for querying and navigation
 */

import type { GoalTaskNode, GoalTaskTree, ExecutionOrderResult } from "../types.js";

export class TreeTraversal {
  /**
   * Get execution order (topological sort of leaf tasks)
   */
  getExecutionOrder(tree: GoalTaskTree): ExecutionOrderResult {
    const leaves = this.getLeafTasks(tree);
    const completedIds = new Set(
      Array.from(tree.nodes.values())
        .filter(
          (n) =>
            (n.type === "goal" && n.goalStatus === "completed") ||
            (n.type === "task" && n.taskStatus === "completed")
        )
        .map((n) => n.id)
    );

    // Filter ready tasks (all ancestors completed)
    const readyNodes: GoalTaskNode[] = [];
    const blockedNodes: GoalTaskNode[] = [];

    for (const leaf of leaves) {
      const ancestors = this.getAncestors(tree, leaf.id);
      const allAncestorsDone = ancestors.every((a) => completedIds.has(a.id));

      if (allAncestorsDone && leaf.taskStatus === "pending") {
        readyNodes.push(leaf);
      } else {
        blockedNodes.push(leaf);
      }
    }

    // Sort ready nodes by priority
    readyNodes.sort((a, b) => {
      const urgencyOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
      const aUrgency = urgencyOrder[a.urgency || "low"] || 1;
      const bUrgency = urgencyOrder[b.urgency || "low"] || 1;
      if (aUrgency !== bUrgency) return bUrgency - aUrgency;
      return (b.priority || 0) - (a.priority || 0);
    });

    return {
      path: readyNodes.map((n) => n.id),
      readyNodes,
      blockedNodes,
    };
  }

  /**
   * Get all leaf tasks (tasks with no children)
   */
  getLeafTasks(tree: GoalTaskTree): GoalTaskNode[] {
    const leaves: GoalTaskNode[] = [];
    const traverse = (node: GoalTaskNode) => {
      if (node.type === "task" && node.children.length === 0) {
        leaves.push(node);
      }
      node.children.forEach(traverse);
    };
    if (tree.root) {
      traverse(tree.root);
    }
    return leaves;
  }

  /**
   * Get ancestors (path from node to root)
   */
  getAncestors(tree: GoalTaskTree, nodeId: string): GoalTaskNode[] {
    const ancestors: GoalTaskNode[] = [];
    let current = tree.nodes.get(nodeId);
    while (current?.parentId) {
      const parent = tree.nodes.get(current.parentId);
      if (parent) {
        ancestors.unshift(parent);
        current = parent;
      } else {
        break;
      }
    }
    return ancestors;
  }

  /**
   * Get subtree (node and all descendants)
   */
  getSubtree(tree: GoalTaskTree, nodeId: string): GoalTaskNode[] {
    const subtree: GoalTaskNode[] = [];
    const node = tree.nodes.get(nodeId);
    if (!node) return subtree;

    const traverse = (n: GoalTaskNode) => {
      subtree.push(n);
      n.children.forEach(traverse);
    };
    traverse(node);
    return subtree;
  }

  /**
   * Calculate progress for a goal (aggregated from children)
   */
  calculateProgress(tree: GoalTaskTree, goalId: string): number {
    const goal = tree.nodes.get(goalId);
    if (!goal || goal.type !== "goal") return 0;

    const children = goal.children;
    if (children.length === 0) {
      return goal.goalStatus === "completed" ? 100 : 0;
    }

    const totalProgress = children.reduce((sum, child) => {
      if (child.type === "goal") {
        return sum + this.calculateProgress(tree, child.id);
      } else {
        return sum + (child.progress || 0);
      }
    }, 0);

    return Math.round(totalProgress / children.length);
  }

  /**
   * Get all nodes of a specific type
   */
  getNodesByType(tree: GoalTaskTree, type: "goal" | "task"): GoalTaskNode[] {
    const nodes: GoalTaskNode[] = [];
    const traverse = (node: GoalTaskNode) => {
      if (node.type === type) {
        nodes.push(node);
      }
      node.children.forEach(traverse);
    };
    if (tree.root) {
      traverse(tree.root);
    }
    return nodes;
  }

  /**
   * Find node by title (case-insensitive)
   */
  findNodeByTitle(tree: GoalTaskTree, title: string): GoalTaskNode | null {
    for (const node of tree.nodes.values()) {
      if (node.title.toLowerCase() === title.toLowerCase()) {
        return node;
      }
    }
    return null;
  }
}
