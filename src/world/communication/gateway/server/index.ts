import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import type { GatewayWsClient, GatewayRequestHandlers, GatewayServer } from "./types.js";
export type { GatewayServer } from "./types.js";
import { handleConnection } from "./connection.js";
import { createCoreHandlers } from "./methods.js";
import { watchForReload, getWatchPaths } from "./reload.js";
import { initializeChannels } from "@world/communication/messengers/channels/factory.js";
import { loadConfig } from "@world/config/index.js";
import { SessionManager } from "@agents/zuckerman/sessions/index.js";
import { AgentRuntimeFactory } from "@world/runtime/agents/index.js";
import { SimpleRouter } from "@world/communication/routing/index.js";
import { appendFileSync } from "node:fs";

export interface GatewayServerOptions {
  port?: number;
  host?: string;
}

export async function startGatewayServer(
  options: GatewayServerOptions = {},
): Promise<GatewayServer> {
  // #region agent log
  try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway/server/index.ts:19',message:'startGatewayServer called',data:{port:options.port,host:options.host},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})+'\n');}catch(e){}
  // #endregion
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
  
  // Initialize channels
  // #region agent log
  try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway/server/index.ts:42',message:'Loading config',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})+'\n');}catch(e){}
  // #endregion
  const config = await loadConfig();
  // #region agent log
  try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway/server/index.ts:44',message:'Config loaded, initializing channels',data:{agentsCount:config.agents?.list?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})+'\n');}catch(e){}
  // #endregion
  const agentFactory = new AgentRuntimeFactory();
  // Router will get session managers from factory per agent
  const router = new SimpleRouter(agentFactory);
  
  // Get default session manager for channel initialization and handlers
  const defaultAgentId = config.agents?.list?.find((a) => a.default)?.id || config.agents?.list?.[0]?.id || "zuckerman";
  const defaultSessionManager = agentFactory.getSessionManager(defaultAgentId);
  
  const channelRegistry = await initializeChannels(
    config,
    router,
    defaultSessionManager,
    agentFactory,
    broadcastEvent,
  );
  
  // Start enabled channels
  // #region agent log
  try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway/server/index.ts:60',message:'Starting channels',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})+'\n');}catch(e){}
  // #endregion
  await channelRegistry.startAll();
  // #region agent log
  try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway/server/index.ts:60',message:'Channels started, setting up HTTP server',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})+'\n');}catch(e){}
  // #endregion

  const handlers = createCoreHandlers({
    sessionManager: defaultSessionManager,
    agentFactory,
    router,
    channelRegistry,
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
    console.log(`[Reload] Detected change in ${path}, reloading...`);
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
    // #region agent log
    try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway/server/index.ts:101',message:'Calling httpServer.listen',data:{host,port},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})+'\n');}catch(e){}
    // #endregion
    httpServer.listen(port, host, () => {
      // #region agent log
      try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway/server/index.ts:102',message:'HTTP server listening callback',data:{host,port},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})+'\n');}catch(e){}
      // #endregion
      console.log(`[Gateway] Server listening on ws://${host}:${port}`);
      resolve({
        close: async (reason?: string) => {
          console.log(`[Gateway] Closing server${reason ? `: ${reason}` : ""}`);
          await channelRegistry.stopAll();
          await reloadWatcher.stop();
          wss.close();
          httpServer.close();
        },
        port,
      });
    });

    httpServer.on("error", (err) => {
      // #region agent log
      try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway/server/index.ts:116',message:'HTTP server error',data:{error:err.message,code:(err as NodeJS.ErrnoException).code},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H'})+'\n');}catch(e){console.error('[DEBUG] Failed to write log:',e);}
      // #endregion
      reject(err);
    });
  });
}
