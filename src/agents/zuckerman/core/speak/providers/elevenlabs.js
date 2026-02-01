/**
 * ElevenLabs Text-to-Speech Provider
 *
 * Generates speech audio using ElevenLabs text-to-speech API.
 */
const DEFAULT_ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_ELEVENLABS_VOICE_ID = "pMsXgVXv3BLzUgSXRplE";
const DEFAULT_ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";
export async function elevenlabsTextToSpeech(text, options = {}) {
    const startTime = Date.now();
    const apiKey = options.apiKey || process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY;
    if (!apiKey) {
        return {
            success: false,
            error: "ElevenLabs API key not found. Set ELEVENLABS_API_KEY or XI_API_KEY environment variable.",
        };
    }
    const voiceId = options.voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID;
    const modelId = options.modelId || DEFAULT_ELEVENLABS_MODEL_ID;
    const outputFormat = options.outputFormat || DEFAULT_OUTPUT_FORMAT;
    const voiceSettings = {
        stability: options.stability ?? 0.5,
        similarity_boost: options.similarityBoost ?? 0.75,
        style: options.style ?? 0.0,
        use_speaker_boost: options.useSpeakerBoost ?? true,
    };
    const speed = options.speed ?? 1.0;
    try {
        const baseUrl = process.env.ELEVENLABS_BASE_URL || DEFAULT_ELEVENLABS_BASE_URL;
        const url = `${baseUrl}/text-to-speech/${voiceId}`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": apiKey,
            },
            body: JSON.stringify({
                text,
                model_id: modelId,
                voice_settings: voiceSettings,
                ...(speed !== 1.0 ? { speed } : {}),
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `ElevenLabs text-to-speech API error (${response.status}): ${errorText}`,
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
//# sourceMappingURL=elevenlabs.js.map