/**
 * Embedding Provider
 * Fetches embeddings from OpenAI, Gemini, or local models
 */

export type { EmbeddingProvider } from "./provider.js";
export { OpenAIEmbeddingProvider, GeminiEmbeddingProvider, createEmbeddingProvider } from "./provider.js";
