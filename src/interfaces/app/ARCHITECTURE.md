# Application Architecture

## Design Pattern: Service Layer + Custom Hooks Pattern

This architecture follows **Single Responsibility Principle (SRP)** and separates business logic from React state management.

---

## Core Principles

1. **Separation of Concerns**: Business logic lives in services, React hooks handle state management
2. **Single Responsibility**: Each module has one clear purpose
3. **Testability**: Services can be unit tested without React dependencies
4. **Reusability**: Services can be used outside React components
5. **Maintainability**: Easy to locate and modify specific functionality

---

## Directory Structure

```
app/
├── core/                    # Business logic services (pure TypeScript)
│   ├── gateway/
│   │   ├── client.ts                      # GatewayClient WebSocket implementation
│   │   ├── types.ts                       # Gateway types
│   │   ├── gateway-startup-service.ts     # Gateway startup orchestration
│   │   ├── gateway-client-factory.ts      # GatewayClient creation & configuration
│   │   └── gateway-event-handlers.ts      # Event handling utilities
│   ├── agent-service.ts                   # Agent operations
│   ├── gateway-service.ts                 # Gateway service wrapper
│   ├── health-service.ts                  # Health checks
│   ├── message-service.ts                 # Message operations
│   ├── session-service.ts                 # Session operations
│   └── storage/                           # Storage abstractions
│       ├── local-storage.ts               # localStorage utilities
│       └── settings-storage.ts            # Settings management
│
├── hooks/                   # React hooks for state management
│   ├── use-gateway.ts       # Gateway connection state
│   ├── use-app-state.ts     # Combined app state
│   ├── use-agents.ts        # Agent management
│   ├── use-sessions.ts      # Session management
│   └── use-messages.ts      # Message handling
│
├── features/                # Feature-based organization
│   ├── home/
│   │   ├── home-page.tsx
│   │   ├── session/
│   │   ├── settings/
│   │   └── inspector/
│   └── onboarding/
│
├── lib/                    # Pure utility functions
│   └── utils.ts           # Utility functions (cn, etc.)
│
├── types/                  # Type definitions
│   ├── app-state.ts
│   ├── message.ts
│   └── session.ts
│
├── components/             # Shared UI components
│   └── ui/                 # Base UI components
│
├── layout/                 # Layout components
│   ├── sidebar.tsx
│   ├── status-bar.tsx
│   └── title-bar.tsx
│
└── main/                   # Electron main process
    ├── gateway-manager.ts
    ├── ipc.ts
    └── ...
```

---

## Architecture Layers

### 1. **Core Layer** (`src/core/`)
**Purpose**: Pure business logic, no React dependencies

**Responsibilities**:
- Business logic orchestration
- Data transformation
- External service communication
- Complex algorithms

**Example**: `GatewayStartupService`
```typescript
export class GatewayStartupService {
  async autoStartGateway(): Promise<GatewayStartupResult>
  async checkGatewayStatus(host: string, port: number): Promise<Status>
  async startGateway(host: string, port: number): Promise<Result>
  async waitForGatewayReady(...): Promise<ReadyStatus>
}
```

**Rules**:
- ✅ Pure TypeScript classes/functions
- ✅ No React imports
- ✅ Testable in isolation
- ❌ No React hooks
- ❌ No JSX

---

### 2. **Hooks Layer** (`src/hooks/`)
**Purpose**: React state management and side effects

**Responsibilities**:
- React state management
- Connecting services to components
- Lifecycle management
- Event handling

**Example**: `useGateway`
```typescript
export function useGateway(): UseGatewayReturn {
  const [gatewayClient, setGatewayClient] = useState<GatewayClient | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  
  // Uses GatewayClientFactory to create client
  // Uses GatewayEventHandlers for event handling
  // Manages React state only
}
```

**Rules**:
- ✅ React hooks only
- ✅ State management
- ✅ Uses services from `core/`
- ✅ Uses factories from `core/`
- ❌ No business logic
- ❌ No direct API calls (use services)

---

### 3. **Core Gateway Implementation** (`src/core/gateway/client.ts`)
**Purpose**: Low-level WebSocket client implementation

**Responsibilities**:
- WebSocket connection management
- Request/response handling
- Reconnection logic

**Example**: `core/gateway/client.ts`
```typescript
export class GatewayClient {
  connect(): Promise<void>
  disconnect(): void
  request(method: string, params?: Record<string, unknown>): Promise<Response>
  isConnected(): boolean
}
```

**Rules**:
- ✅ Pure implementations
- ✅ No business logic
- ✅ Reusable across the app
- ❌ No React dependencies

---

### 4. **Storage Layer** (`src/core/storage/`)
**Purpose**: Storage abstractions and settings management

**Responsibilities**:
- Storage wrappers (localStorage)
- Settings management

**Example**: `core/storage/local-storage.ts`
```typescript
export function getStorageItem<T>(key: string, defaultValue: T): T
export function setStorageItem<T>(key: string, value: T): void
```

---

### 5. **Library Layer** (`src/lib/`)
**Purpose**: Pure utility functions

**Responsibilities**:
- Utility functions (cn, etc.)

**Example**: `lib/utils.ts`
```typescript
export function cn(...inputs: ClassValue[]): string
```

---

### 5. **Types Layer** (`types/`)
**Purpose**: Type definitions

**Responsibilities**:
- App-wide type definitions
- Domain models

**Example**: `types/message.ts`, `types/session.ts`, `types/app-state.ts`

---


### 5. **Features Layer** (`features/`)
**Purpose**: Feature-based UI organization

**Structure**:
- Each feature is self-contained
- Contains components, hooks (if feature-specific), and types
- Uses shared hooks from `hooks/`
- Uses services from `core/`

**Example**: `features/home/session/chat-view.tsx`
- Uses `useMessages` hook
- Uses `GatewayClient` from `core/gateway/`
- Uses `MessageItem` component

---

## Data Flow

```
Component
  ↓
Hook (useGateway, useAppState, etc.)
  ↓
Service (GatewayStartupService, GatewayClientFactory)
  ↓
Core Implementation (GatewayClient)
  ↓
External API / Electron IPC
```

### Example: Gateway Startup

1. **Component** (`app.tsx`):
   ```typescript
   useEffect(() => {
     const service = new GatewayStartupService(window.electronAPI);
     service.autoStartGateway();
   }, []);
   ```

2. **Service** (`core/gateway/gateway-startup-service.ts`):
   ```typescript
   async autoStartGateway() {
     const status = await this.checkGatewayStatus(host, port);
     if (!status.running) {
       await this.startGateway(host, port);
       await this.waitForGatewayReady(host, port);
     }
   }
   ```

3. **Infrastructure** (`main/gateway-manager.ts`):
   ```typescript
   await window.electronAPI.gatewayStart(host, port);
   ```

---

## Key Design Patterns

### 1. **Factory Pattern**
`GatewayClientFactory` creates and configures `GatewayClient` instances:
```typescript
GatewayClientFactory.createDefault()
GatewayClientFactory.create(options)
GatewayClientFactory.createWithStateHandlers(handlers)
```

### 2. **Service Pattern**
Services encapsulate business logic:
```typescript
class GatewayStartupService {
  // Pure business logic, no React
}
```

### 3. **Hook Pattern**
Hooks manage React state and connect to services:
```typescript
function useGateway() {
  // React state + service integration
}
```

### 4. **Event Handler Pattern**
Centralized event handling:
```typescript
GatewayEventHandlers.createStateHandlers({
  onConnect, onDisconnect, onError
})
```

---

## Benefits

1. **Testability**: Services can be tested without React
2. **Reusability**: Services work in CLI, Electron, or web
3. **Maintainability**: Clear separation makes changes easier
4. **Scalability**: Easy to add new features following the pattern
5. **Type Safety**: Strong TypeScript types throughout

---

## Migration Notes

- ✅ Removed `providers/` directory (unnecessary abstraction)
- ✅ Removed `pages/` directory (consolidated into `features/`)
- ✅ Removed `infrastructure/` directory (consolidated into `core/`, `lib/`, `types/`)
- ✅ Removed duplicate files
- ✅ Business logic moved to `core/`
- ✅ React state management in `hooks/`
- ✅ Gateway client moved to `core/gateway/` (alongside services)
- ✅ Storage utilities moved to `core/storage/`
- ✅ Types moved to root `types/`

---

## Future Considerations

- Consider adding a `context/` directory if global state management is needed (e.g., Zustand/Jotai)
- Consider adding `utils/` for pure utility functions if needed
- Keep `core/` focused on business logic only
- Keep `hooks/` focused on React state management only
