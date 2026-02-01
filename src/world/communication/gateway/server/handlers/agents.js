import { loadConfig } from "@world/config/index.js";
import { resolveSecurityContext } from "@world/execution/security/context/index.js";
import { resolveAgentLand } from "@world/communication/routing/resolver.js";
import { sendEvent } from "../connection.js";
export function createAgentHandlers(sessionManager, agentFactory) {
    return {
        "agents.list": async ({ respond }) => {
            try {
                const agents = await agentFactory.listAgents();
                respond(true, { agents });
            }
            catch (err) {
                respond(false, undefined, {
                    code: "ERROR",
                    message: err instanceof Error ? err.message : "Failed to list agents",
                });
            }
        },
        "agent.run": async ({ respond, params, client }) => {
            const sessionId = params?.sessionId;
            const message = params?.message;
            const config = await loadConfig();
            // Resolve agent ID - check params first, then config
            let agentId = params?.agentId;
            if (!agentId) {
                // Get from agents.list default
                const agents = config.agents?.list || [];
                const defaultAgent = agents.find(a => a.default) || agents[0];
                agentId = defaultAgent?.id || "zuckerman";
            }
            const thinkingLevel = params?.thinkingLevel;
            const model = params?.model;
            const temperature = params?.temperature;
            if (!sessionId) {
                respond(false, undefined, {
                    code: "INVALID_REQUEST",
                    message: "Missing sessionId",
                });
                return;
            }
            if (!message) {
                respond(false, undefined, {
                    code: "INVALID_REQUEST",
                    message: "Missing message",
                });
                return;
            }
            try {
                // Get the correct SessionManager for this agent
                const agentSessionManager = agentFactory.getSessionManager(agentId);
                // Get or create session
                let session = agentSessionManager.getSession(sessionId);
                let actualSessionId = sessionId;
                if (!session) {
                    const newSession = agentSessionManager.createSession(`session-${sessionId}`, "main", agentId);
                    session = agentSessionManager.getSession(newSession.id);
                    actualSessionId = newSession.id; // Use the actual created session ID
                }
                // Resolve land directory for this agent
                const landDir = resolveAgentLand(config, agentId);
                const securityContext = await resolveSecurityContext(config.security, sessionId, session.session.type, agentId, landDir);
                // Add user message to session (use actualSessionId, not the original sessionId)
                await agentSessionManager.addMessage(actualSessionId, "user", message);
                // Get agent runtime
                const runtime = await agentFactory.getRuntime(agentId);
                if (!runtime) {
                    respond(false, undefined, {
                        code: "AGENT_NOT_FOUND",
                        message: `Agent "${agentId}" not found`,
                    });
                    return;
                }
                // Create streaming callback to emit events
                const streamCallback = (event) => {
                    // Emit event to the client
                    sendEvent(client.socket, {
                        type: "event",
                        event: `agent.stream.${event.type}`,
                        payload: {
                            ...event.data,
                            sessionId: actualSessionId,
                        },
                    });
                };
                // Pass security context to runtime (use actualSessionId)
                const result = await runtime.run({
                    sessionId: actualSessionId,
                    message,
                    thinkingLevel: thinkingLevel,
                    model,
                    temperature,
                    securityContext,
                    stream: streamCallback,
                });
                // Add assistant response to session (use actualSessionId)
                await agentSessionManager.addMessage(actualSessionId, "assistant", result.response);
                respond(true, {
                    runId: result.runId,
                    response: result.response,
                    tokensUsed: result.tokensUsed,
                    toolsUsed: result.toolsUsed,
                });
            }
            catch (err) {
                const errorMessage = err instanceof Error ? err.message : "Agent execution failed";
                // Check if it's an LLM provider error
                if (errorMessage.includes("API key") || errorMessage.includes("No LLM provider")) {
                    respond(false, undefined, {
                        code: "LLM_CONFIG_ERROR",
                        message: `${errorMessage}. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.`,
                    });
                }
                else {
                    respond(false, undefined, {
                        code: "AGENT_ERROR",
                        message: errorMessage,
                    });
                }
            }
        },
        "agent.prompts": async ({ respond, params }) => {
            const agentId = params?.agentId || null;
            if (!agentId) {
                respond(false, undefined, {
                    code: "INVALID_REQUEST",
                    message: "Missing agentId",
                });
                return;
            }
            try {
                const runtime = await agentFactory.getRuntime(agentId);
                if (!runtime || !runtime.loadPrompts) {
                    respond(false, undefined, {
                        code: "AGENT_NOT_FOUND",
                        message: `Agent "${agentId}" not found or doesn't support prompt loading`,
                    });
                    return;
                }
                const prompts = await runtime.loadPrompts();
                const promptsData = prompts;
                respond(true, {
                    agentId,
                    system: promptsData.system,
                    behavior: promptsData.behavior,
                    personality: promptsData.personality,
                    instructions: promptsData.instructions,
                    fileCount: promptsData.files?.size ?? 0,
                });
            }
            catch (err) {
                respond(false, undefined, {
                    code: "ERROR",
                    message: err instanceof Error ? err.message : "Failed to load prompts",
                });
            }
        },
    };
}
//# sourceMappingURL=agents.js.map