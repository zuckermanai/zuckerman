# Tests

Test suite for Zuckerman AI Personal Agent.

## Structure

```
tests/
├── unit/          # Unit tests for individual components
│   ├── agents/    # Agent runtime and tool tests
│   ├── execution/ # Execution layer tests (sessions, process)
│   ├── gateway/   # Gateway WebSocket server tests
│   ├── providers/ # LLM provider tests
│   ├── storage/   # Storage layer tests (memory, config)
│   └── helpers/   # Test utilities and helpers
└── e2e/           # End-to-end integration tests
```

## Running Tests

```bash
# Run all tests (unit + e2e)
pnpm test

# Run only unit tests
pnpm test tests/unit

# Run only e2e tests
pnpm test tests/e2e

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage
```

## Test Types

### Unit Tests (`tests/unit/`)
- Fast, isolated tests for individual components
- Mock external dependencies
- Test individual functions and classes
- Examples: SessionManager, executeProcess, LLM providers

### E2E Tests (`tests/e2e/`)
- Full system integration tests
- Test complete workflows
- Use real gateway servers and connections
- Examples: Full agent conversations, CLI workflows

## Writing Tests

Tests use Vitest. Example:

```typescript
import { describe, it, expect } from "vitest";

describe("MyComponent", () => {
  it("should do something", () => {
    expect(true).toBe(true);
  });
});
```
