/**
 * Planning System Types
 * Task queue management and planning types
 */

import type { TaskStep } from "./tactical/steps.js";

/**
 * Task urgency level
 */
export type TaskUrgency = "low" | "medium" | "high" | "critical";

/**
 * Task source
 */
export type TaskSource = "user" | "prospective" | "self-generated";

/**
 * Task status
 */
export type TaskStatus = "pending" | "active" | "completed" | "cancelled" | "failed";

/**
 * Node type: goal or task
 */
export type NodeType = "goal" | "task";

/**
 * Goal status
 */
export type GoalStatus = "active" | "completed" | "paused" | "cancelled";



/**
 * Planning statistics
 */
export interface PlanningStats {
  totalCompleted: number;
  totalFailed: number;
  totalCancelled: number;
  averageCompletionTime: number; // milliseconds
  lastCompletedAt?: number;
}

/**
 * Pending interruption - waiting for user confirmation
 * UPDATED: Now uses GoalTaskNode instead of Task
 */
export interface PendingInterruption {
  currentNode: GoalTaskNode;
  newNode: GoalTaskNode;
  originalUserMessage: string; // Original user message (exact wording)
  assessment: {
    continuityStrength?: number;
    shouldSwitch: boolean;
    reasoning: string;
  };
  createdAt: number;
  conversationId?: string;
}

/**
 * Unified Goal/Task Node
 * Replaces both Task and separate Goal entities in tree structure
 */
export interface GoalTaskNode {
  id: string;
  type: NodeType;
  title: string;
  description?: string;
  
  // Goal-specific fields (only when type === "goal")
  goalStatus?: GoalStatus;
  targetDate?: number; // Optional deadline for goal
  progress?: number; // 0-100, calculated from children
  
  // Task-specific fields (only when type === "task")
  urgency?: TaskUrgency;
  priority?: number; // 0-1
  taskStatus?: TaskStatus;
  
  // Tree structure
  parentId?: string; // Parent goal/task ID
  children: GoalTaskNode[]; // Sub-goals or sub-tasks
  order: number; // Execution order within parent
  
  // Common fields
  source: TaskSource;
  createdAt: number;
  updatedAt: number;
  
  // Execution tracking
  result?: unknown; // Execution result
  error?: string; // Error message if failed
  prospectiveMemoryId?: string; // Link to prospective memory
  
  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Goal-Task Tree
 * Manages the entire tree structure
 */
export interface GoalTaskTree {
  root: GoalTaskNode | null; // Root goal (top-level)
  nodes: Map<string, GoalTaskNode>; // All nodes by ID for O(1) lookup
  executionPath: string[]; // Ordered node IDs for execution (leaf tasks only)
  activeNodeId: string | null; // Currently executing node ID
}

/**
 * Decomposition Result
 * Result of LLM-based goal decomposition
 */
export interface DecompositionResult {
  parentNodeId: string;
  children: GoalTaskNode[];
  executionOrder: number[]; // Order indices for children
}

/**
 * Execution Order Result
 * Calculated execution order from tree traversal
 */
export interface ExecutionOrderResult {
  path: string[]; // Ordered node IDs (leaf tasks only)
  readyNodes: GoalTaskNode[]; // Nodes ready to execute (dependencies satisfied)
  blockedNodes: GoalTaskNode[]; // Nodes blocked by dependencies
}

/**
 * Process queue result - can be task or none
 * Uses GoalTaskNode for task representation
 */
export type ProcessQueueResult = 
  | { type: "task"; node: GoalTaskNode }
  | { type: "none"; node: null };

/**
 * Plan result - result of planning for a new message
 * Simplified to just return a user-friendly message
 */
export interface PlanResult {
  message: string; // LLM-generated user-friendly message
}

/**
 * Planning State - Overall planning state per agent
 * UPDATED: Now uses tree instead of queue
 */
export interface PlanningState {
  agentId: string;
  tree: GoalTaskTree;
  currentNode: GoalTaskNode | null;
  lastSwitched: number;
  stats: PlanningStats;
}

