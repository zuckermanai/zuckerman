import { Bot } from "grammy";
export class TelegramChannel {
    id = "telegram";
    type = "telegram";
    bot = null;
    config;
    messageHandlers = [];
    isRunning = false;
    constructor(config) {
        this.config = config;
    }
    async start() {
        if (this.isRunning) {
            return;
        }
        if (!this.config.enabled) {
            console.log("[Telegram] Channel is disabled in config");
            return;
        }
        if (!this.config.botToken) {
            console.error("[Telegram] Bot token is required");
            return;
        }
        try {
            this.bot = new Bot(this.config.botToken);
            // Handle incoming messages
            this.bot.on("message:text", async (ctx) => {
                await this.handleIncomingMessage(ctx);
            });
            // Handle edited messages
            this.bot.on("edited_message:text", async (ctx) => {
                await this.handleIncomingMessage(ctx);
            });
            // Start bot
            await this.bot.start();
            this.isRunning = true;
            console.log("[Telegram] Bot started successfully");
        }
        catch (error) {
            console.error("[Telegram] Failed to start:", error);
            throw error;
        }
    }
    async stop() {
        if (this.bot) {
            await this.bot.stop();
            this.bot = null;
        }
        this.isRunning = false;
    }
    async send(message, to) {
        if (!this.bot || !this.isRunning) {
            throw new Error("Telegram channel is not connected");
        }
        try {
            await this.bot.api.sendMessage(Number(to), message);
        }
        catch (error) {
            console.error(`[Telegram] Failed to send message to ${to}:`, error);
            throw error;
        }
    }
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }
    async handleIncomingMessage(ctx) {
        const message = ctx.message;
        if (!message || !message.text) {
            return;
        }
        const chat = message.chat;
        const fromId = message.from?.id.toString() || "";
        const chatId = chat.id.toString();
        const isGroup = chat.type === "group" || chat.type === "supergroup";
        // Check allowlist for DMs
        if (!isGroup && this.config.dmPolicy === "allowlist" && this.config.allowFrom) {
            const isAllowed = this.config.allowFrom.includes("*") ||
                this.config.allowFrom.includes(fromId);
            if (!isAllowed) {
                console.log(`[Telegram] Message from ${fromId} blocked (not in allowlist)`);
                return;
            }
        }
        // Check group policy
        if (isGroup && this.config.groupPolicy === "allowlist") {
            // For groups, check if group is in allowlist (if groups config exists)
            const groupConfig = this.config.groups?.[chatId];
            if (!groupConfig && !this.config.groups?.["*"]) {
                console.log(`[Telegram] Message from group ${chatId} blocked (not in allowlist)`);
                return;
            }
        }
        // Check mention requirement for groups
        if (isGroup && message.text) {
            const groupConfig = this.config.groups?.[chatId] || this.config.groups?.["*"];
            if (groupConfig?.requireMention) {
                // Check if bot was mentioned
                const botInfo = await this.bot.api.getMe();
                const mentioned = message.entities?.some((entity) => entity.type === "mention" &&
                    message.text.substring(entity.offset, entity.offset + entity.length) === `@${botInfo.username}`) || message.text.includes(`@${botInfo.username}`);
                if (!mentioned) {
                    // Store for context but don't trigger reply
                    return;
                }
            }
        }
        const channelMessage = {
            id: message.message_id.toString(),
            channelId: this.id,
            from: chatId,
            content: message.text,
            timestamp: message.date * 1000,
            metadata: {
                peerId: chatId,
                peerKind: isGroup ? "group" : "dm",
                messageId: message.message_id,
                isGroup,
                fromId,
                fromUsername: message.from?.username,
                chatTitle: isGroup ? chat.title : undefined,
            },
        };
        // Notify all handlers
        for (const handler of this.messageHandlers) {
            try {
                handler(channelMessage);
            }
            catch (error) {
                console.error("[Telegram] Error in message handler:", error);
            }
        }
    }
    isConnected() {
        return this.isRunning && this.bot !== null;
    }
}
//# sourceMappingURL=telegram.js.map