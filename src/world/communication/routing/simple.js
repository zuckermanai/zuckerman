import { resolveAgentRoute, resolveAgentLand } from "./resolver.js";
import { loadConfig } from "@world/config/index.js";
export class SimpleRouter {
    routes = [];
    agentFactory;
    constructor(agentFactory) {
        this.agentFactory = agentFactory;
    }
    /**
     * Get session manager for an agent
     */
    getSessionManager(agentId) {
        return this.agentFactory.getSessionManager(agentId);
    }
    addRoute(route) {
        this.routes.push(route);
    }
    removeRoute(channelId) {
        this.routes = this.routes.filter((r) => r.channelId !== channelId);
    }
    async route(message) {
        // Find matching route
        for (const route of this.routes) {
            if (route.channelId === message.channelId) {
                if (!route.condition || route.condition(message)) {
                    return route.sessionId;
                }
            }
        }
        // Default: use main session for default agent
        const config = await loadConfig();
        const defaultAgent = config.agents?.list?.find((a) => a.default) || config.agents?.list?.[0];
        const agentId = defaultAgent?.id || "zuckerman";
        const sessionManager = this.getSessionManager(agentId);
        const mainSession = sessionManager.getOrCreateMainSession(agentId);
        return mainSession.id;
    }
    /**
     * Route a message to an agent using routing rules
     */
    async routeToAgent(message, options) {
        const config = await loadConfig();
        // Determine peer type from message metadata
        const peer = message.metadata?.peerId ? {
            kind: message.metadata?.peerKind || "dm",
            id: message.metadata.peerId,
        } : undefined;
        // Resolve agent route
        const route = resolveAgentRoute({
            config,
            channel: message.channelId,
            accountId: options?.accountId,
            peer,
            guildId: options?.guildId,
            teamId: options?.teamId,
        });
        // Get or create session for this route
        const sessionManager = this.getSessionManager(route.agentId);
        const session = sessionManager.getOrCreateMainSession(route.agentId);
        // Resolve land directory
        const landDir = resolveAgentLand(config, route.agentId);
        return {
            sessionId: session.id,
            agentId: route.agentId,
            sessionKey: route.sessionKey,
            landDir,
        };
    }
}
//# sourceMappingURL=simple.js.map