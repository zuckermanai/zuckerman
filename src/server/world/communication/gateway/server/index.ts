import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import type { GatewayWsClient, GatewayRequestHandlers, GatewayServer } from "./types.js";
export type { GatewayServer } from "./types.js";
import { handleConnection } from "./connection.js";
import { createCoreHandlers } from "./methods.js";
import { watchForReload, getWatchPaths } from "./reload.js";
import { initializeChannels } from "@server/world/communication/messengers/channels/factory.js";
import { loadConfig } from "@server/world/config/index.js";
import { AgentRuntimeFactory } from "@server/world/runtime/agents/index.js";
import { SimpleRouter } from "@server/world/communication/routing/index.js";
import { setCronExecutionContext } from "@server/agents/zuckerman/calendar/execution-context.js";

export interface GatewayServerOptions {
  port?: number;
  host?: string;
}

export async function startGatewayServer(
  options: GatewayServerOptions = {},
): Promise<GatewayServer> {
  const port = options.port ?? 18789;
  const host = options.host ?? "127.0.0.1";

  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });

  const clients = new Set<GatewayWsClient>();
  
  // Function to broadcast events to all connected clients
  const broadcastEvent = (event: { type: "event"; event: string; payload?: unknown }) => {
    clients.forEach((client) => {
      try {
        client.socket.send(JSON.stringify(event));
      } catch (err) {
        console.error(`[Gateway] Failed to broadcast event to client ${client.id}:`, err);
      }
    });
  };
  
  // Load config and set API keys as environment variables for providers
  const config = await loadConfig();
  if (config.llm?.anthropic?.apiKey) {
    process.env.ANTHROPIC_API_KEY = config.llm.anthropic.apiKey;
  }
  if (config.llm?.openai?.apiKey) {
    process.env.OPENAI_API_KEY = config.llm.openai.apiKey;
  }
  if (config.llm?.openrouter?.apiKey) {
    process.env.OPENROUTER_API_KEY = config.llm.openrouter.apiKey;
  }
  
  // Initialize channels
  
  // Create agent factory (uses registry, no path detection needed)
  const agentFactory = new AgentRuntimeFactory();
  
  // Router will get conversation managers from factory per agent
  const router = new SimpleRouter(agentFactory);
  
  // Initialize channels (no longer needs ConversationManager)
  const channelRegistry = await initializeChannels(
    config,
    router,
    agentFactory,
    broadcastEvent,
  );
  
  // Set execution context for cron tool
  setCronExecutionContext({
    agentFactory,
    channelRegistry,
  });
  
  // Start enabled channels in background (non-blocking)
  console.log(`[Gateway] Starting channels in background...`);
  channelRegistry.startAll().catch((err) => {
    console.error(`[Gateway] Channel startup error:`, err);
  });

  const handlers = createCoreHandlers({
    agentFactory,
    router,
    channelRegistry,
    broadcastEvent,
  });

  // Track connections (logging is handled in handleConnection)
  const onConnect = (client: GatewayWsClient) => {
    // Can add additional logic here if needed
  };

  const onDisconnect = (client: GatewayWsClient) => {
    // Can add additional logic here if needed
  };

  wss.on("connection", (socket) => {
    handleConnection(socket, clients, handlers, onConnect, onDisconnect);
  });

  // Setup hot reload watcher
  const watchPaths = getWatchPaths();
  const reloadWatcher = watchForReload(watchPaths, (path) => {
    // Clear agent runtime cache to force reload on next use
    // If it's an agent-related file, clear specific agent cache
    if (path.includes("/agents/")) {
      const agentMatch = path.match(/\/agents\/([^\/]+)\//);
      if (agentMatch) {
        const agentId = agentMatch[1];
        agentFactory.clearCache(agentId);
      } else {
        // If we can't determine which agent, clear all
        agentFactory.clearCache();
      }
    } else {
      // For other server files, clear all agent caches to be safe
      agentFactory.clearCache();
    }
    
    // Broadcast reload event to all clients
    const event = {
      type: "event" as const,
      event: "reload",
      payload: { path, ts: Date.now() },
    };
    clients.forEach((client) => {
      try {
        client.socket.send(JSON.stringify(event));
      } catch (err) {
        console.error(`[Reload] Failed to notify client ${client.id}:`, err);
      }
    });
  });

  return new Promise((resolve, reject) => {
    // Set up error handler BEFORE calling listen() to catch EADDRINUSE errors
    httpServer.on("error", (err) => {
      reject(err);
    });

    httpServer.listen(port, host, () => {
      console.log(`[Gateway] Server listening on ws://${host}:${port}`);
      resolve({
        close: async (reason?: string) => {
          console.log(`[Gateway] Closing server${reason ? `: ${reason}` : ""}`);
          
          // Stop channels and watcher first
          await channelRegistry.stopAll();
          await reloadWatcher.stop();
          
          // Forcefully close all WebSocket connections
          const closePromises: Promise<void>[] = [];
          clients.forEach((client) => {
            try {
              if (client.socket.readyState === 1) { // OPEN
                const closePromise = new Promise<void>((resolve) => {
                  client.socket.once("close", () => resolve());
                  client.socket.close(1001, reason || "Server shutting down");
                  // Timeout after 1 second
                  setTimeout(() => resolve(), 1000);
                });
                closePromises.push(closePromise);
              }
            } catch (err) {
              // Ignore errors closing individual connections
            }
          });
          clients.clear();
          
          // Wait for all connections to close (with timeout)
          await Promise.race([
            Promise.all(closePromises),
            new Promise((resolve) => setTimeout(resolve, 2000)),
          ]);
          
          // Close WebSocket server
          await new Promise<void>((resolve) => {
            wss.close(() => resolve());
            // Timeout after 1 second
            setTimeout(() => resolve(), 1000);
          });
          
          // Close HTTP server
          await new Promise<void>((resolve) => {
            httpServer.close(() => {
              console.log(`[Gateway] Server closed`);
              resolve();
            });
            // Timeout after 2 seconds
            setTimeout(() => resolve(), 2000);
          });
        },
        port,
      });
    });
  });
}
