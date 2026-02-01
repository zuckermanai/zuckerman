export interface LLMMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  toolCallId?: string;
}

export interface LLMTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMCallParams {
  messages: LLMMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
  tools?: LLMTool[];
}

export interface LLMResponse {
  content: string;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  model?: string;
  finishReason?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
}

export interface LLMProvider {
  name: string;
  call(params: LLMCallParams): Promise<LLMResponse>;
  stream?(params: LLMCallParams): AsyncIterable<string>;
}
