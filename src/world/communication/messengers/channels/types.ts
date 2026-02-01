export type ChannelId = string;
export type ChannelType = "whatsapp" | "telegram" | "slack" | "discord" | "signal" | "imessage" | "webchat";

export interface ChannelConfig {
  id: ChannelId;
  type: ChannelType;
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface ChannelMessage {
  id: string;
  channelId: ChannelId;
  from: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Channel {
  id: ChannelId;
  type: ChannelType;
  send(message: string, to: string): Promise<void>;
  onMessage(handler: (message: ChannelMessage) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
