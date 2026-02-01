import type { GatewayRequestHandlers } from "../types.js";
import { loadConfig } from "@world/storage/config/index.js";
import { convertTTS } from "@world/voice/tts.js";
import type { TtsConfig } from "@world/storage/config/types.js";

export function createTtsHandlers(): Partial<GatewayRequestHandlers> {
  return {
    "tts.status": async ({ respond }) => {
      try {
        const config = await loadConfig();
        const ttsConfig = config.tts || {};
        
        respond(true, {
          enabled: ttsConfig.enabled !== false,
          auto: ttsConfig.auto || "off",
          provider: ttsConfig.provider || "edge",
          maxLength: ttsConfig.maxLength || 1500,
          summarize: ttsConfig.summarize !== false,
        });
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    "tts.enable": async ({ respond }) => {
      try {
        const config = await loadConfig();
        if (!config.tts) {
          config.tts = {};
        }
        config.tts.enabled = true;
        
        // Save config would go here - for now just return success
        respond(true, { enabled: true });
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    "tts.disable": async ({ respond }) => {
      try {
        const config = await loadConfig();
        if (!config.tts) {
          config.tts = {};
        }
        config.tts.enabled = false;
        
        respond(true, { enabled: false });
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    "tts.convert": async ({ respond, params }) => {
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
        const result = await convertTTS({
          text,
          provider,
          config: config.tts,
          channel,
        });

        if (!result.success) {
          respond(false, undefined, {
            code: "TTS_ERROR",
            message: result.error || "TTS conversion failed",
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

    "tts.setProvider": async ({ respond, params }) => {
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
        if (!config.tts) {
          config.tts = {};
        }
        config.tts.provider = provider;

        respond(true, { provider });
      } catch (err) {
        respond(false, undefined, {
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },

    "tts.providers": async ({ respond }) => {
      try {
        const config = await loadConfig();
        const ttsConfig = config.tts || {};

        const providers = [
          {
            id: "openai",
            name: "OpenAI",
            configured: Boolean(ttsConfig.openai?.apiKey || process.env.OPENAI_API_KEY),
            models: ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"],
            voices: ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"],
          },
          {
            id: "elevenlabs",
            name: "ElevenLabs",
            configured: Boolean(
              ttsConfig.elevenlabs?.apiKey ||
              process.env.ELEVENLABS_API_KEY ||
              process.env.XI_API_KEY
            ),
            models: ["eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_monolingual_v1"],
          },
          {
            id: "edge",
            name: "Edge TTS",
            configured: ttsConfig.edge?.enabled !== false, // Edge TTS doesn't need API key
            models: [],
          },
        ];

        respond(true, {
          providers,
          active: ttsConfig.provider || "edge",
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
