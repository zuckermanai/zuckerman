/**
 * Embedding Provider
 * Fetches embeddings from OpenAI, Gemini, or local models
 */

import type { ResolvedMemorySearchConfig } from "@server/agents/zuckerman/core/memory/config.js";

export interface EmbeddingProvider {
  getEmbedding(text: string): Promise<number[]>;
  getEmbeddings(texts: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(apiKey: string, model: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl || "https://api.openai.com/v1";
  }

  async getEmbedding(text: string): Promise<number[]> {
    const [result] = await this.getEmbeddings([text]);
    return result;
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          input: texts,
          model: this.model,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI embedding API error: ${errorText}`);
      }

      const data = await response.json();
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error("Invalid response from OpenAI embedding API");
      }

      return data.data.map((item: { embedding: number[] }) => item.embedding);
    } catch (error) {
      throw new Error(
        `Failed to get embeddings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async getEmbedding(text: string): Promise<number[]> {
    const [result] = await this.getEmbeddings([text]);
    return result;
  }

  async getEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      // Gemini API endpoint
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;
      
      const requests = texts.map((text) => ({
        model: `models/${this.model}`,
        content: {
          parts: [{ text }],
        },
      }));

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini embedding API error: ${errorText}`);
      }

      const data = await response.json();
      if (!data.embeddings || !Array.isArray(data.embeddings)) {
        throw new Error("Invalid response from Gemini embedding API");
      }

      return data.embeddings.map((item: { values: number[] }) => item.values);
    } catch (error) {
      throw new Error(
        `Failed to get embeddings: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

/**
 * Create embedding provider based on config
 */
export function createEmbeddingProvider(
  config: ResolvedMemorySearchConfig
): EmbeddingProvider | null {
  if (!config.enabled) return null;

  const provider = config.provider === "auto" 
    ? (config.remote?.apiKey ? "openai" : "local")
    : config.provider;

  if (provider === "openai" && config.remote?.apiKey) {
    return new OpenAIEmbeddingProvider(
      config.remote.apiKey,
      config.model,
      config.remote.baseUrl
    );
  }

  if (provider === "gemini" && config.remote?.apiKey) {
    return new GeminiEmbeddingProvider(config.remote.apiKey, config.model);
  }

  // Local provider not implemented yet
  return null;
}
