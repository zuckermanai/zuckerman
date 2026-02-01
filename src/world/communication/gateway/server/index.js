import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { handleConnection } from "./connection.js";
import { createCoreHandlers } from "./methods.js";
import { watchForReload, getWatchPaths } from "./reload.js";
import { initializeChannels } from "@world/communication/messengers/channels/factory.js";
import { loadConfig } from "@world/config/index.js";
import { AgentRuntimeFactory } from "@world/runtime/agents/index.js";
import { SimpleRouter } from "@world/communication/routing/index.js";
export async function startGatewayServer(options = {}) {
    const port = options.port ?? 18789;
    const host = options.host ?? "127.0.0.1";
    const httpServer = createServer();
    const wss = new WebSocketServer({ server: httpServer });
    const clients = new Set();
    // Function to broadcast events to all connected clients
    const broadcastEvent = (event) => {
        clients.forEach((client) => {
            try {
                client.socket.send(JSON.stringify(event));
            }
            catch (err) {
                console.error(`[Gateway] Failed to broadcast event to client ${client.id}:`, err);
            }
        });
    };
    // Initialize channels
    const config = await loadConfig();
    const agentFactory = new AgentRuntimeFactory();
    // Router will get session managers from factory per agent
    const router = new SimpleRouter(agentFactory);
    // Get default session manager for channel initialization and handlers
    const defaultAgentId = config.agents?.list?.find((a) => a.default)?.id || config.agents?.list?.[0]?.id || "zuckerman";
    const defaultSessionManager = agentFactory.getSessionManager(defaultAgentId);
    const channelRegistry = await initializeChannels(config, router, defaultSessionManager, agentFactory, broadcastEvent);
    // Start enabled channels
    await channelRegistry.startAll();
    const handlers = createCoreHandlers({
        sessionManager: defaultSessionManager,
        agentFactory,
        router,
        channelRegistry,
    });
    // Track connections (logging is handled in handleConnection)
    const onConnect = (client) => {
        // Can add additional logic here if needed
    };
    const onDisconnect = (client) => {
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
            type: "event",
            event: "reload",
            payload: { path, ts: Date.now() },
        };
        clients.forEach((client) => {
            try {
                client.socket.send(JSON.stringify(event));
            }
            catch (err) {
                console.error(`[Reload] Failed to notify client ${client.id}:`, err);
            }
        });
    });
    return new Promise((resolve, reject) => {
        httpServer.listen(port, host, () => {
            console.log(`[Gateway] Server listening on ws://${host}:${port}`);
            resolve({
                close: async (reason) => {
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
            reject(err);
        });
    });
}
//# sourceMappingURL=index.js.map