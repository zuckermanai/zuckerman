/**
 * Memory Event Handlers
 * Convenience functions for handling different types of memory events
 */

import type { MemoryMetadata } from "./types.js";
import type { MemoryClassifier, MemoryEvent } from "./memory-classifier.js";

/**
 * Handle a new message event
 */
export async function onNewMessage(
  classifier: MemoryClassifier,
  userMessage: string,
  metadata?: MemoryMetadata
): Promise<void> {
  await classifier.classifyAndSave({
    type: "message",
    content: userMessage,
    metadata,
  });
}

/**
 * Handle an action event
 */
export async function onAction(
  classifier: MemoryClassifier,
  action: string,
  metadata?: MemoryMetadata
): Promise<void> {
  await classifier.classifyAndSave({
    type: "action",
    content: action,
    metadata,
  });
}

/**
 * Handle a thought event
 */
export async function onThought(
  classifier: MemoryClassifier,
  thought: string,
  metadata?: MemoryMetadata
): Promise<void> {
  await classifier.classifyAndSave({
    type: "thought",
    content: thought,
    metadata,
  });
}

/**
 * Handle a decision event
 */
export async function onDecision(
  classifier: MemoryClassifier,
  decision: string,
  metadata?: MemoryMetadata
): Promise<void> {
  await classifier.classifyAndSave({
    type: "decision",
    content: decision,
    metadata,
  });
}

/**
 * Handle an experience event
 */
export async function onExperience(
  classifier: MemoryClassifier,
  experience: string,
  metadata?: MemoryMetadata
): Promise<void> {
  await classifier.classifyAndSave({
    type: "experience",
    content: experience,
    metadata,
  });
}

/**
 * Handle a generic event
 */
export async function onEvent(
  classifier: MemoryClassifier,
  event: MemoryEvent
): Promise<void> {
  await classifier.classifyAndSave(event);
}
