import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";
import type { ChannelRegistry } from "@server/world/communication/messengers/channels/index.js";

// Channel registry accessor
let globalChannelRegistry: ChannelRegistry | null = null;

export function setChannelRegistry(registry: ChannelRegistry | null): void {
  globalChannelRegistry = registry;
}

export function getChannelRegistry(): ChannelRegistry | null {
  return globalChannelRegistry;
}

const channelToolInputSchema = z.object({
  channel: z.enum(["telegram", "discord", "signal", "whatsapp"]).describe("The channel type to send the message through"),
  message: z.string().describe("The message text to send"),
  to: z.string().optional().describe("Optional: Recipient identifier (chat ID, channel ID, phone number, etc.). If omitted or set to 'me', will send to the current chat/channel where the user is messaging from."),
});

type ChannelToolInput = z.infer<typeof channelToolInputSchema>;

export const channelTool = tool<ChannelToolInput, string>({
  description: "Send a message via a communication channel (Telegram, Discord, Signal, or WhatsApp). Use this when the user asks you to send a message through any of these channels.",
  inputSchema: zodSchema(channelToolInputSchema),
  execute: async (params) => {
    try {
      const { channel, message, to } = params;

      if (!message) {
        return JSON.stringify({
          success: false,
          error: "Message is required",
        });
      }

      const channelRegistry = getChannelRegistry();
      if (!channelRegistry) {
        return JSON.stringify({
          success: false,
          error: `Channel registry is not available. Make sure ${channel} is configured and connected.`,
        });
      }

      const channelInstance = channelRegistry.get(channel);
      if (!channelInstance) {
        return JSON.stringify({
          success: false,
          error: `${channel} channel is not configured. Please set up ${channel} in settings.`,
        });
      }

      if (!channelInstance.isConnected()) {
        return JSON.stringify({
          success: false,
          error: `${channel} is not connected. Please connect ${channel} in settings first.`,
        });
      }

      await channelInstance.send(message, to ?? "");

      return JSON.stringify({
        success: true,
        result: `Message sent successfully via ${channel}${to ? ` to ${to}` : ""}`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to send ${params.channel} message`;
      return JSON.stringify({
        success: false,
        error: errorMessage,
      });
    }
  },
});

