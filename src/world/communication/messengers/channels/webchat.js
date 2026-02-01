export class WebChatChannel {
    id = "webchat";
    type = "webchat";
    config;
    messageHandlers = [];
    isRunning = false;
    clients = new Map();
    constructor(config = {}) {
        this.config = config;
    }
    async start() {
        if (this.isRunning) {
            return;
        }
        if (!this.config.enabled) {
            console.log("[WebChat] Channel is disabled in config");
            return;
        }
        // WebChat doesn't need a separate server - it uses the Gateway WebSocket
        // This channel just handles message routing
        this.isRunning = true;
        console.log("[WebChat] Channel ready (uses Gateway WebSocket)");
    }
    async stop() {
        // Close all client connections
        for (const [clientId, client] of this.clients.entries()) {
            try {
                client.close();
            }
            catch (error) {
                console.error(`[WebChat] Error closing client ${clientId}:`, error);
            }
        }
        this.clients.clear();
        this.isRunning = false;
    }
    async send(message, to) {
        // Find client by ID (to is the client/session ID)
        const client = this.clients.get(to);
        if (!client || client.readyState !== 1) { // 1 = OPEN
            throw new Error(`WebChat client ${to} not found or not connected`);
        }
        try {
            client.send(JSON.stringify({
                type: "message",
                content: message,
                timestamp: Date.now(),
            }));
        }
        catch (error) {
            console.error(`[WebChat] Failed to send message to ${to}:`, error);
            throw error;
        }
    }
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }
    /**
     * Register a WebSocket client for WebChat
     */
    registerClient(clientId, socket) {
        this.clients.set(clientId, socket);
        socket.on("message", (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === "chat" && message.content) {
                    const channelMessage = {
                        id: `${clientId}-${Date.now()}`,
                        channelId: this.id,
                        from: clientId,
                        content: message.content,
                        timestamp: message.timestamp || Date.now(),
                        metadata: {
                            peerId: clientId,
                            peerKind: "dm",
                            messageId: message.id,
                            isGroup: false,
                        },
                    };
                    // Notify all handlers
                    for (const handler of this.messageHandlers) {
                        try {
                            handler(channelMessage);
                        }
                        catch (error) {
                            console.error("[WebChat] Error in message handler:", error);
                        }
                    }
                }
            }
            catch (error) {
                console.error("[WebChat] Error parsing message:", error);
            }
        });
        socket.on("close", () => {
            this.clients.delete(clientId);
        });
    }
    /**
     * Unregister a WebSocket client
     */
    unregisterClient(clientId) {
        this.clients.delete(clientId);
    }
    isConnected() {
        return this.isRunning;
    }
}
//# sourceMappingURL=webchat.js.map