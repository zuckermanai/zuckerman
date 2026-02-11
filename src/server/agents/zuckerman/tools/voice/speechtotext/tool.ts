import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { transcribeAudio } from "./index.js";

const speechToTextToolInputSchema = z.object({
  audioPath: z.string().describe("Path to the audio file to transcribe"),
  provider: z.enum(["openai", "deepgram", "groq", "whisper"]).optional().describe("STT provider: openai, deepgram, or groq (optional, uses config default)"),
  language: z.string().optional().describe("Language code (e.g., 'en', 'en-US'). Optional, provider will auto-detect if not specified."),
  prompt: z.string().optional().describe("Optional context prompt to help improve transcription accuracy"),
});

type SpeechToTextToolInput = z.infer<typeof speechToTextToolInputSchema>;

export const speechToTextTool = tool<SpeechToTextToolInput, string>({
  description: "Transcribe audio file to text. Use when the user sends an audio file or voice message that needs to be converted to text.",
  inputSchema: zodSchema(speechToTextToolInputSchema),
  execute: async (params) => {
    try {
      const { audioPath, provider, language, prompt } = params;

      // Transcribe audio
      const result = await transcribeAudio({
        audioPath,
        provider: provider,
        language: language,
        prompt: prompt,
      });

      if (!result.success || !result.text) {
        return JSON.stringify({
          success: false,
          error: result.error || "Transcription failed",
        });
      }

      return JSON.stringify({
        success: true,
        result: {
          text: result.text,
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
