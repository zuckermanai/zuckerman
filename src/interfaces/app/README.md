# Zuckerman Electron App

Electron-based control panel for Zuckerman agents with split-view terminal-style interface.

## Structure

```
app/
├── main/              # Main process (Electron)
│   ├── index.ts      # Main window creation
│   └── preload.js    # Preload script (bridge)
├── components/        # UI components
│   ├── App.ts        # Main app component
│   ├── Sidebar.ts    # Left sidebar (sessions, agents, status)
│   ├── MainContent.ts # Chat terminal interface
│   └── StatusBar.ts  # Bottom status bar
├── styles/           # CSS styles
│   └── theme.css     # Dark theme styles
├── utils/            # Utilities
│   └── gateway-client.ts # WebSocket gateway client
├── index.html        # HTML entry point
├── index.ts         # Renderer entry point
├── package.json     # Electron app dependencies
└── tsconfig.json    # TypeScript config
```

## Setup

```bash
# Navigate to app directory
cd src/interfaces/app

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run app
npm run dev
```

## Features

- **Split View Terminal Interface**: Left sidebar + main chat area
- **Real-time WebSocket Connection**: Connects to gateway at ws://127.0.0.1:18789
- **Session Management**: View, create, switch sessions
- **Agent Selection**: Switch between available agents
- **Terminal-Style Chat**: Monospace font, color-coded messages
- **Status Bar**: Connection status and health monitoring
- **Keyboard Shortcuts**: Cmd+N (new session), Cmd+K (clear), etc.

## Development

The app uses ES modules. After building, run:

```bash
npm run dev
```

This will:
1. Compile TypeScript to `dist/`
2. Launch Electron with the compiled app

## Architecture

- **Main Process**: Creates window, handles IPC, manages app lifecycle
- **Renderer Process**: UI components, WebSocket client, state management
- **Preload Script**: Secure bridge between main and renderer
- **Gateway Client**: WebSocket client for communicating with gateway

## UX Design

See `UX_PLAN.md` for complete UX specification.
