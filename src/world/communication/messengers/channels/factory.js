import { ChannelRegistry } from "./registry.js";
import { WhatsAppChannel } from "./whatsapp.js";
import { TelegramChannel } from "./telegram.js";
import { DiscordChannel } from "./discord.js";
import { SlackChannel } from "./slack.js";
import { WebChatChannel } from "./webchat.js";
/**
 * Initialize and register all configured channels
 */
export async function initializeChannels(config, router, sessionManager, // Kept for backward compatibility, but will use factory
agentFactory, broadcastEvent) {
    const registry = new ChannelRegistry();
    // Initialize WhatsApp if enabled
    if (config.channels?.whatsapp?.enabled) {
        const whatsappChannel = new WhatsAppChannel(config.channels.whatsapp, (qr) => {
            // Broadcast QR code to all connected gateway clients
            if (broadcastEvent) {
                broadcastEvent({
                    type: "event",
                    event: "channel.whatsapp.qr",
                    payload: { qr, channelId: "whatsapp", ts: Date.now() },
                });
            }
        }, (connected) => {
            // Broadcast connection status to all connected gateway clients
            if (broadcastEvent) {
                broadcastEvent({
                    type: "event",
                    event: "channel.whatsapp.connection",
                    payload: { connected, channelId: "whatsapp", ts: Date.now() },
                });
            }
        });
        // Set up message handler to route to agents
        whatsappChannel.onMessage(async (message) => {
            try {
                // Route message to agent
                const route = await router.routeToAgent(message, {
                    accountId: "default",
                });
                // Get agent runtime
                const runtime = await agentFactory.getRuntime(route.agentId);
                if (!runtime) {
                    console.error(`[Channels] Agent "${route.agentId}" not found for message`);
                    return;
                }
                // Get session manager for this agent
                const sm = agentFactory.getSessionManager(route.agentId);
                // Get or create session
                let session = sm.getSession(route.sessionId);
                if (!session) {
                    const newSession = sm.createSession(route.sessionKey, message.metadata?.isGroup ? "group" : "main", route.agentId);
                    session = sm.getSession(newSession.id);
                }
                // Add message to session
                sm.addMessage(route.sessionId, "user", message.content);
                // Run agent
                const config = await import("@world/config/index.js").then(m => m.loadConfig());
                const { resolveSecurityContext } = await import("@world/execution/security/context/index.js");
                const securityContext = await resolveSecurityContext(config.security, route.sessionId, session.session.type, route.agentId, route.landDir);
                const result = await runtime.run({
                    sessionId: route.sessionId,
                    message: message.content,
                    securityContext,
                });
                // Add assistant response (reuse sm from above)
                sm.addMessage(route.sessionId, "assistant", result.response);
                // Send reply back through channel
                await whatsappChannel.send(result.response, message.from);
            }
            catch (error) {
                console.error("[Channels] Error processing message:", error);
            }
        });
        registry.register(whatsappChannel, {
            id: "whatsapp",
            type: "whatsapp",
            enabled: config.channels.whatsapp.enabled,
            config: config.channels.whatsapp,
        });
    }
    // Helper function to set up message routing for a channel
    const setupChannelRouting = async (channel, channelId, channelType) => {
        channel.onMessage(async (message) => {
            try {
                // Route message to agent
                const route = await router.routeToAgent(message, {
                    accountId: "default",
                });
                // Get agent runtime
                const runtime = await agentFactory.getRuntime(route.agentId);
                if (!runtime) {
                    console.error(`[Channels] Agent "${route.agentId}" not found for message`);
                    return;
                }
                // Get session manager for this agent
                const sm = agentFactory.getSessionManager(route.agentId);
                // Get or create session
                let session = sm.getSession(route.sessionId);
                if (!session) {
                    const newSession = sm.createSession(route.sessionKey, message.metadata?.isGroup ? "group" : "main", route.agentId);
                    session = sm.getSession(newSession.id);
                }
                // Add message to session
                sm.addMessage(route.sessionId, "user", message.content);
                // Run agent
                const config = await import("@world/config/index.js").then(m => m.loadConfig());
                const { resolveSecurityContext } = await import("@world/execution/security/context/index.js");
                const securityContext = await resolveSecurityContext(config.security, route.sessionId, session.session.type, route.agentId, route.landDir);
                const result = await runtime.run({
                    sessionId: route.sessionId,
                    message: message.content,
                    securityContext,
                });
                // Add assistant response (reuse sm from above)
                sm.addMessage(route.sessionId, "assistant", result.response);
                // Send reply back through channel
                await channel.send(result.response, message.from);
            }
            catch (error) {
                console.error("[Channels] Error processing message:", error);
            }
        });
    };
    // Initialize Telegram if enabled
    if (config.channels?.telegram?.enabled) {
        const telegramChannel = new TelegramChannel(config.channels.telegram);
        await setupChannelRouting(telegramChannel, "telegram", "telegram");
        registry.register(telegramChannel, {
            id: "telegram",
            type: "telegram",
            enabled: config.channels.telegram.enabled,
            config: config.channels.telegram,
        });
        // Start channel (will be started by registry.startAll() but can start here if needed)
    }
    // Initialize Discord if enabled
    if (config.channels?.discord?.enabled) {
        const discordChannel = new DiscordChannel(config.channels.discord);
        await setupChannelRouting(discordChannel, "discord", "discord");
        registry.register(discordChannel, {
            id: "discord",
            type: "discord",
            enabled: config.channels.discord.enabled,
            config: config.channels.discord,
        });
    }
    // Initialize Slack if enabled
    if (config.channels?.slack?.enabled) {
        const slackChannel = new SlackChannel(config.channels.slack);
        await setupChannelRouting(slackChannel, "slack", "slack");
        registry.register(slackChannel, {
            id: "slack",
            type: "slack",
            enabled: config.channels.slack.enabled,
            config: config.channels.slack,
        });
    }
    // Initialize WebChat if enabled
    if (config.channels?.webchat?.enabled) {
        const webchatChannel = new WebChatChannel(config.channels.webchat);
        await setupChannelRouting(webchatChannel, "webchat", "webchat");
        registry.register(webchatChannel, {
            id: "webchat",
            type: "webchat",
            enabled: config.channels.webchat.enabled,
            config: config.channels.webchat,
        });
    }
    return registry;
}
//# sourceMappingURL=factory.js.map