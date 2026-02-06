/**
 * Memory types and interfaces
 * Defines all memory types: working, episodic, semantic, procedural, prospective, emotional
 */

export type MemoryType = "working" | "episodic" | "semantic" | "procedural" | "prospective" | "emotional";

export type EmotionType = "joy" | "satisfaction" | "frustration" | "fear" | "neutral" | "positive" | "negative";
export type EmotionIntensity = "low" | "medium" | "high";

/**
 * Base memory entry
 */
export interface BaseMemory {
  id: string;
  type: MemoryType;
  createdAt: number;
  updatedAt: number;
  conversationId?: string;
}

/**
 * Working Memory - Active buffer for current task
 */
export interface WorkingMemory extends BaseMemory {
  type: "working";
  content: string;
  context: Record<string, unknown>;
  taskId?: string;
  expiresAt?: number; // Auto-clear after this timestamp
}

/**
 * Episodic Memory - Specific events and experiences
 */
export interface EpisodicMemory extends BaseMemory {
  type: "episodic";
  event: string;
  timestamp: number;
  context: {
    who?: string;
    what: string;
    when: number;
    where?: string;
    why?: string;
  };
  relatedMemories?: string[]; // IDs of related memories
  emotionalTag?: EmotionalTag;
}

/**
 * Semantic Memory - Facts and knowledge
 */
export interface SemanticMemory extends BaseMemory {
  type: "semantic";
  fact: string;
  category?: string;
  relationships?: Array<{
    type: string; // "related_to", "part_of", "causes", etc.
    targetId: string;
  }>;
  confidence?: number; // 0-1, how certain we are
  source?: string; // Where this fact came from
}

/**
 * Procedural Memory - Skills, habits, patterns
 */
export interface ProceduralMemory extends BaseMemory {
  type: "procedural";
  pattern: string;
  trigger: string | RegExp; // Context that triggers this pattern
  action: string; // What to do
  successRate?: number; // 0-1, how often this works
  lastUsed?: number;
  useCount?: number;
}

/**
 * Prospective Memory - Future intentions
 */
export interface ProspectiveMemory extends BaseMemory {
  type: "prospective";
  intention: string;
  triggerTime?: number; // When to trigger
  triggerContext?: string; // Context that triggers this
  status: "pending" | "triggered" | "completed" | "cancelled";
  priority?: number; // 0-1
}

/**
 * Emotional Memory - Emotion-tagged experiences
 */
export interface EmotionalTag {
  emotion: EmotionType;
  intensity: EmotionIntensity;
  timestamp: number;
}

export interface EmotionalMemory extends BaseMemory {
  type: "emotional";
  targetMemoryId: string; // ID of memory this emotion tags
  targetMemoryType: MemoryType;
  tag: EmotionalTag;
  context?: string; // Why this emotion was felt
}

/**
 * Memory retrieval options
 */
export interface MemoryRetrievalOptions {
  limit?: number;
  maxAge?: number; // milliseconds
  conversationId?: string;
  types?: MemoryType[];
  query?: string; // For semantic search
}

/**
 * Memory retrieval result
 */
export interface MemoryRetrievalResult {
  memories: BaseMemory[];
  total: number;
}

/**
 * Memory manager interface
 * Memory is managed internally through event-driven methods, not exposed as a database
 */
export interface MemoryManager {
  /**
   * Process a new user message and extract/save important memories
   * This is called by the runtime when a new user message arrives
   */
  onNewMessage(
    userMessage: string,
    conversationId?: string,
    conversationContext?: string
  ): Promise<void>;

  /**
   * Get relevant memories for a question/query
   * Searches across semantic, episodic, and procedural memories to find relevant information
   */
  getRelevantMemories(
    question: string,
    options?: {
      limit?: number;
      types?: MemoryType[];
    }
  ): Promise<MemoryRetrievalResult>;

  /**
   * Called when sleep mode ends
   * Saves consolidated memories from sleep mode as structured episodic/semantic memories
   */
  onSleepEnded(
    memories: Array<{
      content: string;
      type: "fact" | "preference" | "decision" | "event" | "learning";
      importance: number;
    }>,
    conversationId?: string
  ): void;
}
