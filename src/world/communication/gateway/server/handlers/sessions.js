import { loadConfig } from "@world/config/index.js";
/**
 * Find session across all agents' SessionManagers
 */
async function findSessionAcrossAgents(agentFactory, sessionId) {
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
async function listAllSessions(agentFactory) {
    const config = await loadConfig();
    const agentIds = config.agents?.list?.map((a) => a.id) || ["zuckerman"];
    const allSessions = [];
    for (const agentId of agentIds) {
        const sessionManager = agentFactory.getSessionManager(agentId);
        const sessions = sessionManager.listSessions();
        allSessions.push(...sessions);
    }
    return allSessions;
}
export function createSessionHandlers(agentFactory) {
    return {
        "sessions.create": async ({ respond, params }) => {
            const label = params?.label;
            const type = params?.type || "main";
            const agentId = params?.agentId || "zuckerman";
            const sessionManager = agentFactory.getSessionManager(agentId);
            const session = sessionManager.createSession(label || `session-${Date.now()}`, type, agentId);
            respond(true, { session });
        },
        "sessions.list": async ({ respond }) => {
            const sessions = await listAllSessions(agentFactory);
            respond(true, { sessions });
        },
        "sessions.get": async ({ respond, params }) => {
            const id = params?.id;
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
            const id = params?.id;
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
//# sourceMappingURL=sessions.js.map