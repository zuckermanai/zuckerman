import type { GatewayRequestHandlers } from "../types.js";
import { loadConfig } from "@world/config/index.js";
import { convertTextToSpeech } from "@agents/zuckerman/core/speak/index.js";
import type { TextToSpeechConfig } from "@world/config/types.js";

export function createTextToSpeechHandlers(): Partial<GatewayRequestHandlers> {
  return {
    "text-to-speech.status": async ({ respond }) => {
      try {
        const config = await loadConfig();
        const textToSpeechConfig = config.textToSpeech || {};
        
        respond(true, {
          enabled: textToSpeechConfig.enabled !== false,
          auto: textToSpeechConfig.auto || "off",
          provider: textToSpeechConfig.provider || "edge",
          maxLength: textToSpeechConfig.maxLength || 1500,
          summarize: textToSpeechConfig.summarize !== false,
        });
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    "text-to-speech.enable": async ({ respond }) => {
      try {
        const config = await loadConfig();
        if (!config.textToSpeech) {
          config.textToSpeech = {};
        }
        config.textToSpeech.enabled = true;
        
        // Save config would go here - for now just return success
        respond(true, { enabled: true });
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    "text-to-speech.disable": async ({ respond }) => {
      try {
        const config = await loadConfig();
        if (!config.textToSpeech) {
          config.textToSpeech = {};
        }
        config.textToSpeech.enabled = false;
        
        respond(true, { enabled: false });
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    "text-to-speech.convert": async ({ respond, params }) => {
      try {
        const text = params?.text as string | undefined;
        const provider = params?.provider as "openai" | "elevenlabs" | "edge" | undefined;
        const channel = params?.channel as string | undefined;

        if (!text || typeof text !== "string") {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "text parameter is required",
          });
          return;
        }

        const config = await loadConfig();
        const result = await convertTextToSpeech({
          text,
          provider,
          config: config.textToSpeech,
          channel,
        });

        if (!result.success) {
          respond(false, undefined, {
            code: "TEXT_TO_SPEECH_ERROR",
            message: result.error || "Text-to-speech conversion failed",
          });
          return;
        }

        respond(true, {
          audioPath: result.audioPath,
          provider: result.provider,
          latencyMs: result.latencyMs,
          voiceCompatible: result.voiceCompatible,
        });
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    "text-to-speech.setProvider": async ({ respond, params }) => {
      try {
        const provider = params?.provider as "openai" | "elevenlabs" | "edge" | undefined;

        if (!provider || !["openai", "elevenlabs", "edge"].includes(provider)) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "provider must be one of: openai, elevenlabs, edge",
          });
          return;
        }

        const config = await loadConfig();
        if (!config.textToSpeech) {
          config.textToSpeech = {};
        }
        config.textToSpeech.provider = provider;

        respond(true, { provider });
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    "text-to-speech.providers": async ({ respond }) => {
      try {
        const config = await loadConfig();
        const textToSpeechConfig = config.textToSpeech || {};

        const providers = [
          {
            id: "openai",
            name: "OpenAI",
            configured: Boolean(textToSpeechConfig.openai?.apiKey || process.env.OPENAI_API_KEY),
            models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
            voices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"],
          },
          {
            id: "elevenlabs",
            name: "ElevenLabs",
            configured: Boolean(
              textToSpeechConfig.elevenlabs?.apiKey ||
              process.env.ELEVENLABS_API_KEY ||
              process.env.XI_API_KEY
            ),
            models: ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_monolingual_v1"],
          },
          {
            id: "edge",
            name: "Edge Text-to-Speech",
            configured: textToSpeechConfig.edge?.enabled !== false, // Edge TTS doesn't need API key
            models: [],
          },
        ];

        respond(true, {
          providers,
          active: textToSpeechConfig.provider || "edge",
        });
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
  };
}
