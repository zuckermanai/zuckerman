import type { LLMProvider, LLMCallParams, LLMResponse, LLMMessage } from "./types.js";

export class CustomProvider implements LLMProvider {
  name = "custom";
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(apiKey: string, baseUrl: string, defaultModel: string) {
    // apiKey is optional - some custom providers (e.g., local LLMs) don't require authentication
    if (!baseUrl) {
      throw new Error("Custom base URL is required");
    }
    if (!defaultModel) {
      throw new Error("Custom default model is required");
    }
    this.apiKey = apiKey || "";
    // Append /chat/completions if not already present
    this.baseUrl = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl.replace(/\/$/, "")}/chat/completions`;
    this.defaultModel = defaultModel;
  }

  async call(params: LLMCallParams): Promise<LLMResponse> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = this.defaultModel,
      tools,
    } = params;

    const customMessages = this.formatMessages(messages, systemPrompt);

    const body: Record<string, unknown> = {
      model,
      messages: customMessages,
      temperature,
      max_tokens: maxTokens,
    };

    // Add tools if provided
    if (tools && tools.length > 0) {
      body.tools = tools.map((tool) => ({
        type: "function",
        function: tool.function,
      }));
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom API error: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{
        message?: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: string;
            function: { name: string; arguments: string };
          }>;
        };
        delta?: { content: string };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
      model?: string;
    };

    const message = data.choices[0]?.message;
    const content = message?.content || "";
    const toolCalls = message?.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    return {
      content,
      tokensUsed: data.usage
        ? {
            input: data.usage.prompt_tokens,
            output: data.usage.completion_tokens,
            total: data.usage.total_tokens,
          }
        : undefined,
      model: data.model,
      finishReason: data.choices[0]?.finish_reason,
      toolCalls,
    };
  }

  async *stream(params: LLMCallParams): AsyncIterable<string> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = this.defaultModel,
    } = params;

    const customMessages = this.formatMessages(messages, systemPrompt);

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: customMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom API error: ${response.status} ${errorText}`);
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
              choices?: Array<{ delta?: { content?: string } }>;
            };

            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }

  private formatMessages(messages: LLMMessage[], systemPrompt?: string): any[] {
    const customMessages: any[] = [];

    if (systemPrompt) {
      customMessages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      // CRITICAL: Skip tool messages without valid toolCallId (invalid state - these cannot be sent to API)
      const hasToolCallId = msg.toolCallId && typeof msg.toolCallId === "string" && msg.toolCallId.trim().length > 0;
      
      if (msg.role === "tool" && !hasToolCallId) {
        console.warn("Skipping invalid tool message (missing toolCallId):", {
          content: msg.content.substring(0, 100),
        });
        continue;
      }

      const customMsg: any = {
        role: msg.role,
        content: msg.content || null,
      };

      // Handle tool calls in assistant messages
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        customMsg.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }

      // Handle tool results - ensure tool_call_id is set for tool role messages
      if (msg.role === "tool" || hasToolCallId) {
        customMsg.role = "tool";
        customMsg.tool_call_id = msg.toolCallId!;
      }

      // Final validation
      if (customMsg.role === "tool" && !customMsg.tool_call_id) {
        continue;
      }

      customMessages.push(customMsg);
    }

    return customMessages;
  }
}
