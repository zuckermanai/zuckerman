import type { SecurityContext } from "@world/security/types.js";
import { isToolAllowed } from "@world/security/policy/tool-policy.js";
import type { Tool, ToolDefinition, ToolResult } from "../terminal/index.js";
import { convertTextToSpeech } from "@agents/zuckerman/core/speak/index.js";
import { loadConfig } from "@world/storage/config/index.js";

export function createTextToSpeechTool(): Tool {
  return {
    definition: {
      name: "text-to-speech",
      description: "Convert text to speech and return a MEDIA: path. Use when the user requests audio or text-to-speech is enabled. Copy the MEDIA line exactly.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Text to convert to speech",
          },
          provider: {
            type: "string",
            description: "Text-to-speech provider: openai, elevenlabs, or edge (optional, uses config default)",
            enum: ["openai", "elevenlabs", "edge"],
          },
          channel: {
            type: "string",
            description: "Optional channel id to pick output format (e.g. telegram for voice-compatible format)",
          },
        },
        required: ["text"],
      },
    },
    handler: async (params, securityContext) => {
      try {
        const { text, provider, channel } = params;

        if (typeof text !== "string" || text.trim().length === 0) {
          return {
            success: false,
            error: "text is required and must be non-empty",
          };
        }

        // Check tool security
        if (securityContext) {
          const toolAllowed = isToolAllowed("text-to-speech", securityContext.toolPolicy);
          if (!toolAllowed) {
            return {
              success: false,
              error: "Text-to-speech tool is not allowed by security policy",
            };
          }
        }

        // Load config for text-to-speech settings
        const config = await loadConfig();

        // Convert text to speech
        const result = await convertTextToSpeech({
          text,
          provider: provider as "openai" | "elevenlabs" | "edge" | undefined,
          config: config.textToSpeech,
          channel: typeof channel === "string" ? channel : undefined,
        });

        if (!result.success || !result.audioPath) {
          return {
            success: false,
            error: result.error || "Text-to-speech conversion failed",
          };
        }

        // Build response lines
        const lines: string[] = [];
        
        // Tag Telegram Opus output as a voice bubble instead of a file attachment
        if (result.voiceCompatible) {
          lines.push("[[audio_as_voice]]");
        }
        
        lines.push(`MEDIA:${result.audioPath}`);

        return {
          success: true,
          result: {
            content: lines.join("\n"),
            audioPath: result.audioPath,
            provider: result.provider,
            latencyMs: result.latencyMs,
          },
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
  };
}
