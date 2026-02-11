import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { convertTextToSpeech } from "./index.js";
import { loadConfig } from "@server/world/config/index.js";

const textToSpeechToolInputSchema = z.object({
  text: z.string().describe("Text to convert to speech"),
  provider: z.enum(["openai", "elevenlabs", "edge"]).optional().describe("TTS provider: openai, elevenlabs, or edge (optional, uses config default)"),
  channel: z.string().optional().describe("Optional channel id to pick output format (e.g. telegram for voice-compatible format)"),
});

type TextToSpeechToolInput = z.infer<typeof textToSpeechToolInputSchema>;

export const textToSpeechTool = tool<TextToSpeechToolInput, string>({
  description: "Convert text to speech and return a MEDIA: path. Use when the user requests audio or TTS is enabled. Copy the MEDIA line exactly.",
  inputSchema: zodSchema(textToSpeechToolInputSchema),
  execute: async (params) => {
    try {
      const { text, provider, channel } = params;

      // Load config for TTS settings
      const config = await loadConfig();

      // Convert text to speech
      const result = await convertTextToSpeech({
        text,
        provider: provider,
        config: config.textToSpeech,
        channel: channel,
      });

      if (!result.success || !result.audioPath) {
        return JSON.stringify({
          success: false,
          error: result.error || "TTS conversion failed",
        });
      }

      // Build response lines
      const lines: string[] = [];
      
      // Tag Telegram Opus output as a voice bubble instead of a file attachment
      if (result.voiceCompatible) {
        lines.push("[[audio_as_voice]]");
      }
      
      lines.push(`MEDIA:${result.audioPath}`);

      return JSON.stringify({
        success: true,
        result: {
          content: lines.join("\n"),
          audioPath: result.audioPath,
          provider: result.provider,
          latencyMs: result.latencyMs,
        },
      });
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});
