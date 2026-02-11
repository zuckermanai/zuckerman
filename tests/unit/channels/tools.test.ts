import { describe, it, expect, beforeEach, vi } from "vitest";
import { telegramTool, discordTool, signalTool, setChannelRegistry, getChannelRegistry } from "@server/agents/zuckerman/tools/channels/index.js";
import { ChannelRegistry } from "@server/world/communication/messengers/channels/registry.js";
import { TelegramChannel } from "@server/world/communication/messengers/channels/telegram.js";
import { DiscordChannel } from "@server/world/communication/messengers/channels/discord.js";
import { SignalChannel } from "@server/world/communication/messengers/channels/signal.js";
import type { TelegramConfig, DiscordConfig, SignalConfig } from "@server/world/config/types.js";

// Mock conversation store
vi.mock("@server/agents/zuckerman/conversations/store.js", () => ({
  loadConversationStore: vi.fn().mockReturnValue({
    "conversation-key": {
      conversationId: "test-conversation-id",
      lastChannel: "telegram",
      lastTo: "123456789",
      deliveryContext: {
        channel: "telegram",
        to: "123456789",
        accountId: "default",
      },
      origin: {
        channel: "telegram",
        accountId: "default",
      },
    },
  }),
  resolveConversationStorePath: vi.fn().mockReturnValue("/test/path"),
}));

describe("Channel Tools", () => {
  let registry: ChannelRegistry;
  let telegramChannel: TelegramChannel;
  let discordChannel: DiscordChannel;
  let signalChannel: SignalChannel;

  beforeEach(() => {
    registry = new ChannelRegistry();
    
    const telegramConfig: TelegramConfig = { enabled: true, botToken: "test-token" };
    const discordConfig: DiscordConfig = { enabled: true, token: "test-token" };
    const signalConfig: SignalConfig = { enabled: true };

    telegramChannel = new TelegramChannel(telegramConfig);
    discordChannel = new DiscordChannel(discordConfig);
    signalChannel = new SignalChannel(signalConfig);

    // Mock isConnected
    vi.spyOn(telegramChannel, "isConnected").mockReturnValue(true);
    vi.spyOn(discordChannel, "isConnected").mockReturnValue(true);
    vi.spyOn(signalChannel, "isConnected").mockReturnValue(true);

    // Mock send methods
    vi.spyOn(telegramChannel, "send").mockResolvedValue(undefined);
    vi.spyOn(discordChannel, "send").mockResolvedValue(undefined);
    vi.spyOn(signalChannel, "send").mockResolvedValue(undefined);

    registry.register(telegramChannel, {
      id: "telegram",
      type: "telegram",
      enabled: true,
      config: telegramConfig as Record<string, unknown>,
    });

    registry.register(discordChannel, {
      id: "discord",
      type: "discord",
      enabled: true,
      config: discordConfig as Record<string, unknown>,
    });

    registry.register(signalChannel, {
      id: "signal",
      type: "signal",
      enabled: true,
      config: signalConfig as Record<string, unknown>,
    });

    setChannelRegistry(registry);
  });

  describe("Telegram Tool", () => {
    it("should have correct definition", () => {
      const tool = createTelegramTool();
      
      expect(tool.definition.name).toBe("telegram");
      expect(tool.definition.description).toContain("Telegram");
      expect(tool.definition.parameters.properties).toHaveProperty("message");
      expect(tool.definition.parameters.properties).toHaveProperty("to");
      expect(tool.definition.parameters.required).toContain("message");
    });

    it("should send message with provided chat ID", async () => {
      const tool = createTelegramTool();
      const securityContext = {
        agentId: "test-agent",
        toolPolicy: { allowed: ["telegram"] },
      };
      const executionContext = { conversationId: "test-conversation-id" };

      const result = await tool.handler(
        { message: "Hello", to: "987654321" },
        securityContext,
        executionContext
      );

      expect(result.success).toBe(true);
      expect(telegramChannel.send).toHaveBeenCalledWith("Hello", "987654321");
    });

    it("should auto-detect chat ID from conversation", async () => {
      const tool = createTelegramTool();
      const securityContext = {
        agentId: "test-agent",
        toolPolicy: { allowed: ["telegram"] },
      };
      const executionContext = { conversationId: "test-conversation-id" };

      const result = await tool.handler(
        { message: "Hello", to: "me" },
        securityContext,
        executionContext
      );

      expect(result.success).toBe(true);
      expect(telegramChannel.send).toHaveBeenCalledWith("Hello", "123456789");
    });

    it("should return error if channel not configured", async () => {
      setChannelRegistry(new ChannelRegistry());
      const tool = createTelegramTool();
      const securityContext = {
        agentId: "test-agent",
        toolPolicy: { allowed: ["telegram"] },
      };

      const result = await tool.handler(
        { message: "Hello", to: "123456789" },
        securityContext,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    });

    it("should return error if channel not connected", async () => {
      vi.spyOn(telegramChannel, "isConnected").mockReturnValue(false);
      const tool = createTelegramTool();
      const securityContext = {
        agentId: "test-agent",
        toolPolicy: { allowed: ["telegram"] },
      };

      const result = await tool.handler(
        { message: "Hello", to: "123456789" },
        securityContext,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not connected");
    });

    it("should return error if tool not allowed", async () => {
      const tool = createTelegramTool();
      const securityContext = {
        agentId: "test-agent",
        toolPolicy: { 
          profile: "minimal", // Minimal profile doesn't include telegram
          allow: ["terminal"], // Explicitly allow only terminal
        },
      };

      const result = await tool.handler(
        { message: "Hello", to: "123456789" },
        securityContext,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not allowed");
    });
  });

  describe("Discord Tool", () => {
    it("should have correct definition", () => {
      const tool = createDiscordTool();
      
      expect(tool.definition.name).toBe("discord");
      expect(tool.definition.description).toContain("Discord");
      expect(tool.definition.parameters.properties).toHaveProperty("message");
      expect(tool.definition.parameters.properties).toHaveProperty("to");
    });

    it("should send message with provided channel ID", async () => {
      const tool = createDiscordTool();
      const securityContext = {
        agentId: "test-agent",
        toolPolicy: { allowed: ["discord"] },
      };
      const executionContext = { conversationId: "test-conversation-id" };

      const result = await tool.handler(
        { message: "Hello", to: "987654321" },
        securityContext,
        executionContext
      );

      expect(result.success).toBe(true);
      expect(discordChannel.send).toHaveBeenCalledWith("Hello", "987654321");
    });

    it("should return error if channel not configured", async () => {
      setChannelRegistry(new ChannelRegistry());
      const tool = createDiscordTool();
      const securityContext = {
        agentId: "test-agent",
        toolPolicy: { allowed: ["discord"] },
      };

      const result = await tool.handler(
        { message: "Hello", to: "123456789" },
        securityContext,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    });
  });

  describe("Signal Tool", () => {
    it("should have correct definition", () => {
      const tool = createSignalTool();
      
      expect(tool.definition.name).toBe("signal");
      expect(tool.definition.description).toContain("Signal");
      expect(tool.definition.parameters.properties).toHaveProperty("message");
      expect(tool.definition.parameters.properties).toHaveProperty("to");
    });

    it("should send message with provided phone number", async () => {
      const tool = createSignalTool();
      const securityContext = {
        agentId: "test-agent",
        toolPolicy: { allowed: ["signal"] },
      };
      const executionContext = { conversationId: "test-conversation-id" };

      const result = await tool.handler(
        { message: "Hello", to: "+1234567890" },
        securityContext,
        executionContext
      );

      expect(result.success).toBe(true);
      expect(signalChannel.send).toHaveBeenCalledWith("Hello", "+1234567890");
    });

    it("should return error if channel not configured", async () => {
      setChannelRegistry(new ChannelRegistry());
      const tool = createSignalTool();
      const securityContext = {
        agentId: "test-agent",
        toolPolicy: { allowed: ["signal"] },
      };

      const result = await tool.handler(
        { message: "Hello", to: "+1234567890" },
        securityContext,
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not configured");
    });
  });
});
