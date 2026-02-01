# Zuckerman Core

Core cognitive modules for the Zuckerman agent.

## Structure

- `cognition/` - System instructions and cognitive capabilities
- `behavior/` - Behavior patterns and response styles
- `personality/` - Personality traits and communication style
- `learning/` - Learning and adaptation mechanisms
- `memory/` - Memory management strategies
  - `loader.ts` - Prompt loading and caching
  - `sessions/` - Session management (conversation memory)
- `awareness/` - The agent's awareness/orchestrator (runtime execution engine)

## Awareness

The `ZuckermanAwareness` class (the agent's "awareness") handles:
- Loading prompts from markdown files
- Building system prompts
- Executing agent runs (thinking loop)
- Tool execution and iteration
- Timeout and safeguard management
- Caching prompts for performance

## Usage

```typescript
import { ZuckermanAwareness } from "./core/awareness/runtime.js";
// Or use backward-compatible export:
import { ZuckermanRuntime } from "./runtime.js";

const awareness = new ZuckermanAwareness();
const result = await awareness.run({
  sessionId: "session-123",
  message: "Hello!",
  thinkingLevel: "medium",
});
```
