# Zuckerman Electron App

Electron-based control panel for Zuckerman agents with split-view terminal-style interface.

## Quick Start

```bash
# From project root
pnpm install
pnpm run dev
```

This will:
1. Install all dependencies (including Electron)
2. Build the main process TypeScript
3. Start Vite dev server for the renderer
4. Launch Electron app automatically

## Structure

```
app/
├── src/                  # All source code
│   ├── main/            # Electron main process
│   ├── core/            # Business logic services
│   ├── hooks/           # React hooks
│   ├── features/        # Feature components
│   ├── components/      # UI components
│   ├── lib/             # Utilities
│   └── types/           # Type definitions
├── build/               # Build configuration
├── dist/                # Build output
├── index.html           # HTML entry point
└── package.json         # Dependencies & scripts
```

## Development

### From Project Root (Recommended)

```bash
# Install dependencies
pnpm install

# Run development server
pnpm run dev
```

### From App Directory

```bash
# Navigate to app directory
cd src/interfaces/app

# Install dependencies
pnpm install

# Build main process
pnpm run build:main

# Run app
pnpm run dev
```

## Features

- **Split View Terminal Interface**: Left sidebar + main chat area
- **Real-time WebSocket Connection**: Connects to gateway at ws://127.0.0.1:18789
- **Conversation Management**: View, create, switch conversations
- **Agent Selection**: Switch between available agents
- **Terminal-Style Chat**: Monospace font, color-coded messages
- **Status Bar**: Connection status and health monitoring
- **Keyboard Shortcuts**: Cmd+N (new conversation), Cmd+K (clear), etc.

## Architecture

- **Main Process**: Creates window, handles IPC, manages app lifecycle
- **Renderer Process**: UI components, WebSocket client, state management
- **Preload Script**: Secure bridge between main and renderer
- **Gateway Client**: WebSocket client for communicating with gateway

See `ARCHITECTURE.md` for detailed architecture documentation.
