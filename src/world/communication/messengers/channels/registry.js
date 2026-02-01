export class ChannelRegistry {
    channels = new Map();
    configs = new Map();
    register(channel, config) {
        this.channels.set(channel.id, channel);
        this.configs.set(channel.id, config);
    }
    get(id) {
        return this.channels.get(id);
    }
    list() {
        return Array.from(this.channels.values());
    }
    getConfig(id) {
        return this.configs.get(id);
    }
    async startAll() {
        for (const channel of this.channels.values()) {
            try {
                await channel.start();
            }
            catch (err) {
                console.error(`[Channels] Failed to start channel ${channel.id}:`, err);
            }
        }
    }
    async stopAll() {
        for (const channel of this.channels.values()) {
            try {
                await channel.stop();
            }
            catch (err) {
                console.error(`[Channels] Failed to stop channel ${channel.id}:`, err);
            }
        }
    }
    clear() {
        this.channels.clear();
        this.configs.clear();
    }
}
//# sourceMappingURL=registry.js.map