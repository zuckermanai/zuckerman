import type { GatewayRequestHandlers } from "../types.js";
import { AgentRuntimeFactory } from "@server/world/runtime/agents/index.js";
import { loadConfig } from "@server/world/config/index.js";
import { resolveAgentHomedir } from "@server/world/communication/routing/resolver.js";
import { MemorySystem } from "@server/agents/zuckerman/core/memory/memory-service.js";
import type { MemoryType, Memory } from "@server/agents/zuckerman/core/memory/types.js";

export function createMemoryHandlers(
  agentFactory: AgentRuntimeFactory,
): Partial<GatewayRequestHandlers> {
  return {
    "memory.list": async ({ respond, params }) => {
      try {
        const agentId = params?.agentId as string | undefined;
        const type = params?.type as MemoryType | undefined;

        if (!agentId) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "Missing agentId",
          });
          return;
        }

        const config = await loadConfig();
        const homedir = resolveAgentHomedir(config, agentId);
        const memorySystem = new MemorySystem(homedir, agentId);

        if (type) {
          const memories = memorySystem.findAll(type);
          respond(true, { memories, type });
        } else {
          // Get all memory types
          const allMemories: Record<MemoryType, Memory[]> = {
            working: memorySystem.findAll("working"),
            episodic: memorySystem.findAll("episodic"),
            semantic: memorySystem.findAll("semantic"),
            procedural: memorySystem.findAll("procedural"),
            prospective: memorySystem.findAll("prospective"),
            emotional: memorySystem.findAll("emotional"),
          };
          respond(true, { memories: allMemories });
        }
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to list memories",
        });
      }
    },

    "memory.get": async ({ respond, params }) => {
      try {
        const agentId = params?.agentId as string | undefined;
        const type = params?.type as MemoryType | undefined;
        const id = params?.id as string | undefined;

        if (!agentId || !type || !id) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "Missing agentId, type, or id",
          });
          return;
        }

        const config = await loadConfig();
        const homedir = resolveAgentHomedir(config, agentId);
        const memorySystem = new MemorySystem(homedir, agentId);

        const memory = memorySystem.find(type, id);
        if (!memory) {
          respond(false, undefined, {
            code: "NOT_FOUND",
            message: "Memory not found",
          });
          return;
        }

        respond(true, { memory });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to get memory",
        });
      }
    },

    "memory.create": async ({ respond, params }) => {
      try {
        const agentId = params?.agentId as string | undefined;
        const type = params?.type as MemoryType | undefined;
        const content = params?.content as string | undefined;
        const metadata = params?.metadata as Record<string, unknown> | undefined;

        if (!agentId || !type || !content) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "Missing agentId, type, or content",
          });
          return;
        }

        const config = await loadConfig();
        const homedir = resolveAgentHomedir(config, agentId);
        const memorySystem = new MemorySystem(homedir, agentId);

        const id = memorySystem.insert(type, content, metadata);
        const memory = memorySystem.find(type, id);

        respond(true, { memory });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to create memory",
        });
      }
    },

    "memory.update": async ({ respond, params }) => {
      try {
        const agentId = params?.agentId as string | undefined;
        const type = params?.type as MemoryType | undefined;
        const id = params?.id as string | undefined;
        const content = params?.content as string | undefined;
        const metadata = params?.metadata as Record<string, unknown> | undefined;

        if (!agentId || !type || !id) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "Missing agentId, type, or id",
          });
          return;
        }

        const config = await loadConfig();
        const homedir = resolveAgentHomedir(config, agentId);
        const memorySystem = new MemorySystem(homedir, agentId);

        const updates: Partial<{ content: string; metadata?: Record<string, unknown> }> = {};
        if (content !== undefined) {
          updates.content = content;
        }
        if (metadata !== undefined) {
          updates.metadata = metadata;
        }

        const success = memorySystem.update(type, id, updates);
        if (!success) {
          respond(false, undefined, {
            code: "NOT_FOUND",
            message: "Memory not found",
          });
          return;
        }

        const memory = memorySystem.find(type, id);
        respond(true, { memory });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to update memory",
        });
      }
    },

    "memory.delete": async ({ respond, params }) => {
      try {
        const agentId = params?.agentId as string | undefined;
        const type = params?.type as MemoryType | undefined;
        const id = params?.id as string | undefined;

        if (!agentId || !type || !id) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "Missing agentId, type, or id",
          });
          return;
        }

        const config = await loadConfig();
        const homedir = resolveAgentHomedir(config, agentId);
        const memorySystem = new MemorySystem(homedir, agentId);

        const success = memorySystem.remove(type, id);
        if (!success) {
          respond(false, undefined, {
            code: "NOT_FOUND",
            message: "Memory not found",
          });
          return;
        }

        respond(true, { deleted: true });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to delete memory",
        });
      }
    },
  };
}
