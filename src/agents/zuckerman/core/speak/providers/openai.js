/**
 * OpenAI Text-to-Speech Provider
 *
 * Generates speech audio using OpenAI's text-to-speech API.
 */
const DEFAULT_OPENAI_MODEL = "tts-1";
const DEFAULT_OPENAI_VOICE = "alloy";
const OPENAI_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"];
const OPENAI_MODELS = ["tts-1", "tts-1-hd", "gpt-4o-mini-tts"];
export async function openaiTextToSpeech(text, options = {}) {
    const startTime = Date.now();
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return {
            success: false,
            error: "OpenAI API key not found. Set OPENAI_API_KEY environment variable.",
        };
    }
    const model = options.model || DEFAULT_OPENAI_MODEL;
    const voice = options.voice || DEFAULT_OPENAI_VOICE;
    const responseFormat = options.responseFormat || "mp3";
    const speed = options.speed || 1.0;
    // Validate voice
    if (!OPENAI_VOICES.includes(voice)) {
        return {
            success: false,
            error: `Invalid voice: ${voice}. Valid voices: ${OPENAI_VOICES.join(", ")}`,
        };
    }
    // Validate model
    if (!OPENAI_MODELS.includes(model)) {
        return {
            success: false,
            error: `Invalid model: ${model}. Valid models: ${OPENAI_MODELS.join(", ")}`,
        };
    }
    // Validate speed
    if (speed < 0.25 || speed > 4.0) {
        return {
            success: false,
            error: "Speed must be between 0.25 and 4.0",
        };
    }
    try {
        const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
        const response = await fetch(`${baseUrl}/audio/speech`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                input: text,
                voice,
                response_format: responseFormat,
                speed,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `OpenAI text-to-speech API error (${response.status}): ${errorText}`,
            };
        }
        const audioBuffer = Buffer.from(await response.arrayBuffer());
        const latencyMs = Date.now() - startTime;
        return {
            success: true,
            audioBuffer,
            latencyMs,
        };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}
//# sourceMappingURL=openai.js.map