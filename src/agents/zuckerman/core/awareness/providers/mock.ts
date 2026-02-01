import type { LLMProvider, LLMCallParams, LLMResponse } from "./types.js";

/**
 * Mock LLM provider for testing
 * Returns predictable responses without making actual API calls
 */
export class MockLLMProvider implements LLMProvider {
  name = "mock";

  async call(params: LLMCallParams): Promise<LLMResponse> {
    const { messages } = params;
    const lastMessage = messages[messages.length - 1];
    const userMessage = lastMessage?.content || "";

    // Return a mock response
    return {
      content: `[Mock LLM] You said: "${userMessage}"\n\nThis is a mock response for testing.`,
      tokensUsed: {
        input: userMessage.length / 4, // Rough estimate
        output: 50,
        total: userMessage.length / 4 + 50,
      },
      model: "mock-model",
      finishReason: "stop",
    };
  }

  async *stream(params: LLMCallParams): AsyncIterable<string> {
    const response = await this.call(params);
    // Simulate streaming by yielding chunks
    const chunks = response.content.match(/.{1,10}/g) || [response.content];
    for (const chunk of chunks) {
      yield chunk;
    }
  }
}
