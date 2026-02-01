import type { LLMProvider, LLMCallParams, LLMResponse, LLMMessage } from "./types.js";

export class OpenAIProvider implements LLMProvider {
  name = "openai";
  private apiKey: string;
  private baseUrl = "https://api.openai.com/v1/chat/completions";

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenAI API key is required");
    }
    this.apiKey = apiKey;
  }

  async call(params: LLMCallParams): Promise<LLMResponse> {
    const {
      messages,
      systemPrompt,
      temperature = 1.0,
      maxTokens = 4096,
      model = "gpt-4o",
      tools,
    } = params;

    // Convert messages format (handle tool calls)
    const openaiMessages: Array<{
      role: string;
      content: string | null;
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
      tool_call_id?: string;
    }> = [];

    if (systemPrompt) {
      openaiMessages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      const openaiMsg: {
        role: string;
        content: string | null;
        tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
        tool_call_id?: string;
      } = {
        role: msg.role,
        content: msg.content || null,
      };

      // Handle tool calls in assistant messages
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        openaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }

      // Handle tool results (role: "tool")
      if (msg.toolCallId) {
        openaiMsg.role = "tool";
        openaiMsg.tool_call_id = msg.toolCallId;
      }

      openaiMessages.push(openaiMsg);
    }

    const body: Record<string, unknown> = {
      model,
      messages: openaiMessages,
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
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
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
      model = "gpt-4o",
    } = params;

    const openaiMessages: Array<{ role: string; content: string }> = [];

    if (systemPrompt) {
      openaiMessages.push({
        role: "system",
        content: systemPrompt,
      });
    }

    for (const msg of messages) {
      openaiMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    const response = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: openaiMessages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
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
}
