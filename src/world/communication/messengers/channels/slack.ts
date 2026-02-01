import { App, LogLevel } from "@slack/bolt";
import type { Channel, ChannelMessage } from "./types.js";
import type { SlackConfig } from "@world/config/types.js";

export class SlackChannel implements Channel {
  id: string = "slack";
  type = "slack" as const;
  private app: App | null = null;
  private config: SlackConfig;
  private messageHandlers: Array<(message: ChannelMessage) => void> = [];
  private isRunning = false;

  constructor(config: SlackConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    if (!this.config.enabled) {
      console.log("[Slack] Channel is disabled in config");
      return;
    }

    if (!this.config.botToken || !this.config.appToken) {
      console.error("[Slack] Bot token and app token are required");
      return;
    }

    try {
      this.app = new App({
        token: this.config.botToken,
        appToken: this.config.appToken,
        socketMode: true,
        logLevel: LogLevel.INFO,
      });

      // Handle incoming messages
      this.app.message(async ({ message, client, event }) => {
        await this.handleIncomingMessage(message, event, client);
      });

      // Start app
      await this.app.start();
      this.isRunning = true;
      console.log("[Slack] Bot started successfully");
    } catch (error) {
      console.error("[Slack] Failed to start:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      this.app = null;
    }
    this.isRunning = false;
  }

  async send(message: string, to: string): Promise<void> {
    if (!this.app || !this.isRunning) {
      throw new Error("Slack channel is not connected");
    }

    try {
      await this.app.client.chat.postMessage({
        channel: to,
        text: message,
      });
    } catch (error) {
      console.error(`[Slack] Failed to send message to ${to}:`, error);
      throw error;
    }
  }

  onMessage(handler: (message: ChannelMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  private async handleIncomingMessage(
    message: any,
    event: any,
    client: any,
  ): Promise<void> {
    // Ignore bot messages
    if (message.subtype === "bot_message") {
      return;
    }

    // Ignore messages without text
    if (!message.text) {
      return;
    }

    const channelId = message.channel;
    const userId = message.user;
    const isDM = event.channel_type === "im";

    // Check DM policy
    if (isDM && this.config.dm) {
      if (!this.config.dm.enabled) {
        return;
      }

      if (this.config.dm.allowFrom) {
        const isAllowed = this.config.dm.allowFrom.includes("*") || 
                         this.config.dm.allowFrom.includes(userId);
        
        if (!isAllowed) {
          console.log(`[Slack] Message from ${userId} blocked (not in allowlist)`);
          return;
        }
      }
    }

    // Check channel allowlist for group messages
    if (!isDM) {
      const channelConfig = this.config.channels?.[channelId];
      if (channelConfig?.allow === false) {
        console.log(`[Slack] Message from channel ${channelId} blocked`);
        return;
      }

      // Check mention requirement
      if (channelConfig?.requireMention) {
        // Get bot user ID
        const botInfo = await client.auth.test();
        const botUserId = botInfo.user_id;
        
        // Check if bot was mentioned
        const mentioned = message.text.includes(`<@${botUserId}>`);
        if (!mentioned) {
          // Store for context but don't trigger reply
          return;
        }
      }
    }

    // Get channel info for metadata
    let channelName: string | undefined;
    let channelType: string | undefined;
    try {
      const channelInfo = await client.conversations.info({ channel: channelId });
      channelName = channelInfo.channel?.name;
      channelType = channelInfo.channel?.is_private ? "private" : "public";
    } catch (error) {
      // Ignore errors fetching channel info
    }

    const channelMessage: ChannelMessage = {
      id: message.ts,
      channelId: this.id,
      from: channelId,
      content: message.text,
      timestamp: parseFloat(message.ts) * 1000,
      metadata: {
        peerId: channelId,
        peerKind: isDM ? "dm" : "channel",
        messageId: message.ts,
        isGroup: !isDM,
        fromId: userId,
        channelName,
        channelType,
      },
    };

    // Notify all handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(channelMessage);
      } catch (error) {
        console.error("[Slack] Error in message handler:", error);
      }
    }
  }

  isConnected(): boolean {
    return this.isRunning && this.app !== null;
  }
}
