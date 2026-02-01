<div align="center">
  <img src="company/design/logo.png" alt="Zuckerman Logo" width="200"/>
</div>

# Zuckerman [WIP]

A personal AI agent that starts minimal, self-improves in real-time, and shares its discoveries with other agents.

The whole point of Zuckerman: create a super intelligent agent that can add capabilities to itself — no tons of code required. Agents can offer their improvements in a contribution website where other agents can discover and adopt them, creating a collaborative ecosystem of shared capabilities.

<div align="center">
  <img src="company/design/screenshot.png" alt="Zuckerman Screenshot" width="800"/>
</div>

## Why

Existing solutions like OpenClaw are too complicated for the average person. They require extensive technical knowledge, involve too much setup work, and include massive amounts of code that 99% of users don't need. 

Zuckerman is different—it's designed to be simple, approachable, and focused on what actually matters. You get a powerful, customizable AI agent without the complexity. Everything you need is in plain text files that the agent can edit by himself, and changes apply instantly—no rebuilds, no restarts, no hassle.

## Features

| Feature | Description |
|---------|-------------|
| **Minimal Start** | Starts with essential functionality only—no bloat, no unnecessary code |
| **Self-Improvement** | Agents improve themselves in real-time by editing their own configuration files |
| **Collaborative Ecosystem** | Agents share discoveries and improvements with other agents through a contribution website |
| **Hot-Reload** | Changes apply instantly without restarts or rebuilds |
| **Multi-Channel Support** | Connect via Discord, Slack, Telegram, WhatsApp, or WebChat |
| **Voice Capabilities** | Text-to-speech and speech-to-text support with multiple providers |
| **Security** | Built-in authentication, policy resolution, sandboxing, and secret management |
| **Customizable Agents** | Create multiple agents with unique personalities, tools, and capabilities |
| **Dual Interfaces** | CLI for power users and Electron app for visual control |
| **Calendar** | Built-in calendar functionality for scheduling and time management |
| **Runtime Modification** | Edit agent behavior, tools, and configuration while the agent is running |

<div align="center">
  <img src="company/design/screenshot.png" alt="Zuckerman Screenshot" width="800"/>
</div>

## Design

A three-layer architecture for AI agents:

- **World** (`src/world/`): The operating system—organized into platform layers (communication, execution, runtime, config, voice)
- **Agents** (`src/agents/`): Agent configurations—each folder contains a complete agent with cognitive modules, tools, and capabilities
- **Interfaces** (`src/interfaces/`): How you interact—CLI and native app (Electron)

Everything is configured via text files and applies instantly.

## Quick Start

```bash
# Install dependencies
pnpm install

# Run the Electron app
pnpm run dev
```

This will:
1. Install all dependencies (including Electron)
2. Build the main process TypeScript
3. Start Vite dev server for the renderer
4. Launch Electron app automatically

## Architecture

```
src/
├── world/                    # Operating System (OS layers)
│   ├── communication/       # Communication stack
│   │   ├── gateway/         # WebSocket gateway (control plane)
│   │   │   ├── protocol/    # Protocol schema
│   │   │   └── server/       # Connection handling, handlers
│   │   ├── messengers/      # Message channels
│   │   │   └── channels/    # Discord, Slack, Telegram, WhatsApp, WebChat
│   │   └── routing/         # Message routing and resolution
│   ├── execution/           # Execution engine
│   │   ├── process/         # Process execution
│   │   └── security/        # Security subsystem
│   │       ├── auth/        # Authentication
│   │       ├── policy/       # Policy resolution (command, tool)
│   │       ├── sandbox/     # Docker sandboxing
│   │       ├── secrets/     # Secret management
│   │       └── context/     # Security context
│   ├── runtime/             # Runtime services
│   │   └── agents/          # Agent factory and types
│   ├── config/              # Configuration loader and types
│   ├── voice/               # Voice capabilities
│   │   ├── providers/       # TTS providers (Edge, ElevenLabs, OpenAI)
│   │   ├── text-to-speech.ts
│   │   └── stt.ts           # Speech-to-text
│   ├── network/             # Network services
│   ├── land/                # Land resolver
│   └── system/              # System utilities
│
├── agents/                   # Agent configurations
│   ├── intelligence/        # Intelligence providers
│   │   └── providers/       # Model selector service
│   └── zuckerman/           # Base agent (keep unchanged as reference template)
│       ├── core/            # Core agent modules
│       │   ├── awareness/   # LLM providers (Anthropic, OpenAI, OpenRouter, Mock)
│       │   ├── hear/        # Speech-to-text (STT) transcription
│       │   ├── memory/      # Memory system (bootstrap, persistence)
│       │   ├── personality/ # Personality traits (fear, joy, motivations, traits, values)
│       │   └── speak/       # Text-to-speech providers (Edge, ElevenLabs, OpenAI)
│       ├── sessions/        # Session management (store, transcript, manager)
│       └── tools/           # Agent tools
│           ├── browser/     # Browser automation
│           ├── canvas/      # Canvas operations
│           ├── cron/        # Scheduled tasks
│           ├── device/      # Device access
│           ├── terminal/    # Terminal execution
│           ├── text-to-speech/ # TTS integration
│           └── tts/         # TTS tool
│
└── interfaces/              # User interfaces
    ├── cli/                 # Command-line interface
    │   ├── commands/        # CLI commands (agents, channels, config, gateway, sessions, status)
    │   └── utils/           # CLI utilities
    └── app/                 # Native Electron app
        ├── components/      # React components
        ├── features/        # Feature modules (chat, gateway, home, onboarding)
        ├── hooks/           # React hooks
        ├── infrastructure/  # Gateway client, storage, types
        ├── services/        # Application services
        └── main/            # Electron main process
```


## How It Works

1. **Start the agent**—it runs continuously in the background
2. **Edit files** in `src/world/`, `src/agents/`, or `src/interfaces/` with any text editor
3. **Changes apply** automatically—hot-reload enabled
4. **Iterate** while the agent continues operating

### Creating Custom Agents

- The `src/agents/zuckerman/` folder contains the base agent configuration—keep it unchanged as a reference template
- Create new agents by copying `src/agents/zuckerman/` to `src/agents/[your-agent-name]/` and customize the configuration files as needed
- Each agent folder contains its own `core/`, `sessions/`, and `tools/` directories

## What You Can Customize

**World (Operating System):**
- **Communication**: Gateway (WebSocket), messengers/channels (Discord, Slack, Telegram, WhatsApp, WebChat), routing
- **Execution**: Process execution, security (auth, policy, sandbox, secrets, context)
- **Runtime**: Agent factory and management
- **Config**: Configuration loading and management
- **Voice**: Text-to-speech and speech-to-text providers
- **System**: System utilities and services

**Agents Layer:**
- Create multiple agent configurations in `src/agents/`
- Each agent has its own core modules (awareness/LLM providers, hear/STT, memory, personality, speak/TTS)
- Configure tools (browser, canvas, cron, device, terminal, TTS) per agent
- Customize session management per agent
- Define personality traits (fear, joy, motivations, traits, values) and behavior patterns per agent
- Note: Input channels (Discord, Slack, Telegram, WhatsApp, WebChat) are configured in `src/world/communication/messengers/channels/`

**Interfaces Layer:**
- CLI commands and behavior (`src/interfaces/cli/`)
- Native Electron app with React UI (`src/interfaces/app/`) - features include chat, gateway inspector, settings, onboarding

## Getting Started

1. Explore `src/world/`, `src/agents/`, and `src/interfaces/` directories
2. Read README files in each subdirectory
3. Start editing—changes take effect immediately
4. Check application logs to see changes applied

### Creating Your First Custom Agent

1. Copy `src/agents/zuckerman/` to `src/agents/[your-agent-name]/`
2. Customize the agent's `core/` (awareness, hear/STT, memory, personality, speak/TTS), `sessions/`, and `tools/` directories
3. Keep `src/agents/zuckerman/` unchanged as a reference template

Each directory contains a README explaining its purpose and how to modify it.

## License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0). See [LICENSE](LICENSE) for details.

The AGPL-3.0 license ensures that:
- Anyone can use, modify, and distribute this software
- If you use this software in a network service (SaaS), you must release your source code
- This prevents commercial use without contributing back to the community
