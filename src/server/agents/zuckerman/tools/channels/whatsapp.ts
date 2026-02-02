import type { Tool } from "../terminal/index.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import { getChannelRegistry } from "./registry.js";

export function createWhatsAppTool(): Tool {
  return {
    definition: {
      name: "whatsapp",
      description: "Send a message via WhatsApp. Use this when the user asks you to send a WhatsApp message or communicate via WhatsApp. The phone number should be in international format (e.g., '1234567890' or '+1234567890').",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "The message text to send",
          },
          to: {
            type: "string",
            description: "Phone number in international format (e.g., '1234567890' or '+1234567890'). Can be just digits or include country code.",
          },
        },
        required: ["message", "to"],
      },
    },
    handler: async (params, securityContext) => {
      try {
        // Check if tool is allowed
        if (securityContext && !isToolAllowed("whatsapp", securityContext.toolPolicy)) {
          return {
            success: false,
            error: "WhatsApp tool is not allowed in this security context",
          };
        }

        const { message, to } = params as { message: string; to: string };

        if (!message || !to) {
          return {
            success: false,
            error: "Message and recipient phone number are required",
          };
        }

        // Check if channel registry is available
        const channelRegistry = getChannelRegistry();
        if (!channelRegistry) {
          return {
            success: false,
            error: "WhatsApp channel registry is not available. Make sure WhatsApp is configured and connected.",
          };
        }

        // Get WhatsApp channel
        const whatsappChannel = channelRegistry.get("whatsapp");
        if (!whatsappChannel) {
          return {
            success: false,
            error: "WhatsApp channel is not configured. Please set up WhatsApp in settings.",
          };
        }

        // Check if connected
        if (!whatsappChannel.isConnected()) {
          return {
            success: false,
            error: "WhatsApp is not connected. Please scan the QR code to connect WhatsApp first.",
          };
        }

        // Send message
        await whatsappChannel.send(message, to);

        return {
          success: true,
          result: `Message sent successfully to ${to}`,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Failed to send WhatsApp message";
        return {
          success: false,
          error: errorMessage,
        };
      }
    },
  };
}
