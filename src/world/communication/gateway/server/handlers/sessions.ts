import type { GatewayRequestHandlers } from "../types.js";
import type { AgentRuntimeFactory } from "@world/runtime/agents/index.js";
import { loadConfig } from "@world/config/index.js";

/**
 * Find session across all agents' SessionManagers
 */
async function findSessionAcrossAgents(
  agentFactory: AgentRuntimeFactory,
  sessionId: string
): Promise<{ sessionManager: any; state: any } | null> {
  const config = await loadConfig();
  const agentIds = config.agents?.list?.map((a) => a.id) || ["zuckerman"];

  for (const agentId of agentIds) {
    const sessionManager = agentFactory.getSessionManager(agentId);
    const state = sessionManager.getSession(sessionId);
    if (state) {
      return { sessionManager, state };
    }
  }

  return null;
}

/**
 * List all sessions across all agents
 */
async function listAllSessions(agentFactory: AgentRuntimeFactory): Promise<any[]> {
  const config = await loadConfig();
  const agentIds = config.agents?.list?.map((a) => a.id) || ["zuckerman"];
  const allSessions: any[] = [];

  for (const agentId of agentIds) {
    const sessionManager = agentFactory.getSessionManager(agentId);
    const sessions = sessionManager.listSessions();
    allSessions.push(...sessions);
  }

  return allSessions;
}

export function createSessionHandlers(agentFactory: AgentRuntimeFactory): Partial<GatewayRequestHandlers> {
  return {
    "sessions.create": async ({ respond, params }) => {
      const label = params?.label as string | undefined;
      const type = (params?.type as string | undefined) || "main";
      const agentId = (params?.agentId as string | undefined) || "zuckerman";

      const sessionManager = agentFactory.getSessionManager(agentId);
      const session = sessionManager.createSession(
        label || `session-${Date.now()}`,
        type as "main" | "group" | "channel",
        agentId,
      );

      respond(true, { session });
    },

    "sessions.list": async ({ respond }) => {
      const sessions = await listAllSessions(agentFactory);
      respond(true, { sessions });
    },

    "sessions.get": async ({ respond, params }) => {
      const id = params?.id as string | undefined;
      if (!id) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing session id",
        });
        return;
      }

      const result = await findSessionAcrossAgents(agentFactory, id);
      if (!result) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Session ${id} not found`,
        });
        return;
      }

      respond(true, { session: result.state });
    },

    "sessions.delete": async ({ respond, params }) => {
      const id = params?.id as string | undefined;
      if (!id) {
        respond(false, undefined, {
          code: "INVALID_REQUEST",
          message: "Missing session id",
        });
        return;
      }

      const result = await findSessionAcrossAgents(agentFactory, id);
      if (!result) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Session ${id} not found`,
        });
        return;
      }

      const deleted = result.sessionManager.deleteSession(id);
      if (!deleted) {
        respond(false, undefined, {
          code: "NOT_FOUND",
          message: `Session ${id} not found`,
        });
        return;
      }

      respond(true, { deleted: true });
    },
  };
}
