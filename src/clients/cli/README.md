# CLI Interface

Command-line interface for interacting with Zuckerman agents.

## Commands

### `zuckerman gateway`

Start the gateway server.

```bash
zuckerman gateway
zuckerman gateway --port 18790
zuckerman gateway --host 0.0.0.0
```

### `zuckerman agent`

Talk to an agent interactively or send a single message.

**Interactive mode:**
```bash
zuckerman agent
```

**Single message mode:**
```bash
zuckerman agent --message "Hello, how are you?"
```

**Options:**
- `-m, --message <message>` - Send a single message (non-interactive)
- `-c, --conversation <conversation>` - Use a specific conversation ID
- `-a, --agent <agent>` - Agent ID (default: "zuckerman")
- `--host <host>` - Gateway host (default: "127.0.0.1")
- `--port <port>` - Gateway port (default: 18789)

**Conversation Management:**
- Conversations are automatically created and persisted in `.zuckerman/cli-conversation.json`
- Use `--conversation` to override the default conversation
- Conversations maintain conversation history

### `zuckerman status`

Check gateway status and health.

```bash
zuckerman status
zuckerman status --port 18790
```

## Examples

```bash
# Just run the agent - gateway starts automatically if needed!
zuckerman agent

# Or send a single message
zuckerman agent --message "What is 2+2?"

# If you want to run gateway separately (optional)
zuckerman gateway

# Check if gateway is running
zuckerman status
```

**Note:** The `agent` command automatically starts the gateway server if it's not already running. You only need one terminal! The gateway will shut down automatically when you exit the agent conversation.

## Architecture

- `gateway-client.ts` - WebSocket client for connecting to gateway
- `agent-command.ts` - Agent interaction logic (interactive + single message)
- `index.ts` - CLI command definitions using Commander.js
