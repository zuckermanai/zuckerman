/**
 * Speech-to-Text (STT) / Audio Transcription Service
 * 
 * Supports multiple providers: OpenAI Whisper, Deepgram, Groq, etc.
 */

import { readFile } from "node:fs/promises";
import { basename } from "node:path";

export type SttProvider = "openai" | "deepgram" | "groq" | "whisper";

export interface SttTranscribeOptions {
  audioPath: string;
  provider?: SttProvider;
  language?: string;
  prompt?: string; // Context prompt for better transcription
}

export interface SttTranscribeResult {
  success: boolean;
  text?: string;
  error?: string;
  latencyMs?: number;
  provider?: string;
}

/**
 * Transcribe audio file using OpenAI Whisper API
 */
async function transcribeWithOpenAI(
  audioPath: string,
  options: { language?: string; prompt?: string } = {},
): Promise<SttTranscribeResult> {
  const startTime = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: "OpenAI API key not found. Set OPENAI_API_KEY environment variable.",
    };
  }

  try {
    const audioBuffer = await readFile(audioPath);
    
    // Node.js 22+ has native FormData and File support
    const audioFile = new File([audioBuffer], basename(audioPath), {
      type: "audio/mpeg", // Adjust based on file extension
    });

    const formData = new FormData();
    formData.append("file", audioFile);
    formData.append("model", "whisper-1");
    if (options.language) {
      formData.append("language", options.language);
    }
    if (options.prompt) {
      formData.append("prompt", options.prompt);
    }

    const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `OpenAI Whisper API error (${response.status}): ${errorText}`,
      };
    }

    const result = await response.json() as { text: string };
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      text: result.text,
      latencyMs,
      provider: "openai",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Transcribe audio file using Deepgram API
 */
async function transcribeWithDeepgram(
  audioPath: string,
  options: { language?: string; prompt?: string } = {},
): Promise<SttTranscribeResult> {
  const startTime = Date.now();
  const apiKey = process.env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: "Deepgram API key not found. Set DEEPGRAM_API_KEY environment variable.",
    };
  }

  try {
    const audioBuffer = await readFile(audioPath);

    const baseUrl = process.env.DEEPGRAM_BASE_URL || "https://api.deepgram.com/v1";
    const url = `${baseUrl}/listen?model=nova-2&language=${options.language || "en-US"}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "audio/mpeg", // Adjust based on audio format
      },
      body: audioBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Deepgram API error (${response.status}): ${errorText}`,
      };
    }

    const result = await response.json() as {
      results: {
        channels: Array<{
          alternatives: Array<{ transcript: string }>;
        }>;
      };
    };
    const text = result.results.channels[0]?.alternatives[0]?.transcript || "";
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      text,
      latencyMs,
      provider: "deepgram",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Transcribe audio file using Groq API (Whisper)
 */
async function transcribeWithGroq(
  audioPath: string,
  options: { language?: string; prompt?: string } = {},
): Promise<SttTranscribeResult> {
  const startTime = Date.now();
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      error: "Groq API key not found. Set GROQ_API_KEY environment variable.",
    };
  }

  try {
    const audioBuffer = await readFile(audioPath);
    const audioBase64 = audioBuffer.toString("base64");

    const baseUrl = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
    const response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file: `data:audio/mpeg;base64,${audioBase64}`,
        model: "whisper-large-v3",
        language: options.language || "en",
        prompt: options.prompt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Groq API error (${response.status}): ${errorText}`,
      };
    }

    const result = await response.json() as { text: string };
    const latencyMs = Date.now() - startTime;

    return {
      success: true,
      text: result.text,
      latencyMs,
      provider: "groq",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Transcribe audio file to text
 */
export async function transcribeAudio(options: SttTranscribeOptions): Promise<SttTranscribeResult> {
  const { audioPath, provider: requestedProvider, language, prompt } = options;

  // Auto-detect provider based on available API keys
  const provider = requestedProvider || (() => {
    if (process.env.OPENAI_API_KEY) return "openai";
    if (process.env.DEEPGRAM_API_KEY) return "deepgram";
    if (process.env.GROQ_API_KEY) return "groq";
    return "openai"; // Default to OpenAI
  })();

  switch (provider) {
    case "openai":
      return transcribeWithOpenAI(audioPath, { language, prompt });
    case "deepgram":
      return transcribeWithDeepgram(audioPath, { language, prompt });
    case "groq":
      return transcribeWithGroq(audioPath, { language, prompt });
    default:
      return {
        success: false,
        error: `Unknown provider: ${provider}`,
      };
  }
}
