import { Client, GatewayIntentBits, Events, TextChannel, DMChannel } from "discord.js";
export class DiscordChannel {
    id = "discord";
    type = "discord";
    client = null;
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
            console.log("[Discord] Channel is disabled in config");
            return;
        }
        if (!this.config.token) {
            console.error("[Discord] Bot token is required");
            return;
        }
        try {
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.DirectMessages,
                ],
            });
            // Handle ready event
            this.client.once(Events.ClientReady, () => {
                console.log(`[Discord] Bot logged in as ${this.client.user.tag}`);
                this.isRunning = true;
            });
            // Handle incoming messages
            this.client.on(Events.MessageCreate, async (message) => {
                await this.handleIncomingMessage(message);
            });
            // Login
            await this.client.login(this.config.token);
        }
        catch (error) {
            console.error("[Discord] Failed to start:", error);
            throw error;
        }
    }
    async stop() {
        if (this.client) {
            await this.client.destroy();
            this.client = null;
        }
        this.isRunning = false;
    }
    async send(message, to) {
        if (!this.client || !this.isRunning) {
            throw new Error("Discord channel is not connected");
        }
        try {
            // Parse channel ID (could be channel ID or user ID for DMs)
            const channel = await this.client.channels.fetch(to);
            if (channel && (channel instanceof TextChannel || channel instanceof DMChannel)) {
                await channel.send(message);
            }
            else {
                throw new Error(`Channel ${to} not found or not a text channel`);
            }
        }
        catch (error) {
            console.error(`[Discord] Failed to send message to ${to}:`, error);
            throw error;
        }
    }
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }
    async handleIncomingMessage(message) {
        // Ignore bot messages
        if (message.author.bot) {
            return;
        }
        // Ignore messages without content
        if (!message.content) {
            return;
        }
        const channel = message.channel;
        const isDM = channel instanceof DMChannel;
        const isGroup = channel instanceof TextChannel;
        // Check DM policy
        if (isDM && this.config.dm) {
            if (!this.config.dm.enabled) {
                return;
            }
            if (this.config.dm.policy === "allowlist" && this.config.dm.allowFrom) {
                const userId = message.author.id;
                const isAllowed = this.config.dm.allowFrom.includes("*") ||
                    this.config.dm.allowFrom.includes(userId);
                if (!isAllowed) {
                    console.log(`[Discord] Message from ${userId} blocked (not in allowlist)`);
                    return;
                }
            }
        }
        // Check guild/channel allowlist for group messages
        if (isGroup && message.guild) {
            const guildId = message.guild.id;
            const channelId = channel.id;
            const guildConfig = this.config.guilds?.[guildId];
            if (guildConfig) {
                const channelConfig = guildConfig.channels?.[channelId];
                if (channelConfig?.allow === false) {
                    console.log(`[Discord] Message from channel ${channelId} blocked`);
                    return;
                }
                // Check mention requirement
                if (guildConfig.requireMention || channelConfig?.requireMention) {
                    if (!message.mentions.has(this.client.user.id)) {
                        // Store for context but don't trigger reply
                        return;
                    }
                }
            }
        }
        const channelMessage = {
            id: message.id,
            channelId: this.id,
            from: channel.id,
            content: message.content,
            timestamp: message.createdTimestamp,
            metadata: {
                peerId: channel.id,
                peerKind: isDM ? "dm" : "channel",
                messageId: message.id,
                isGroup,
                fromId: message.author.id,
                fromUsername: message.author.username,
                guildId: message.guild?.id,
                guildName: message.guild?.name,
                channelName: isGroup ? channel.name : undefined,
            },
        };
        // Notify all handlers
        for (const handler of this.messageHandlers) {
            try {
                handler(channelMessage);
            }
            catch (error) {
                console.error("[Discord] Error in message handler:", error);
            }
        }
    }
    isConnected() {
        return this.isRunning && this.client !== null;
    }
}
//# sourceMappingURL=discord.js.map