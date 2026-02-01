import type { Channel, ChannelId, ChannelConfig } from "./types.js";

export class ChannelRegistry {
  private channels = new Map<ChannelId, Channel>();
  private configs = new Map<ChannelId, ChannelConfig>();

  register(channel: Channel, config: ChannelConfig): void {
    this.channels.set(channel.id, channel);
    this.configs.set(channel.id, config);
  }

  get(id: ChannelId): Channel | undefined {
    return this.channels.get(id);
  }

  list(): Channel[] {
    return Array.from(this.channels.values());
  }

  getConfig(id: ChannelId): ChannelConfig | undefined {
    return this.configs.get(id);
  }

  async startAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.start();
      } catch (err) {
        console.error(`[Channels] Failed to start channel ${channel.id}:`, err);
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.stop();
      } catch (err) {
        console.error(`[Channels] Failed to stop channel ${channel.id}:`, err);
      }
    }
  }

  clear(): void {
    this.channels.clear();
    this.configs.clear();
  }
}
