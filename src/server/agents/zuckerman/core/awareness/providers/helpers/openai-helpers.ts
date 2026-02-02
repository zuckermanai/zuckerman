import type { LLMMessage, LLMTool } from "../types.js";

export interface OpenAIRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
  }>;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }>;
  tool_choice?: "auto" | "required" | { type: "function"; function: { name: string } };
  stream?: boolean;
  stop?: string | string[];
}

export interface OpenAIResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface OpenAIChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: "assistant";
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: "stop" | "tool_calls" | "length" | "content_filter" | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export function toOpenAIRequest(params: {
  messages: LLMMessage[];
  systemPrompt?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LLMTool[];
  stream?: boolean;
}): OpenAIRequest {
  const messages: OpenAIRequest["messages"] = [];

  if (params.systemPrompt) {
    messages.push({
      role: "system",
      content: params.systemPrompt,
    });
  }

  for (const msg of params.messages) {
    if (msg.role === "system") {
      // Only skip if systemPrompt was provided separately, otherwise include it
      if (params.systemPrompt) {
        continue; // Already handled via systemPrompt parameter
      }
      // Include system message from array if no separate systemPrompt provided
      messages.push({
        role: "system",
        content: msg.content,
      });
      continue;
    }

    if (msg.role === "user") {
      messages.push({
        role: "user",
        content: msg.content,
      });
    } else if (msg.role === "assistant") {
      const assistantMsg: any = {
        role: "assistant",
      };
      if (msg.content) {
        assistantMsg.content = msg.content;
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }
      messages.push(assistantMsg);
    } else if (msg.role === "tool") {
      messages.push({
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: msg.content,
      });
    }
  }

  const tools = params.tools?.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    },
  }));

  return {
    model: params.model,
    messages,
    temperature: params.temperature,
    ...(params.maxTokens !== undefined ? { max_tokens: params.maxTokens } : {}), // Only include if provided (no limit)
    tools,
    stream: params.stream,
  };
}

export function fromOpenAIResponse(response: OpenAIResponse): {
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  finishReason?: string;
  tokensUsed?: { input: number; output: number; total: number };
  model: string;
} {
  const choice = response.choices[0];
  if (!choice) {
    throw new Error("No choice in OpenAI response");
  }

  const content = choice.message.content || "";
  const toolCalls = choice.message.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));

  return {
    content,
    toolCalls,
    finishReason: choice.finish_reason || undefined,
    tokensUsed: response.usage
      ? {
          input: response.usage.prompt_tokens ?? 0,
          output: response.usage.completion_tokens ?? 0,
          total: response.usage.total_tokens ?? 0,
        }
      : undefined,
    model: response.model,
  };
}

export function parseOpenAIStreamChunk(chunk: string): OpenAIChunk | null {
  const lines = chunk.split("\n");
  const dataLine = lines.find((l) => l.startsWith("data: "));
  if (!dataLine) return null;

  if (dataLine === "data: [DONE]") return null;

  try {
    const json = JSON.parse(dataLine.slice(6));
    return json as OpenAIChunk;
  } catch {
    return null;
  }
}
