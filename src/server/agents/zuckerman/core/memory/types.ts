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
 */
export interface MemoryManager {
  // Working memory
  setWorkingMemory(conversationId: string, content: string, context?: Record<string, unknown>): void;
  getWorkingMemory(conversationId: string): WorkingMemory | null;
  clearWorkingMemory(conversationId: string): void;
  
  // Episodic memory
  addEpisodicMemory(memory: Omit<EpisodicMemory, "id" | "type" | "createdAt" | "updatedAt">): string;
  getEpisodicMemories(options?: MemoryRetrievalOptions): Promise<EpisodicMemory[]>;
  
  // Semantic memory
  addSemanticMemory(memory: Omit<SemanticMemory, "id" | "type" | "createdAt" | "updatedAt">): string;
  getSemanticMemories(options?: MemoryRetrievalOptions): Promise<SemanticMemory[]>;
  
  // Procedural memory
  addProceduralMemory(memory: Omit<ProceduralMemory, "id" | "type" | "createdAt" | "updatedAt">): string;
  getProceduralMemories(trigger?: string): Promise<ProceduralMemory[]>;
  updateProceduralMemory(id: string, success: boolean): void;
  
  // Prospective memory
  addProspectiveMemory(memory: Omit<ProspectiveMemory, "id" | "type" | "createdAt" | "updatedAt">): string;
  getProspectiveMemories(options?: MemoryRetrievalOptions): Promise<ProspectiveMemory[]>;
  triggerProspectiveMemory(id: string): void;
  completeProspectiveMemory(id: string): void;
  
  // Emotional memory
  addEmotionalMemory(memory: Omit<EmotionalMemory, "id" | "type" | "createdAt" | "updatedAt">): string;
  getEmotionalMemories(targetMemoryId?: string): Promise<EmotionalMemory[]>;
  
  // Unified retrieval
  retrieveMemories(options: MemoryRetrievalOptions): Promise<MemoryRetrievalResult>;
  
  // Memory formatting for prompts
  getRelevantMemoryContext(options: MemoryRetrievalOptions): Promise<string>;
  
  // Cleanup
  cleanup(): Promise<void>;
  clearExpiredWorkingMemory(): void;
}
