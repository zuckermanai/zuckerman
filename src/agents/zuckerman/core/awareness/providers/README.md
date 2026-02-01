# LLM Providers

LLM provider implementations for Anthropic Claude, OpenAI GPT, and OpenRouter.

## Supported Providers

### Anthropic Claude
- Models: `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`, `claude-3-haiku-20240307`
- API Key: Set `ANTHROPIC_API_KEY` environment variable
- Streaming: Supported

### OpenAI GPT
- Models: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`
- API Key: Set `OPENAI_API_KEY` environment variable
- Streaming: Supported

### OpenRouter
- Models: Supports 100+ models including `anthropic/claude-3.5-sonnet`, `openai/gpt-4o`, `google/gemini-pro`, `meta-llama/llama-3.1-405b`, and more
- API Key: Set `OPENROUTER_API_KEY` environment variable
- Streaming: Supported
- See [OpenRouter Models](https://openrouter.ai/models) for full list

## Configuration

### Environment Variables
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export OPENROUTER_API_KEY="sk-or-..."

# Optional: OpenRouter metadata (for analytics)
export OPENROUTER_HTTP_REFERER="https://your-app.com"
export OPENROUTER_X_TITLE="Your App Name"
```

### Config File (`.zuckerman/config.json`)
```json
{
  "llm": {
    "anthropic": {
      "apiKey": "sk-ant-...",
      "defaultModel": "claude-3-5-sonnet-20241022"
    },
    "openai": {
      "apiKey": "sk-...",
      "defaultModel": "gpt-4o"
    },
    "openrouter": {
      "apiKey": "sk-or-...",
      "defaultModel": "deepseek/deepseek-chat"
    }
  },
  "agent": {
    "defaultProvider": "openrouter",
    "defaultModel": "deepseek/deepseek-chat",
    "temperature": 1.0
  }
}
```

## Usage

```typescript
import { AnthropicProvider, OpenAIProvider, OpenRouterProvider } from "@agents/intelligence/providers/index.js";

// Using Anthropic
const anthropicProvider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY!);
const response = await anthropicProvider.call({
  messages: [{ role: "user", content: "Hello!" }],
  systemPrompt: "You are a helpful assistant.",
  temperature: 1.0,
});

// Using OpenRouter
const openrouterProvider = new OpenRouterProvider(process.env.OPENROUTER_API_KEY!);
const openrouterResponse = await openrouterProvider.call({
  messages: [{ role: "user", content: "Hello!" }],
  systemPrompt: "You are a helpful assistant.",
  model: "anthropic/claude-3.5-sonnet", // Specify any OpenRouter model
  temperature: 1.0,
});
```
