import { ChannelRegistry } from "./registry.js";
import { WhatsAppChannel } from "./whatsapp.js";
import { TelegramChannel } from "./telegram.js";
import { DiscordChannel } from "./discord.js";
import { SignalChannel } from "./signal.js";
import { SlackChannel } from "./slack.js";
import type { ZuckermanConfig } from "@server/world/config/types.js";
import type { SimpleRouter } from "@server/world/communication/routing/index.js";
import type { AgentRuntimeFactory } from "@server/world/runtime/agents/index.js";
import type { Channel } from "./types.js";
import { setChannelRegistry } from "@server/agents/zuckerman/tools/channels/index.js";
import { formatMessageWithChannelSource } from "./envelope.js";
import { loadConfig } from "@server/world/config/index.js";
import { resolveSecurityContext } from "@server/world/execution/security/context/index.js";
import { activityRecorder } from "@server/agents/zuckerman/activity/index.js";

/**
 * Initialize and register all configured channels
 */
export async function initializeChannels(
  config: ZuckermanConfig,
  router: SimpleRouter,
  agentFactory: AgentRuntimeFactory,
  broadcastEvent?: (event: { type: "event"; event: string; payload?: unknown }) => void,
): Promise<ChannelRegistry> {
  const registry = new ChannelRegistry();

  // Initialize WhatsApp if enabled
  if (config.channels?.whatsapp?.enabled) {
    const whatsappChannel = new WhatsAppChannel(
      config.channels.whatsapp,
      (status) => {
        // Broadcast status to all connected gateway clients
        if (broadcastEvent) {
          broadcastEvent({
            type: "event",
            event: "channel.whatsapp.status",
            payload: { ...status, channelId: "whatsapp", ts: Date.now() },
          });
        }
      },
    );

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

        // Get or create conversation using runtime router
        if (!runtime.getOrCreateConversationByKey) {
          console.error(`[Channels] Runtime for "${route.agentId}" does not support conversation routing`);
          return;
        }

        const conversationType = message.metadata?.isGroup ? "group" : "main";
        const conversationObj = runtime.getOrCreateConversationByKey(route.conversationKey, conversationType);
        
        // Get conversation state for type checking
        const conversation = runtime.getConversation?.(conversationObj.id);
        if (!conversation) {
          console.error(`[Channels] Failed to get conversation state for "${route.agentId}"`);
          return;
        }

        // Format message with channel source prefix
        const formattedMessage = formatMessageWithChannelSource(message);

        // Run agent (runtime handles message persistence and channel metadata internally)
        const config = await loadConfig();
        const securityContext = await resolveSecurityContext(
          config.security,
          route.conversationId,
          conversation.conversation.type,
          route.agentId,
          route.homedir,
        );

        const result = await runtime.run({
          conversationId: route.conversationId,
          message: formattedMessage,
          securityContext,
          channelMetadata: {
            channel: "whatsapp",
            to: message.from,
            accountId: "default",
          },
        });

        // Note: Runtime now handles persisting assistant response and all messages

        // Send reply back through channel
        await whatsappChannel.send(result.response, message.from);
      } catch (error) {
        console.error("[Channels] Error processing message:", error);
      }
    });

    registry.register(whatsappChannel, {
      id: "whatsapp",
      type: "whatsapp",
      enabled: config.channels.whatsapp.enabled,
      config: config.channels.whatsapp as Record<string, unknown>,
    });

    // Set channel registry for agent tools
    setChannelRegistry(registry);
  }

  // Helper function to set up message routing for a channel
  const setupChannelRouting = async (
    channel: Channel,
    channelId: string,
    channelType: string,
  ) => {
    channel.onMessage(async (message) => {
      try {
        // Check for conversation reset commands
        const text = message.content.trim().toLowerCase();
        if (text === "/reset" || text === "/new" || text === "/clear" || text === "/start") {
          // Route to get conversation info
          const route = await router.routeToAgent(message, {
            accountId: "default",
          });

          // Get agent runtime
          const runtime = await agentFactory.getRuntime(route.agentId);
          if (runtime?.getConversation && runtime?.deleteConversation) {
            // Delete existing conversation if it exists
            const existingConversation = runtime.getConversation(route.conversationId);
            if (existingConversation) {
              runtime.deleteConversation(route.conversationId);
            }
          }

          // Send confirmation message
          await channel.send("✅ Conversation cleared! Starting fresh conversation.", message.from);
          return;
        }

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

        // Get or create conversation using runtime router
        if (!runtime.getOrCreateConversationByKey) {
          console.error(`[Channels] Runtime for "${route.agentId}" does not support conversation routing`);
          return;
        }

        const conversationType = message.metadata?.isGroup ? "group" : "main";
        const conversationObj = runtime.getOrCreateConversationByKey(route.conversationKey, conversationType);
        
        // Get conversation state for type checking
        const conversation = runtime.getConversation?.(conversationObj.id);
        if (!conversation) {
          console.error(`[Channels] Failed to get conversation state for "${route.agentId}"`);
          return;
        }

        // Format message with channel source prefix
        const formattedMessage = formatMessageWithChannelSource(message);

        // Record incoming channel message
        await activityRecorder.recordChannelMessageIncoming(
          route.agentId,
          route.conversationId,
          channelId,
          message.from,
          message.content,
        );

        // Run agent (runtime handles message persistence and channel metadata internally)
        const config = await loadConfig();
        const securityContext = await resolveSecurityContext(
          config.security,
          route.conversationId,
          conversation.conversation.type,
          route.agentId,
          route.homedir,
        );

        const result = await runtime.run({
          conversationId: route.conversationId,
          message: formattedMessage,
          securityContext,
          channelMetadata: {
            channel: channelId,
            to: message.from,
            accountId: "default",
          },
        });

        // Note: Runtime now handles persisting assistant response and all messages

        // Send reply back through channel
        await channel.send(result.response, message.from);
        
        // Record outgoing channel message
        await activityRecorder.recordChannelMessageOutgoing(
          route.agentId,
          route.conversationId,
          channelId,
          message.from,
          result.response,
        );
      } catch (error) {
        console.error("[Channels] Error processing message:", error);
      }
    });
  };

  // Initialize Telegram if enabled
  if (config.channels?.telegram?.enabled) {
    const telegramChannel = new TelegramChannel(
      config.channels.telegram,
      (status) => {
        // Broadcast status to all connected gateway clients
        if (broadcastEvent) {
          broadcastEvent({
            type: "event",
            event: "channel.telegram.status",
            payload: { ...status, channelId: "telegram", ts: Date.now() },
          });
        }
      },
    );
    await setupChannelRouting(telegramChannel, "telegram", "telegram");
    
    registry.register(telegramChannel, {
      id: "telegram",
      type: "telegram",
      enabled: config.channels.telegram.enabled,
      config: config.channels.telegram as Record<string, unknown>,
    });
    
    // Start channel (will be started by registry.startAll() but can start here if needed)
  }

  // Initialize Discord if enabled
  if (config.channels?.discord?.enabled) {
    const discordChannel = new DiscordChannel(
      config.channels.discord,
      (status) => {
        // Broadcast status to all connected gateway clients
        if (broadcastEvent) {
          broadcastEvent({
            type: "event",
            event: "channel.discord.status",
            payload: { ...status, channelId: "discord", ts: Date.now() },
          });
        }
      },
    );
    await setupChannelRouting(discordChannel, "discord", "discord");
    
    registry.register(discordChannel, {
      id: "discord",
      type: "discord",
      enabled: config.channels.discord.enabled,
      config: config.channels.discord as Record<string, unknown>,
    });
  }

  // Initialize Signal if enabled
  if (config.channels?.signal?.enabled) {
    const signalChannel = new SignalChannel(
      config.channels.signal,
      (status) => {
        // Broadcast status to all connected gateway clients
        if (broadcastEvent) {
          broadcastEvent({
            type: "event",
            event: "channel.signal.status",
            payload: { ...status, channelId: "signal", ts: Date.now() },
          });
        }
      },
    );
    await setupChannelRouting(signalChannel, "signal", "signal");
    
    registry.register(signalChannel, {
      id: "signal",
      type: "signal",
      enabled: config.channels.signal.enabled,
      config: config.channels.signal as Record<string, unknown>,
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
      config: config.channels.slack as Record<string, unknown>,
    });
  }

  // Set channel registry for agent tools (even if no channels registered)
  setChannelRegistry(registry);

  return registry;
}
