import type { LLMMessage, LLMTool } from "@server/world/providers/llm/types.js";
import { LLMModel } from "@server/world/providers/llm/index.js";
import type { StreamEventEmitter } from "@server/world/communication/stream-emitter.js";
import type { RunContext } from "./context.js";

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export interface LLMCallResult {
  content: string;
  toolCalls?: ToolCall[];
  tokensUsed?: { total: number };
}

export class LLMService {
  constructor(
    private model: LLMModel,
    private streamEmitter: StreamEventEmitter,
    private runId: string
  ) {}

  /**
   * Build messages array for LLM call from context
   */
  buildMessages(context: RunContext): LLMMessage[] {
    const messages: LLMMessage[] = [
      { role: "system", content: context.systemPrompt },
    ];

    // Add conversation history
    if (context.conversation) {
      for (const msg of context.conversation.messages) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }
    }
    
    // Add relevant memories if available
    if (context.relevantMemoriesText) {
      messages.push({ 
        role: "system", 
        content: context.relevantMemoriesText 
      });
    }

    return messages;
  }

  /**
   * Call LLM with streaming support when stream callback is provided
   */
  async call(params: {
    messages: LLMMessage[];
    temperature?: number;
    availableTools: LLMTool[];
  }): Promise<LLMCallResult> {
    const { messages, temperature, availableTools } = params;

    // Try streaming first if requested and model supports it
    if (this.streamEmitter) {
      let accumulatedContent = "";
      let streamingSucceeded = false;
      
      try {
        // For now, only use pure streaming when no tools are available
        // Most providers don't support streaming with tools properly
        if (availableTools.length === 0) {
          // Pure streaming - no tools needed
          for await (const token of this.model.stream({
            messages,
            temperature,
            tools: [],
          })) {
            accumulatedContent += token;
            streamingSucceeded = true;
            await this.streamEmitter.emitToken(this.runId, token);
          }

          return {
            content: accumulatedContent,
            tokensUsed: undefined, // Streaming doesn't provide token counts
          };
        }
      } catch (err) {
        // If streaming fails, fall back to non-streaming
        if (streamingSucceeded) {
          // Partial stream succeeded, but error occurred - still return what we have
          console.warn(`[LLMService] Streaming error, but partial content received:`, err);
          return {
            content: accumulatedContent,
            tokensUsed: undefined,
          };
        }
        console.warn(`[LLMService] Streaming failed, falling back to non-streaming:`, err);
      }
    }

    // Non-streaming path:
    // - When streaming failed or not supported
    // - When streaming not requested
    const result = await this.model.call({
      messages,
      temperature,
      tools: availableTools,
    });

    // If streaming was requested but we used non-streaming (due to tools or failure),
    // emit the complete response as token events with delays to simulate streaming
    if (this.streamEmitter && result.content) {
      // Emit as chunks with small delays to simulate streaming for better UX
      const chunkSize = 5; // Very small chunks for smoother appearance
      const content = result.content;
      
      for (let i = 0; i < content.length; i += chunkSize) {
        const chunk = content.slice(i, i + chunkSize);
        try {
          await this.streamEmitter.emitToken(this.runId, chunk);
          // Progressive delay: faster at start, slower as we go (for better UX)
          const delay = i < content.length / 2 ? 15 : 25;
          await new Promise(resolve => setTimeout(resolve, delay));
        } catch (err) {
          // If stream callback fails, log but continue
          console.warn(`[LLMService] Stream callback error:`, err);
        }
      }
    }

    return {
      content: result.content,
      toolCalls: result.toolCalls,
      tokensUsed: result.tokensUsed,
    };
  }
}
