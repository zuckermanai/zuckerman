/**
 * Text-to-Speech (TTS) Service
 * 
 * Unified interface for TTS providers (OpenAI, ElevenLabs, Edge TTS)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { openaiTTS, type OpenAITTSOptions } from "./providers/openai.js";
import { elevenlabsTTS, type ElevenLabsTTSOptions } from "./providers/elevenlabs.js";
import { edgeTTS, type EdgeTTSOptions } from "./providers/edge.js";
import type { TtsConfig } from "../storage/config/types.js";

export type TtsProvider = "openai" | "elevenlabs" | "edge";

export interface TtsConvertOptions {
  text: string;
  provider?: TtsProvider;
  config?: TtsConfig;
  channel?: string; // For channel-specific output formats (e.g., Telegram prefers Opus)
}

export interface TtsConvertResult {
  success: boolean;
  audioPath?: string;
  error?: string;
  latencyMs?: number;
  provider?: string;
  voiceCompatible?: boolean; // True if audio format is compatible with voice notes (e.g., Opus for Telegram)
}

const AUDIO_DIR = join(homedir(), ".zuckerman", "audio");

// Channel-specific output formats
const TELEGRAM_OUTPUT = {
  openai: "opus" as const,
  elevenlabs: "opus_48000_64",
  extension: ".opus",
  voiceCompatible: true,
};

const DEFAULT_OUTPUT = {
  openai: "mp3" as const,
  elevenlabs: "mp3_44100_128",
  extension: ".mp3",
  voiceCompatible: false,
};

/**
 * Resolve TTS provider from config or environment
 */
function resolveProvider(config?: TtsConfig): TtsProvider {
  if (config?.provider) {
    return config.provider;
  }

  // Auto-detect based on available API keys
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }
  if (process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY) {
    return "elevenlabs";
  }

  // Default to Edge TTS (no API key required)
  return "edge";
}

/**
 * Convert text to speech and save to file
 */
export async function convertTTS(options: TtsConvertOptions): Promise<TtsConvertResult> {
  const { text, provider: requestedProvider, config, channel } = options;

  if (!text || text.trim().length === 0) {
    return {
      success: false,
      error: "Text is required",
    };
  }

  // Resolve provider
  const provider = requestedProvider || resolveProvider(config);

  // Determine output format based on channel
  const isTelegram = channel === "telegram";
  const outputConfig = isTelegram ? TELEGRAM_OUTPUT : DEFAULT_OUTPUT;

  // Ensure audio directory exists
  if (!existsSync(AUDIO_DIR)) {
    await mkdir(AUDIO_DIR, { recursive: true });
  }

  let audioBuffer: Buffer | undefined;
  let latencyMs: number | undefined;
  let error: string | undefined;

  // Call appropriate provider
  switch (provider) {
    case "openai": {
      const openaiOptions: OpenAITTSOptions = {
        apiKey: config?.openai?.apiKey || process.env.OPENAI_API_KEY,
        model: config?.openai?.model || "tts-1",
        voice: config?.openai?.voice || "alloy",
        responseFormat: isTelegram ? "opus" : "mp3",
        speed: config?.openai?.speed,
      };
      const result = await openaiTTS(text, openaiOptions);
      if (result.success && result.audioBuffer) {
        audioBuffer = result.audioBuffer;
        latencyMs = result.latencyMs;
      } else {
        error = result.error;
      }
      break;
    }

    case "elevenlabs": {
      const elevenlabsOptions: ElevenLabsTTSOptions = {
        apiKey: config?.elevenlabs?.apiKey || process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY,
        voiceId: config?.elevenlabs?.voiceId || process.env.ELEVENLABS_VOICE_ID,
        modelId: config?.elevenlabs?.modelId || "eleven_multilingual_v2",
        outputFormat: isTelegram ? "opus_48000_64" : "mp3_44100_128",
        stability: config?.elevenlabs?.stability,
        similarityBoost: config?.elevenlabs?.similarityBoost,
        style: config?.elevenlabs?.style,
        useSpeakerBoost: config?.elevenlabs?.useSpeakerBoost,
        speed: config?.elevenlabs?.speed,
      };
      const result = await elevenlabsTTS(text, elevenlabsOptions);
      if (result.success && result.audioBuffer) {
        audioBuffer = result.audioBuffer;
        latencyMs = result.latencyMs;
      } else {
        error = result.error;
      }
      break;
    }

    case "edge": {
      const edgeOptions: EdgeTTSOptions = {
        voice: config?.edge?.voice || "en-US-MichelleNeural",
        lang: config?.edge?.lang || "en-US",
        outputFormat: config?.edge?.outputFormat || "audio-24khz-48kbitrate-mono-mp3",
        pitch: config?.edge?.pitch,
        rate: config?.edge?.rate,
        volume: config?.edge?.volume,
      };
      const result = await edgeTTS(text, edgeOptions);
      if (result.success && result.audioBuffer) {
        audioBuffer = result.audioBuffer;
        latencyMs = result.latencyMs;
      } else {
        error = result.error;
      }
      break;
    }

    default:
      return {
        success: false,
        error: `Unknown provider: ${provider}`,
      };
  }

  if (!audioBuffer) {
    return {
      success: false,
      error: error || "Failed to generate audio",
    };
  }

  // Save audio file
  const timestamp = Date.now();
  const filename = `tts-${timestamp}${outputConfig.extension}`;
  const audioPath = join(AUDIO_DIR, filename);

  try {
    await writeFile(audioPath, audioBuffer);
  } catch (err) {
    return {
      success: false,
      error: `Failed to save audio file: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }

  return {
    success: true,
    audioPath,
    latencyMs,
    provider,
    voiceCompatible: outputConfig.voiceCompatible,
  };
}
