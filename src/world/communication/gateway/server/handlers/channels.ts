import type { GatewayRequestHandlers } from "../types.js";
import { ChannelRegistry } from "@world/communication/messengers/channels/index.js";
import { SimpleRouter } from "@world/communication/routing/index.js";
import { SessionManager } from "@agents/zuckerman/sessions/index.js";
import { AgentRuntimeFactory } from "@world/runtime/agents/index.js";
import { loadConfig } from "@world/config/index.js";
import { initializeChannels } from "@world/communication/messengers/channels/factory.js";

export function createChannelHandlers(
  channelRegistry: ChannelRegistry,
  router: SimpleRouter,
  sessionManager: SessionManager,
  agentFactory: AgentRuntimeFactory,
): Partial<GatewayRequestHandlers> {
  return {
    "channels.list": async ({ respond }) => {
      try {
        const channels = channelRegistry.list();
        respond(true, {
          channels: channels.map((ch) => ({
            id: ch.id,
            type: ch.type,
          })),
        });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to list channels",
        });
      }
    },

    "channels.status": async ({ respond }) => {
      try {
        const channels = channelRegistry.list();
        const status = channels.map((ch) => {
          const whatsapp = ch as any;
          return {
            id: ch.id,
            type: ch.type,
            connected: whatsapp.isConnected ? whatsapp.isConnected() : false,
          };
        });
        respond(true, { status });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to get channel status",
        });
      }
    },

    "channels.start": async ({ respond, params }) => {
      try {
        const channelId = params?.channelId as string | undefined;
        if (!channelId) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "Missing channelId",
          });
          return;
        }

        const channel = channelRegistry.get(channelId);
        if (!channel) {
          respond(false, undefined, {
            code: "CHANNEL_NOT_FOUND",
            message: `Channel "${channelId}" not found`,
          });
          return;
        }

        await channel.start();
        respond(true, { channelId, started: true });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to start channel",
        });
      }
    },

    "channels.stop": async ({ respond, params }) => {
      try {
        const channelId = params?.channelId as string | undefined;
        if (!channelId) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "Missing channelId",
          });
          return;
        }

        const channel = channelRegistry.get(channelId);
        if (!channel) {
          respond(false, undefined, {
            code: "CHANNEL_NOT_FOUND",
            message: `Channel "${channelId}" not found`,
          });
          return;
        }

        await channel.stop();
        respond(true, { channelId, stopped: true });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to stop channel",
        });
      }
    },

    "channels.reload": async ({ respond }) => {
      try {
        // Reload config and reinitialize channels
        const config = await loadConfig();
        
        // Stop all existing channels
        await channelRegistry.stopAll();
        
        // Clear registry
        channelRegistry.clear();
        
        // Reinitialize channels from updated config
        const newChannels = await initializeChannels(
          config,
          router,
          sessionManager,
          agentFactory,
        );
        
        // Copy new channels to existing registry
        for (const channel of newChannels.list()) {
          const channelConfig = newChannels.getConfig(channel.id);
          if (channelConfig) {
            channelRegistry.register(channel, channelConfig);
          }
        }
        
        // Start enabled channels
        await channelRegistry.startAll();
        
        respond(true, { reloaded: true });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to reload channels",
        });
      }
    },
  };
}
