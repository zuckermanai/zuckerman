# Zuckerman Tools

Tools available to the Zuckerman agent.

## Available Tools

### Terminal Tool
Execute shell commands and return output.

**Definition:**
- `command` (string, required) - Command to execute
- `args` (array, optional) - Command arguments
- `cwd` (string, optional) - Working directory

**Example:**
```json
{
  "name": "terminal",
  "parameters": {
    "command": "ls",
    "args": ["-la"],
    "cwd": "/tmp"
  }
}
```

## Adding New Tools

1. Create a new tool file in this directory
2. Export a function that returns a `Tool` object
3. Register it in `registry.ts`

Example:
```typescript
export function createMyTool(): Tool {
  return {
    definition: {
      name: "mytool",
      description: "Does something",
      parameters: { ... }
    },
    handler: async (params) => {
      // Implementation
    }
  };
}
```
