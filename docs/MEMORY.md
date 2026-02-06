# Memory System Architecture

## Overview

The memory system is designed to simulate human brain memory with multiple memory types, each serving a specific purpose. It consists of:

- **Memory Module** (`core/memory/`) - Storage, retrieval, and search with 6 memory types
- **Sleep Module** (`sleep/`) - Processing, summarization, and consolidation
- **Embedding Providers** (`world/providers/embeddings/`) - Vector embedding generation

Sleep mode is inspired by human sleep - a period where the agent processes, consolidates, and saves memories before the context window fills up.

## Memory Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      MEMORY MODULE STRUCTURE                     │
└─────────────────────────────────────────────────────────────────┘

core/memory/
├── manager.ts              # Unified Memory Manager (orchestrates all stores)
├── types.ts                # Type definitions for all memory types
├── config.ts               # Memory search configuration
│
├── stores/                 # Memory Stores (Data Storage Layer)
│   ├── working/            # Working Memory - Active task buffer
│   ├── episodic/           # Episodic Memory - Events & experiences
│   ├── procedural/          # Procedural Memory - Skills & habits
│   ├── prospective/        # Prospective Memory - Future intentions
│   └── emotional/           # Emotional Memory - Emotion tags
│
└── services/               # Services (Utilities Layer)
    ├── encoding/           # Text chunking, embeddings, schema
    ├── storage/            # File persistence (daily/long-term)
    └── retrieval/          # Vector search with SQLite + FTS5
```

## Memory Types

### 1. Working Memory (`stores/working/`)
**Purpose**: Active buffer for current task processing

- **Duration**: Minutes to hours (auto-expires)
- **Capacity**: Limited, focused on current task
- **Storage**: In-memory only (per-conversation)
- **Use Case**: Current conversation turn, active tool state, intermediate reasoning

**Flow**:
```
User Message → Set Working Memory → Process Task → Clear After Completion
```

### 2. Episodic Memory (`stores/episodic/`)
**Purpose**: Remember specific events and experiences

- **Duration**: Days to weeks (decays over time)
- **Storage**: JSON files (`episodic.json`)
- **Structure**: Event with timestamp, context (who/what/when/where/why)
- **Use Case**: Conversation transcripts, tool executions, important events

**Flow**:
```
Event Occurs → Add Episodic Memory → Query by Time/Context → Also Saved to Daily Log
```

### 3. Semantic Memory (`manager.ts`)
**Purpose**: Facts, knowledge, concepts

- **Duration**: Permanent (doesn't decay)
- **Storage**: Long-term memory file (`MEMORY.md`)
- **Structure**: Facts with categories, relationships, confidence
- **Use Case**: User preferences, learned facts, domain knowledge

**Flow**:
```
Fact Learned → Add Semantic Memory → Append to MEMORY.md → Query by Concept
```

### 4. Procedural Memory (`stores/procedural/`)
**Purpose**: Skills, habits, automatic patterns

- **Duration**: Permanent (improves with use)
- **Storage**: JSON files (`procedural.json`)
- **Structure**: Pattern, trigger, action, success rate
- **Use Case**: Tool usage patterns, workflows, optimized sequences

**Flow**:
```
Pattern Detected → Add Procedural Memory → Match on Trigger → Record Success/Failure → Improve Success Rate
```

### 5. Prospective Memory (`stores/prospective/`)
**Purpose**: Future intentions and reminders

- **Duration**: Until triggered or cancelled
- **Storage**: JSON files (`prospective.json`)
- **Structure**: Intention, trigger (time/context), status, priority
- **Use Case**: Scheduled tasks, follow-ups, deferred actions

**Flow**:
```
Future Intention → Add Prospective Memory → Check Periodically → Trigger When Due → Mark Complete
```

### 6. Emotional Memory (`stores/emotional/`)
**Purpose**: Emotion-tagged experiences

- **Duration**: Follows parent memory
- **Storage**: JSON files (`emotional.json`)
- **Structure**: Emotion type, intensity, target memory ID
- **Use Case**: User satisfaction, error experiences, preferences

**Flow**:
```
Experience → Tag with Emotion → Link to Memory → Influence Future Retrieval
```

## Unified Memory Manager

The `UnifiedMemoryManager` coordinates all memory types and provides a single interface:

```typescript
// Set working memory for current task
manager.setWorkingMemory(conversationId, content, context);

// Add episodic memory (event)
const id = manager.addEpisodicMemory({
  event: "User asked about API",
  timestamp: Date.now(),
  context: { what: "API discussion", why: "Planning integration" }
});

// Add semantic memory (fact)
manager.addSemanticMemory({
  fact: "User prefers dark mode",
  category: "preferences",
  confidence: 0.9
});

// Add procedural memory (pattern)
manager.addProceduralMemory({
  pattern: "When user asks to read file, check if exists first",
  trigger: "read file",
  action: "check existence"
});

// Add prospective memory (reminder)
manager.addProspectiveMemory({
  intention: "Check API status tomorrow",
  triggerTime: tomorrowTimestamp,
  priority: 0.8
});

// Add emotional memory (tag)
manager.addEmotionalMemory({
  targetMemoryId: episodicId,
  targetMemoryType: "episodic",
  tag: { emotion: "satisfaction", intensity: "high", timestamp: Date.now() }
});

// Retrieve memories (unified)
const results = await manager.retrieveMemories({
  query: "API discussion",
  conversationId: "conv-123",
  types: ["episodic", "semantic"],
  limit: 10
});
```

## Vector Search System

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    VECTOR SEARCH FLOW                            │
└─────────────────────────────────────────────────────────────────┘

Memory Files (MEMORY.md, memory/*.md)
    │
    ▼
┌─────────────────────────────────────┐
│  File Sync & Indexing               │
│  ├─→ List memory files              │
│  ├─→ Chunk text (400 tokens)        │
│  ├─→ Generate embeddings (OpenAI/Gemini)│
│  └─→ Store in SQLite                │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  SQLite Database                    │
│  ├─→ chunks table (text + embedding)│
│  ├─→ files table (metadata)         │
│  ├─→ fts5 table (full-text search)  │
│  └─→ embedding_cache (reuse)        │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Search Query                        │
│  ├─→ Get query embedding            │
│  ├─→ Vector search (cosine similarity)│
│  ├─→ FTS5 search (text matching)   │
│  └─→ Hybrid scoring (combine)       │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Results                             │
│  └─→ Top matches with scores         │
└─────────────────────────────────────┘
```

### Components

**Embedding Providers** (`world/providers/embeddings/`):
- `OpenAIEmbeddingProvider` - Uses OpenAI embeddings API
- `GeminiEmbeddingProvider` - Uses Google Gemini embeddings API
- Auto-detects provider based on config

**Search Manager** (`services/retrieval/search.ts`):
- SQLite database with vector storage
- Hybrid search (vector + FTS5)
- File watching and syncing
- Embedding caching

**Encoding** (`services/encoding/`):
- `chunking.ts` - Text chunking with overlap
- `embeddings.ts` - Cosine similarity, parsing
- `schema.ts` - Database schema (chunks, files, FTS5)

## Data Flow Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        MEMORY SYSTEM FLOW                        │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│  User Message   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Agent Runtime (ZuckermanAwareness)     │
│  ┌─────────────────────────────────────┐ │
│  │ 1. Set Working Memory                │ │
│  │    └─→ Store current task context    │ │
│  └─────────────────────────────────────┘ │
│         │                                 │
│         ▼                                 │
│  ┌─────────────────────────────────────┐ │
│  │ 2. Check Sleep Mode Trigger         │ │
│  │    ├─→ Check token usage            │ │
│  │    ├─→ Check if >= 80% threshold    │ │
│  │    └─→ If yes → ENTER SLEEP MODE   │ │
│  └─────────────────────────────────────┘ │
│         │                                 │
│         ▼                                 │
│  ┌─────────────────────────────────────┐ │
│  │ 3. Sleep Mode (if triggered)        │ │
│  │    ├─→ Phase 1: Process            │ │
│  │    │   └─→ Analyze conversation     │ │
│  │    │       history                   │ │
│  │    │                                 │ │
│  │    ├─→ Phase 2: Summarize           │ │
│  │    │   └─→ Extract key points       │ │
│  │    │   └─→ Compress old messages     │ │
│  │    │                                 │ │
│  │    ├─→ Phase 3: Consolidate         │ │
│  │    │   └─→ Add Episodic Memories    │ │
│  │    │   └─→ Add Semantic Memories     │ │
│  │    │   └─→ Update Procedural Patterns│ │
│  │    │                                 │ │
│  │    └─→ Phase 4: Save                │ │
│  │        ├─→ Save to daily log        │ │
│  │        │   (memory/YYYY-MM-DD.md)   │ │
│  │        └─→ Update long-term         │ │
│  │            (MEMORY.md)               │ │
│  └─────────────────────────────────────┘ │
│         │                                 │
│         ▼                                 │
│  ┌─────────────────────────────────────┐ │
│  │ 4. Load Existing Memories           │ │
│  │    ├─→ Working Memory (if exists)   │ │
│  │    ├─→ Episodic (recent events)     │ │
│  │    ├─→ Semantic (from MEMORY.md)     │ │
│  │    ├─→ Procedural (matching patterns)│ │
│  │    └─→ Prospective (due reminders)  │ │
│  └─────────────────────────────────────┘ │
│         │                                 │
│         ▼                                 │
│  ┌─────────────────────────────────────┐ │
│  │ 5. Vector Search (if needed)        │ │
│  │    ├─→ Query embeddings             │ │
│  │    ├─→ Search SQLite chunks         │ │
│  │    └─→ Return relevant memories     │ │
│  └─────────────────────────────────────┘ │
│         │                                 │
│         ▼                                 │
│  ┌─────────────────────────────────────┐ │
│  │ 6. Build System Prompt              │ │
│  │    └─→ Inject memories into prompt   │ │
│  └─────────────────────────────────────┘ │
│         │                                 │
│         ▼                                 │
│  ┌─────────────────────────────────────┐ │
│  │ 7. Process Message                   │ │
│  │    ├─→ LLM generates response       │ │
│  │    └─→ May call tools (including    │ │
│  │        memory_save, memory_update)    │ │
│  └─────────────────────────────────────┘ │
│         │                                 │
│         ▼                                 │
│  ┌─────────────────────────────────────┐ │
│  │ 8. Save Memories                    │ │
│  │    ├─→ Add Episodic (events)        │ │
│  │    ├─→ Add Semantic (facts)         │ │
│  │    ├─→ Update Procedural (patterns) │ │
│  │    └─→ Add Prospective (reminders)  │ │
│  └─────────────────────────────────────┘ │
└─────────┬───────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────┐
│  Memory Stores (Updated)                │
│  ├─→ Working Memory (cleared after task) │
│  ├─→ Episodic (JSON files)              │
│  ├─→ Procedural (JSON files)            │
│  ├─→ Prospective (JSON files)           │
│  ├─→ Emotional (JSON files)              │
│  ├─→ MEMORY.md (long-term)              │
│  └─→ memory/YYYY-MM-DD.md (daily logs)  │
└─────────────────────────────────────────┘
```

## Memory Storage Structure

```
{homedir}/
├── MEMORY.md                    ← Long-term semantic memory
│   └─→ Persistent facts, preferences, important info
│
├── memory/
│   ├── 2024-02-01.md            ← Yesterday's daily log
│   ├── 2024-02-02.md            ← Today's daily log
│   └── 2024-02-03.md            ← Future logs
│
└── .memory/
    ├── zuckerman.sqlite         ← Vector search database
    │   ├── chunks (text + embeddings)
    │   ├── files (metadata)
    │   └── fts5 (full-text search)
    │
    └── stores/                  ← Structured memory stores
        ├── episodic.json        ← Episodic memories
        ├── procedural.json     ← Procedural memories
        ├── prospective.json     ← Prospective memories
        └── emotional.json       ← Emotional tags
```

## Memory Types Interaction

```
┌─────────────────────────────────────────────────────────────┐
│              MEMORY TYPES INTERACTION FLOW                   │
└─────────────────────────────────────────────────────────────┘

User: "What did we discuss about the API yesterday?"

1. Working Memory
   └─→ Stores: Current query, active search state
   
2. Episodic Memory Query
   └─→ Retrieves: Yesterday's API discussion event
   └─→ Returns: Event with timestamp, context, details
   
3. Semantic Memory Query
   └─→ Retrieves: Related facts about API
   └─→ Returns: API preferences, learned patterns
   
4. Procedural Memory Match
   └─→ Triggers: "API discussion" pattern
   └─→ Returns: Common workflow for API questions
   
5. Emotional Memory Boost
   └─→ Checks: Emotion tags on retrieved memories
   └─→ Boosts: Important/emotionally significant memories
   
6. Vector Search (if needed)
   └─→ Searches: SQLite chunks for "API yesterday"
   └─→ Returns: Relevant snippets from memory files
   
7. Unified Result
   └─→ Combines: All memory types
   └─→ Sorts: By relevance/recency
   └─→ Returns: Comprehensive answer
```

## Memory Tools

```
┌─────────────────────────────────────────────────────────────┐
│                      MEMORY TOOLS                            │
└─────────────────────────────────────────────────────────────┘

memory_search
    └─→ Vector search MEMORY.md and memory/*.md files
        ├─→ Uses embeddings (OpenAI/Gemini)
        ├─→ Hybrid search (vector + FTS5)
        └─→ Returns relevant snippets with paths/line numbers

memory_get
    └─→ Read specific memory file or line range
        └─→ Use after memory_search to read details

memory_save
    └─→ Save to today's daily log (memory/YYYY-MM-DD.md)
        └─→ For facts, decisions, events of today
        └─→ Also creates Episodic Memory

memory_update
    └─→ Update long-term memory (MEMORY.md)
        ├─→ mode: append → Add new info
        └─→ mode: replace → Rewrite entire file
        └─→ Also creates Semantic Memory
```

## Sleep Mode Trigger

```
┌─────────────────────────────────────────────────────────────┐
│                    SLEEP MODE TRIGGER                        │
└─────────────────────────────────────────────────────────────┘

Context Window Usage
    │
    ├─→ totalTokens < 80% threshold → Continue normally
    │
    └─→ totalTokens >= 80% threshold → Trigger Sleep Mode
            │
            ├─→ threshold = contextWindow * 0.8 (80%)
            │
            ├─→ Cooldown check (default: 5 minutes)
            │
            └─→ Sleep Mode Phases:
                    │
                    ├─→ Process: Analyze conversation
                    ├─→ Summarize: Compress old messages
                    ├─→ Consolidate: Create memory entries
                    │   ├─→ Episodic (events)
                    │   ├─→ Semantic (facts)
                    │   └─→ Procedural (patterns)
                    └─→ Save: Persist to memory files
```

### Sleep Mode Phases

1. **Process** - Analyzes conversation history to identify important information
2. **Summarize** - Compresses old messages using various strategies (sliding-window, progressive-summary, importance-based, hybrid)
3. **Consolidate** - Creates structured memory entries:
   - Episodic memories for events
   - Semantic memories for facts
   - Procedural memories for patterns
4. **Save** - Persists memories to daily logs and long-term storage

## Vector Search Details

### Embedding Generation

```
Text Input
    │
    ▼
┌─────────────────────────────────────┐
│  Embedding Provider                  │
│  ├─→ OpenAI (text-embedding-3-small) │
│  ├─→ Gemini (gemini-embedding-001)   │
│  └─→ Local (future)                  │
└─────────┬───────────────────────────┘
          │
          ▼
┌─────────────────────────────────────┐
│  Vector (1536 dimensions)          │
│  └─→ Stored as JSON in SQLite       │
└─────────────────────────────────────┘
```

### Hybrid Search

```
Query: "API discussion yesterday"
    │
    ├─→ Vector Search (70% weight)
    │   └─→ Cosine similarity with chunk embeddings
    │   └─→ Returns: Top matches by semantic similarity
    │
    └─→ FTS5 Search (30% weight)
        └─→ Full-text search on chunk text
        └─→ Returns: Top matches by text relevance
            │
            ▼
    Combined Score
    └─→ score = (vectorScore * 0.7) + (ftsScore * 0.3)
    └─→ Sorted by combined score
    └─→ Returns: Top N results
```

## Complete Memory Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│              MEMORY LIFECYCLE (Full Cycle)                   │
└─────────────────────────────────────────────────────────────┘

Conversation Start
    │
    ├─→ Initialize UnifiedMemoryManager
    ├─→ Load Working Memory (if exists)
    ├─→ Load Episodic Memories (recent)
    ├─→ Load Semantic Memories (from MEMORY.md)
    ├─→ Load Procedural Memories (all)
    ├─→ Check Prospective Memories (due items)
    │
    └─→ Sync Vector Search Index (if enabled)
            │
            ▼
    User Interaction
            │
            ├─→ Set Working Memory (current task)
            │
            ├─→ Check sleep mode trigger (80% threshold)
            │   └─→ If yes → Enter sleep mode
            │       ├─→ Process conversation
            │       ├─→ Summarize old messages
            │       ├─→ Consolidate memories
            │       │   ├─→ Add Episodic
            │       │   ├─→ Add Semantic
            │       │   └─→ Update Procedural
            │       └─→ Save to memory files
            │
            ├─→ Retrieve Memories (if needed)
            │   ├─→ Query Episodic (by time/context)
            │   ├─→ Query Semantic (by concept)
            │   ├─→ Match Procedural (by trigger)
            │   └─→ Vector Search (by query)
            │
            ├─→ Process message
            │   └─→ Agent may use memory tools
            │
            └─→ Save Memories (during/after interaction)
                    ├─→ Add Episodic (events)
                    ├─→ Add Semantic (facts)
                    ├─→ Update Procedural (patterns)
                    ├─→ Add Prospective (reminders)
                    └─→ Tag Emotional (if applicable)
                            │
                            ▼
    Memory Stores Updated
            │
            ├─→ Working Memory (cleared after task)
            ├─→ Episodic (JSON files)
            ├─→ Procedural (JSON files)
            ├─→ Prospective (JSON files)
            ├─→ Emotional (JSON files)
            ├─→ Daily logs (memory/YYYY-MM-DD.md)
            ├─→ Long-term (MEMORY.md)
            └─→ Vector Index (SQLite, synced)
                    │
                    ▼
    Next Conversation
            └─→ Loads updated memories
```

## Memory Type Characteristics

| Type | Duration | Storage | Access | Use Case |
|------|----------|---------|--------|----------|
| **Working** | Minutes-hours | RAM | Direct | Current task state |
| **Episodic** | Days-weeks | JSON | Time/context query | Events, experiences |
| **Semantic** | Permanent | MEMORY.md | Concept query | Facts, knowledge |
| **Procedural** | Permanent | JSON | Pattern match | Skills, habits |
| **Prospective** | Until triggered | JSON | Time/context check | Reminders, tasks |
| **Emotional** | Follows parent | JSON | Linked to memory | Emotion tags |

## Integration Points

### With Agent Runtime
- Working memory set at conversation start
- Memories retrieved before LLM call
- Memories saved after interaction

### With Sleep Module
- Sleep mode creates structured memories
- Consolidates episodic and semantic memories
- Updates procedural patterns

### With Vector Search
- Files synced to SQLite on conversation start
- Embeddings generated for chunks
- Hybrid search combines vector + FTS5

### With Tools
- `memory_search` uses vector search
- `memory_save` creates episodic memories
- `memory_update` creates semantic memories
