import type { LLMProvider, LLMCallParams, LLMResponse, LLMMessage } from "./types.js";

export class AnthropicProvider implements LLMProvider {
  name = "anthropic";
  private apiKey: string;
  private baseUrl = "https://api.anthropic.com/v1/messages";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Anthropic API key is required");
    }
    this.apiKey = apiKey;
  }

  async call(params: LLMCallParams): Promise<LLMResponse> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = "claude-3-5-sonnet-20241022",
      tools,
    } = params;

    // Convert messages format (Anthropic uses content blocks)
    const anthropicMessages: Array<{
      role: "user" | "assistant";
      content: Array<{ type: string; text?: string; tool_use?: { id: string; name: string; input: Record<string, unknown> }; tool_result?: { tool_use_id: string; content: string } }>;
    }> = [];

    for (const msg of messages) {
      if (msg.role === "system") continue;

      const role = msg.role === "user" ? "user" : "assistant";
      const content: Array<{ type: string; text?: string; tool_use?: { id: string; name: string; input: Record<string, unknown> }; tool_result?: { tool_use_id: string; content: string } }> = [];

      // Handle tool calls
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const toolCall of msg.toolCalls) {
          try {
            const args = JSON.parse(toolCall.arguments);
            content.push({
              type: "tool_use",
              tool_use: {
                id: toolCall.id,
                name: toolCall.name,
                input: args,
              },
            });
          } catch {
            // If parsing fails, use raw arguments
            content.push({
              type: "tool_use",
              tool_use: {
                id: toolCall.id,
                name: toolCall.name,
                input: { raw: toolCall.arguments },
              },
            });
          }
        }
      } else if (msg.toolCallId) {
        // Tool result
        content.push({
          type: "tool_result",
          tool_result: {
            tool_use_id: msg.toolCallId,
            content: msg.content,
          },
        });
      } else {
        // Regular text content
        content.push({
          type: "text",
          text: msg.content,
        });
      }

      anthropicMessages.push({ role, content });
    }

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: anthropicMessages,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    // Add tools if provided
    if (tools && tools.length > 0) {
      body.tools = tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      content: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
      stop_reason?: string;
      model?: string;
    };

    const textContent = data.content
      .filter((c) => c.type === "text")
      .map((c) => c.text || "")
      .join("");

    // Extract tool calls from content
    const toolCalls = data.content
      .filter((c) => c.type === "tool_use" && c.id && c.name)
      .map((c) => ({
        id: c.id!,
        name: c.name!,
        arguments: JSON.stringify(c.input || {}),
      }));

    return {
      content: textContent,
      tokensUsed: data.usage
        ? {
            input: data.usage.input_tokens,
            output: data.usage.output_tokens,
            total: data.usage.input_tokens + data.usage.output_tokens,
          }
        : undefined,
      model: data.model,
      finishReason: data.stop_reason,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  async *stream(params: LLMCallParams): AsyncIterable<string> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = "claude-3-5-sonnet-20241022",
    } = params;

    const anthropicMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      }));

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: anthropicMessages,
      stream: true,
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data) as {
              type: string;
              delta?: { type: string; text?: string };
            };

            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              yield parsed.delta.text;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
}
