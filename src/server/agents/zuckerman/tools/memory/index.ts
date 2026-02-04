import type { Tool } from "../terminal/index.js";
import { UnifiedMemoryManager } from "@server/agents/zuckerman/core/memory/manager.js";
import type { MemoryType } from "@server/agents/zuckerman/core/memory/types.js";

/**
 * Create memory search tool
 */
export function createMemorySearchTool(): Tool {
  return {
    definition: {
      name: "memory_search",
      description:
        "Search across all memory types (working, episodic, semantic, procedural, prospective, emotional) for relevant information. ALWAYS use this tool when asked about personal information (name, preferences, facts about the user), prior work, decisions, dates, people, preferences, or todos. Even if you think you know the answer, search memory first to ensure accuracy. Returns structured memories with their types and metadata.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query - describe what you're looking for in natural language",
          },
          types: {
            type: "array",
            description: "Memory types to search (working, episodic, semantic, procedural, prospective, emotional).",
            items: {
              type: "string",
              enum: ["working", "episodic", "semantic", "procedural", "prospective", "emotional"],
            } as { type: "string"; enum: string[] },
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (default: 20)",
          },
          maxAge: {
            type: "number",
            description: "Maximum age of memories in milliseconds (optional)",
          },
        },
        required: ["query", "types"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        const query = params.query as string;
        if (!query || typeof query !== "string") {
          return {
            success: false,
            error: "Query parameter is required and must be a string",
          };
        }

        const agentId = securityContext.agentId;
        const homedirDir = executionContext.homedirDir;

        const memoryManager = UnifiedMemoryManager.create(homedirDir, agentId);

        const types = params.types as MemoryType[] | undefined;
        const limit = typeof params.limit === "number" ? params.limit : 20;
        const maxAge = typeof params.maxAge === "number" ? params.maxAge : undefined;

        const result = await memoryManager.retrieveMemories({
          query,
          types,
          limit,
          maxAge,
        });

        return {
          success: true,
          result: {
            memories: result.memories,
            total: result.total,
            returned: result.memories.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          result: { memories: [], total: 0, returned: 0 },
        };
      }
    },
  };
}

/**
 * Create memory get tool
 */
export function createMemoryGetTool(): Tool {
  return {
    definition: {
      name: "memory_get",
      description:
        "Retrieve specific memory types or memories by type. Use this after memory_search to get detailed information about specific memory types (semantic, episodic, procedural, prospective, emotional). Returns structured memories from JSON stores.",
      parameters: {
        type: "object",
        properties: {
          type: {
            type: "string",
            description: "Memory type to retrieve (semantic, episodic, procedural, prospective, emotional)",
            enum: ["semantic", "episodic", "procedural", "prospective", "emotional"],
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (optional)",
          },
          conversationId: {
            type: "string",
            description: "Filter by conversation ID (optional)",
          },
        },
        required: ["type"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        const memoryType = params.type as MemoryType;
        if (!memoryType || typeof memoryType !== "string") {
          return {
            success: false,
            error: "Type parameter is required and must be a valid memory type",
          };
        }

        const agentId = securityContext.agentId;
        const homedirDir = executionContext.homedirDir;
        const conversationId = params.conversationId as string | undefined || executionContext.conversationId;
        const limit = typeof params.limit === "number" ? params.limit : undefined;

        const memoryManager = UnifiedMemoryManager.create(homedirDir, agentId);

        let memories: unknown[] = [];

        switch (memoryType) {
          case "semantic":
            memories = await memoryManager.getSemanticMemories({ conversationId, limit, query: undefined });
            break;
          case "episodic":
            memories = await memoryManager.getEpisodicMemories({ conversationId, limit });
            break;
          case "procedural":
            memories = await memoryManager.getProceduralMemories();
            if (limit) {
              memories = memories.slice(0, limit);
            }
            break;
          case "prospective":
            memories = await memoryManager.getProspectiveMemories({ conversationId, limit });
            break;
          case "emotional":
            memories = await memoryManager.getEmotionalMemories();
            if (limit) {
              memories = memories.slice(0, limit);
            }
            break;
          default:
            return {
              success: false,
              error: `Invalid memory type: ${memoryType}`,
            };
        }

        return {
          success: true,
          result: {
            type: memoryType,
            memories,
            count: memories.length,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          result: { type: params.type as string, memories: [], count: 0 },
        };
      }
    },
  };
}

