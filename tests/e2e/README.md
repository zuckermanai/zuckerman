# End-to-End Tests

End-to-end tests that test the full system integration.

## Structure

E2E tests should test complete workflows:
- Full gateway communication flows
- Agent execution with real LLM providers (optional)
- CLI interface workflows
- Multi-step agent interactions

## Running Tests

```bash
# Run all tests (unit + e2e)
pnpm test

# Run only e2e tests
pnpm test tests/e2e

# Run in watch mode
pnpm test:watch
```

## Writing E2E Tests

E2E tests should:
- Start actual gateway servers
- Use real WebSocket connections
- Test complete user workflows
- Clean up resources after tests

Example:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startGatewayServer } from "@world/network/gateway/server/index.js";

describe("E2E: Agent Workflow", () => {
  let server: { close: () => void };
  
  beforeAll(async () => {
    server = await startGatewayServer({ port: 0 });
  });
  
  afterAll(() => {
    server.close();
  });
  
  it("should handle complete agent conversation", async () => {
    // Test full workflow
  });
});
```
