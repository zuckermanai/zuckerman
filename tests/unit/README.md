# Unit Tests

Unit tests for individual components and modules.

## Structure

- `agents/` - Agent runtime and tool tests
- `execution/` - Execution layer tests (sessions, process)
- `gateway/` - Gateway server tests
- `providers/` - LLM provider tests
- `storage/` - Storage layer tests
- `helpers/` - Test utilities and helpers

## Running Tests

```bash
# Run all tests (unit + e2e)
pnpm test

# Run only unit tests
pnpm test tests/unit

# Run in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test tests/unit/gateway/connection.test.ts
```
