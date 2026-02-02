import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, AlertCircle, QrCode, MessageSquare, Power, X, Plus, Shield } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { GatewayClient } from "../../../../core/gateway/client";
import { useWhatsAppChannel } from "../../../../hooks/channels/use-whatsapp-channel";
import { useTelegramChannel } from "../../../../hooks/channels/use-telegram-channel";
import { useDiscordChannel } from "../../../../hooks/channels/use-discord-channel";
import { useSignalChannel } from "../../../../hooks/channels/use-signal-channel";

type ChannelId = "whatsapp" | "telegram" | "discord" | "slack" | "signal" | "imessage";

interface ChannelStatus {
  id: string;
  type: string;
  connected: boolean;
}

interface ChannelState {
  qrCode: string | null;
  connecting: boolean;
  error: string | null;
}

interface ChannelsViewProps {
  gatewayClient: GatewayClient | null;
}

const CHANNEL_INFO: Record<ChannelId, { name: string; description: string; icon: React.ReactNode }> = {
  whatsapp: {
    name: "WhatsApp",
    description: "Standard mobile messaging. Requires QR pairing.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  telegram: {
    name: "Telegram",
    description: "Fast and bot-friendly. Setup requires bot token.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  discord: {
    name: "Discord",
    description: "Great for community chats. Setup requires bot token.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  slack: {
    name: "Slack",
    description: "Team collaboration. Setup requires bot token.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  signal: {
    name: "Signal",
    description: "Privacy-focused messaging. Coming soon.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  imessage: {
    name: "iMessage",
    description: "Apple Messages integration. Coming soon.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
};

interface WhatsAppConfig {
  dmPolicy?: "open" | "pairing" | "allowlist";
  allowFrom?: string[];
}

export function ChannelsView({ gatewayClient }: ChannelsViewProps) {
  const [channels, setChannels] = useState<ChannelStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [channelStates, setChannelStates] = useState<Record<string, ChannelState>>({});
  const [selectedChannel, setSelectedChannel] = useState<ChannelId | null>(null);
  const [newPhoneNumber, setNewPhoneNumber] = useState("");
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [discordBotToken, setDiscordBotToken] = useState("");

  // Use hooks for WhatsApp, Telegram, Discord, and Signal
  const whatsapp = useWhatsAppChannel(gatewayClient, { enabled: true });
  const telegram = useTelegramChannel(gatewayClient, { enabled: true });
  const discord = useDiscordChannel(gatewayClient, { enabled: true });
  const signal = useSignalChannel(gatewayClient, { enabled: true });
  
  // Refs for managing timers (for channels without hooks)
  const qrTimeoutRefs = React.useRef<Record<string, NodeJS.Timeout | null>>({});
  const connectionPollIntervals = React.useRef<Record<string, NodeJS.Timeout | null>>({});

  // Load channel status
  const loadChannelStatus = React.useCallback(async () => {
    if (!gatewayClient || !gatewayClient.isConnected()) return;

    try {
      const statusResponse = await gatewayClient.request("channels.status", {}) as {
        ok: boolean;
        result?: { status?: ChannelStatus[] };
      };

      if (statusResponse.ok && statusResponse.result?.status) {
        setChannels(statusResponse.result.status);
      }
    } catch (err) {
      console.error("Failed to load channel status:", err);
    } finally {
      setLoading(false);
    }
  }, [gatewayClient]);

  useEffect(() => {
    loadChannelStatus();
  }, [loadChannelStatus]);

  // WhatsApp config handlers using hook
  const handleDmPolicyChange = (policy: "open" | "pairing" | "allowlist") => {
    whatsapp.saveConfig({ dmPolicy: policy });
  };

  const handleAddToAllowlist = () => {
    if (!newPhoneNumber.trim()) return;

    const phoneNumber = newPhoneNumber.trim().replace(/[^0-9+]/g, "");
    if (!phoneNumber) return;

    const currentAllowlist = whatsapp.config.allowFrom || [];
    if (currentAllowlist.includes(phoneNumber)) {
      setNewPhoneNumber("");
      return;
    }

    whatsapp.saveConfig({
      allowFrom: [...currentAllowlist, phoneNumber],
    });
    setNewPhoneNumber("");
  };

  const handleRemoveFromAllowlist = (phoneNumber: string) => {
    const currentAllowlist = whatsapp.config.allowFrom || [];
    whatsapp.saveConfig({
      allowFrom: currentAllowlist.filter((p) => p !== phoneNumber),
    });
  };

  // Helper to update channel state
  const updateChannelState = React.useCallback((channelId: string, updates: Partial<ChannelState>) => {
    setChannelStates((prev) => ({
      ...prev,
      [channelId]: { ...prev[channelId], ...updates },
    }));
  }, []);

  // Helper to clear timeouts/intervals for a channel
  const clearChannelTimers = React.useCallback((channelId: string) => {
    if (qrTimeoutRefs.current[channelId]) {
      clearTimeout(qrTimeoutRefs.current[channelId]!);
      qrTimeoutRefs.current[channelId] = null;
    }
    if (connectionPollIntervals.current[channelId]) {
      clearInterval(connectionPollIntervals.current[channelId]!);
      connectionPollIntervals.current[channelId] = null;
    }
  }, []);

  // State cache to prevent rapid toggles
  const stateCacheRef = React.useRef<Record<string, { connected: boolean; timestamp: number }>>({});

  // Listen for WhatsApp events - single source of truth from backend
  useEffect(() => {
    const handleQrEvent = (e: CustomEvent<{ qr: string | null; channelId: string; cleared?: boolean }>) => {
      const channelId = e.detail.channelId;
      
      // Handle QR cleared event
      if (e.detail.cleared || !e.detail.qr) {
        updateChannelState(channelId, {
          qrCode: null,
          connecting: false,
          error: null,
        });
        clearChannelTimers(channelId);
        return;
      }

      // Only show QR if we're not already connected (check cache)
      const cached = stateCacheRef.current[channelId];
      if (cached?.connected) {
        console.log("[ChannelsView] Ignoring QR - channel already connected");
        return;
      }

      clearChannelTimers(channelId);
      updateChannelState(channelId, {
        qrCode: e.detail.qr,
        connecting: false,
        error: null,
      });
    };

    const handleConnectionEvent = (e: CustomEvent<{ connected: boolean; channelId: string }>) => {
      const channelId = e.detail.channelId;
      const now = Date.now();
      
      // Cache state to prevent rapid toggles
      const cached = stateCacheRef.current[channelId];
      if (cached && cached.connected === e.detail.connected && (now - cached.timestamp) < 500) {
        console.log("[ChannelsView] Ignoring duplicate connection event");
        return;
      }
      
      stateCacheRef.current[channelId] = {
        connected: e.detail.connected,
        timestamp: now,
      };

      // Sync UI state from backend event (single source of truth)
      if (e.detail.connected) {
        updateChannelState(channelId, {
          qrCode: null, // Always clear QR on connection
          connecting: false,
          error: null,
        });
        clearChannelTimers(channelId);
        // Reload status from backend to ensure sync
        loadChannelStatus();
      } else {
        // On disconnect, clear QR and update state
        updateChannelState(channelId, {
          qrCode: null,
          connecting: false,
          error: null,
        });
        loadChannelStatus();
      }
    };

    window.addEventListener("whatsapp-qr", handleQrEvent as EventListener);
    window.addEventListener("whatsapp-connection", handleConnectionEvent as EventListener);
    window.addEventListener("telegram-connection", handleConnectionEvent as EventListener);
    window.addEventListener("discord-connection", handleConnectionEvent as EventListener);
    window.addEventListener("signal-connection", handleConnectionEvent as EventListener);

    return () => {
      window.removeEventListener("whatsapp-qr", handleQrEvent as EventListener);
      window.removeEventListener("whatsapp-connection", handleConnectionEvent as EventListener);
      window.removeEventListener("telegram-connection", handleConnectionEvent as EventListener);
      window.removeEventListener("discord-connection", handleConnectionEvent as EventListener);
      window.removeEventListener("signal-connection", handleConnectionEvent as EventListener);
      Object.keys(qrTimeoutRefs.current).forEach(clearChannelTimers);
      Object.keys(connectionPollIntervals.current).forEach(clearChannelTimers);
    };
  }, [gatewayClient, loadChannelStatus, clearChannelTimers, updateChannelState]);

  const handleChannelConnect = async (channelId: ChannelId) => {
    if (!gatewayClient) return;

    try {
      if (channelId === "whatsapp") {
        await whatsapp.connect();
      } else if (channelId === "telegram") {
        if (!telegramBotToken.trim()) {
          updateChannelState(channelId, {
            error: "Please provide a bot token to connect Telegram",
            connecting: false,
          });
          return;
        }
        await telegram.connect(telegramBotToken);
      } else if (channelId === "discord") {
        if (!discordBotToken.trim()) {
          updateChannelState(channelId, {
            error: "Please provide a bot token to connect Discord",
            connecting: false,
          });
          return;
        }
        await discord.connect(discordBotToken);
      } else if (channelId === "signal") {
        await signal.connect();
      } else {
        // For other channels, use the old manual approach
        updateChannelState(channelId, { connecting: true, error: null });
        
        if (!gatewayClient.isConnected()) {
          await gatewayClient.connect();
        }

        const configResponse = await gatewayClient.request("config.update", {
          updates: {
            channels: {
              [channelId]: {
                enabled: true,
              },
            },
          },
        }) as { ok: boolean; error?: { message: string } };

        if (!configResponse.ok) {
          throw new Error(configResponse.error?.message || "Failed to update config");
        }

        await gatewayClient.request("channels.reload", {});
        
        const startResponse = await gatewayClient.request("channels.start", {
          channelId,
        }) as { ok: boolean; error?: { message: string } };

        if (!startResponse.ok) {
          throw new Error(startResponse.error?.message || `Failed to start ${channelId}`);
        }

        setTimeout(() => {
          loadChannelStatus();
        }, 2000);
      }
    } catch (err: any) {
      updateChannelState(channelId, {
        error: err.message || `Failed to connect ${channelId}`,
        connecting: false,
      });
    }
  };

  const handleChannelDisconnect = async (channelId: ChannelId) => {
    if (!gatewayClient) return;

    try {
      if (channelId === "whatsapp") {
        await whatsapp.disconnect();
      } else if (channelId === "telegram") {
        await telegram.disconnect();
      } else if (channelId === "discord") {
        await discord.disconnect();
      } else if (channelId === "signal") {
        await signal.disconnect();
      } else {
        // For other channels, use manual approach
        const stopResponse = await gatewayClient.request("channels.stop", {
          channelId,
        }) as { ok: boolean; error?: { message: string } };

        if (!stopResponse.ok) {
          throw new Error(stopResponse.error?.message || `Failed to stop ${channelId}`);
        }

        await gatewayClient.request("config.update", {
          updates: {
            channels: {
              [channelId]: {
                enabled: false,
              },
            },
          },
        });

        await gatewayClient.request("channels.reload", {});
        clearChannelTimers(channelId);
        updateChannelState(channelId, { qrCode: null, connecting: false, error: null });
      }
      
      loadChannelStatus();
    } catch (err: any) {
      updateChannelState(channelId, {
        error: err.message || `Failed to disconnect ${channelId}`,
      });
    }
  };

  const renderChannel = (channelId: ChannelId) => {
    const channel = channels.find((c) => c.id === channelId);
    const info = CHANNEL_INFO[channelId];
    const isWhatsApp = channelId === "whatsapp";
    const isTelegram = channelId === "telegram";
    const isDiscord = channelId === "discord";
    const isSignal = channelId === "signal";
    
    // Use hook state for WhatsApp, Telegram, Discord, and Signal, fallback to manual state for others
    let isConnected: boolean;
    let connecting: boolean;
    let qrCode: string | null = null;
    let error: string | null = null;
    
    if (isWhatsApp) {
      isConnected = whatsapp.connected;
      connecting = whatsapp.connecting;
      qrCode = whatsapp.qrCode;
      error = whatsapp.error;
    } else if (isTelegram) {
      isConnected = telegram.connected;
      connecting = telegram.connecting;
      error = telegram.error;
    } else if (isDiscord) {
      isConnected = discord.connected;
      connecting = discord.connecting;
      error = discord.error;
    } else if (isSignal) {
      isConnected = signal.connected;
      connecting = signal.connecting;
      error = signal.error;
    } else {
      const state = channelStates[channelId] || { qrCode: null, connecting: false, error: null };
      isConnected = channel?.connected || false;
      connecting = state.connecting;
      qrCode = state.qrCode;
      error = state.error;
    }

    return (
      <div key={channelId} className="space-y-4">
          {isConnected && !qrCode && (
            <div className="flex items-center gap-2 text-sm text-[#3fb950] p-4 bg-[#238636]/5 border border-[#238636]/20 rounded-md">
              <CheckCircle2 className="h-4 w-4" />
              <span>Successfully connected</span>
            </div>
          )}

          {qrCode && qrCode !== "pending" && isWhatsApp && (
            <div className="flex flex-col items-center gap-6 p-6 bg-[#161b22] rounded-md border border-[#30363d]">
              <div className="text-center space-y-2">
                <div className="font-semibold text-sm text-[#c9d1d9]">Pair with WhatsApp</div>
                <div className="text-xs text-[#8b949e] max-w-[300px]">
                  Open WhatsApp → Linked Devices → Link a Device.
                </div>
              </div>
              <div className="p-4 bg-white rounded-lg">
                <QRCodeSVG value={qrCode} size={200} level="M" />
              </div>
              {!isConnected && (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Waiting for scan...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-[#f85149] p-4 bg-[#f85149]/5 border border-[#f85149]/20 rounded-md">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">Connection failed</div>
                <div className="text-xs opacity-80">{error}</div>
              </div>
            </div>
          )}

          {/* Telegram Bot Token Input */}
          {isTelegram && !isConnected && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="telegram-token" className="text-[#c9d1d9]">Telegram Bot Token</Label>
                <div className="text-xs text-[#8b949e] mb-2 space-y-1">
                  <p>1) Open Telegram and chat with @BotFather</p>
                  <p>2) Run /newbot (or /mybots)</p>
                  <p>3) Copy the token (looks like 123456:ABC...)</p>
                </div>
                <Input
                  id="telegram-token"
                  type="password"
                  placeholder="Enter bot token"
                  value={telegramBotToken}
                  onChange={(e) => setTelegramBotToken(e.target.value)}
                  disabled={connecting}
                  className="bg-[#161b22] border-[#30363d] text-[#c9d1d9]"
                />
              </div>
            </div>
          )}

          {/* Discord Bot Token Input */}
          {isDiscord && !isConnected && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="discord-token" className="text-[#c9d1d9]">Discord Bot Token</Label>
                <div className="text-xs text-[#8b949e] mb-2 space-y-1">
                  <p>1) Go to https://discord.com/developers/applications</p>
                  <p>2) Create a new application or select an existing one</p>
                  <p>3) Go to Bot section and copy the token</p>
                  <p>4) Enable "Message Content Intent" in Privileged Gateway Intents</p>
                </div>
                <Input
                  id="discord-token"
                  type="password"
                  placeholder="Enter bot token"
                  value={discordBotToken}
                  onChange={(e) => setDiscordBotToken(e.target.value)}
                  disabled={connecting}
                  className="bg-[#161b22] border-[#30363d] text-[#c9d1d9]"
                />
              </div>
            </div>
          )}

          {/* Signal Setup Info - Only show when connecting */}
          {isSignal && !isConnected && connecting && (
            <div className="space-y-4">
              <div className="p-4 bg-[#161b22] rounded-md border border-[#30363d] text-sm text-[#8b949e]">
                <div className="font-semibold text-[#c9d1d9] mb-2">Signal Integration Setup</div>
                <div className="space-y-1 text-xs">
                  <p>Signal integration requires signal-cli to be installed and configured.</p>
                  <p>1) Install signal-cli: https://github.com/AsamK/signal-cli</p>
                  <p>2) Register your phone number with signal-cli</p>
                  <p>3) Configure signal-cli to work with this application</p>
                  <p className="mt-2 font-semibold">Note: Full Signal integration is coming soon.</p>
                </div>
              </div>
            </div>
          )}

          {/* WhatsApp Security Controls */}
          {isWhatsApp && isConnected && (
            <div className="pt-4 border-t border-[#30363d] space-y-4">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#8b949e]" />
                <div className="font-semibold text-sm text-[#c9d1d9]">Security & Access Control</div>
              </div>

              {/* DM Policy */}
              <div className="space-y-2">
                <Label htmlFor="dm-policy" className="text-[#c9d1d9]">Direct Message Policy</Label>
                <Select
                  value={whatsapp.config.dmPolicy || "pairing"}
                  onValueChange={(value) => handleDmPolicyChange(value as "open" | "pairing" | "allowlist")}
                  disabled={whatsapp.savingConfig}
                >
                  <SelectTrigger id="dm-policy" className="bg-[#161b22] border-[#30363d] text-[#c9d1d9]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#161b22] border-[#30363d]">
                    <SelectItem value="open" className="text-[#c9d1d9]">Open - Accept messages from anyone</SelectItem>
                    <SelectItem value="pairing" className="text-[#c9d1d9]">Pairing - Only accept from contacts you've interacted with</SelectItem>
                    <SelectItem value="allowlist" className="text-[#c9d1d9]">Allowlist - Only accept from specific phone numbers</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-[#8b949e]">
                  {whatsapp.config.dmPolicy === "open" && "All incoming messages will be accepted."}
                  {whatsapp.config.dmPolicy === "pairing" && "Only messages from contacts you've previously interacted with will be accepted."}
                  {whatsapp.config.dmPolicy === "allowlist" && "Only messages from phone numbers in the allowlist will be accepted."}
                </p>
              </div>

              {/* Allowlist Management */}
              {whatsapp.config.dmPolicy === "allowlist" && (
                <div className="space-y-2">
                  <Label className="text-[#c9d1d9]">Allowed Phone Numbers</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter phone number (e.g., +1234567890)"
                      value={newPhoneNumber}
                      onChange={(e) => setNewPhoneNumber(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddToAllowlist();
                        }
                      }}
                      disabled={whatsapp.savingConfig}
                      className="bg-[#161b22] border-[#30363d] text-[#c9d1d9]"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleAddToAllowlist}
                      disabled={whatsapp.savingConfig || !newPhoneNumber.trim()}
                      className="bg-[#21262d] hover:bg-[#30363d] border-[#30363d] text-[#c9d1d9]"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {whatsapp.config.allowFrom && whatsapp.config.allowFrom.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {whatsapp.config.allowFrom.map((phoneNumber) => (
                        <div
                          key={phoneNumber}
                          className="flex items-center justify-between p-2 bg-[#161b22] rounded-md text-sm border border-[#30363d]"
                        >
                          <span className="font-mono text-[#c9d1d9]">{phoneNumber}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveFromAllowlist(phoneNumber)}
                            disabled={whatsapp.savingConfig}
                            className="h-6 w-6 p-0 text-[#8b949e] hover:text-[#c9d1d9]"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {(!whatsapp.config.allowFrom || whatsapp.config.allowFrom.length === 0) && (
                    <p className="text-xs text-[#8b949e]">
                      No phone numbers in allowlist. Add numbers above to allow messages from specific contacts.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

        {/* Connect/Disconnect Button */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#30363d]">
          {isConnected ? (
            <Button
              variant="outline"
              onClick={() => handleChannelDisconnect(channelId)}
              disabled={!gatewayClient}
              className="bg-[#21262d] hover:bg-[#30363d] border-[#30363d] text-[#c9d1d9]"
            >
              <Power className="h-4 w-4 mr-2" />
              Disconnect
            </Button>
          ) : (
            <Button
              onClick={() => handleChannelConnect(channelId)}
              disabled={connecting || !gatewayClient || (isTelegram && !telegramBotToken.trim()) || (isDiscord && !discordBotToken.trim())}
              className="bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636]"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : isWhatsApp ? (
                <>
                  <QrCode className="h-4 w-4 mr-2" />
                  Connect WhatsApp
                </>
              ) : isTelegram ? (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Connect Telegram
                </>
              ) : isDiscord ? (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Connect Discord
                </>
              ) : isSignal ? (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Connect Signal
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Setup
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    );
  };

  const handleChannelSelect = (channel: ChannelId) => {
    whatsapp.reset();
    telegram.reset();
    discord.reset();
    signal.reset();
    setSelectedChannel(channel);
    setTelegramBotToken("");
    setDiscordBotToken("");
    setNewPhoneNumber("");
  };

  const availableChannels: ChannelId[] = ["whatsapp", "telegram", "discord", "slack", "signal", "imessage"];

  // Get channel connection status for display
  const getChannelStatus = (channelId: ChannelId): { connected: boolean; name: string } => {
    const channel = channels.find((c) => c.id === channelId);
    if (channelId === "whatsapp") return { connected: whatsapp.connected, name: "WhatsApp" };
    if (channelId === "telegram") return { connected: telegram.connected, name: "Telegram" };
    if (channelId === "discord") return { connected: discord.connected, name: "Discord" };
    if (channelId === "signal") return { connected: signal.connected, name: "Signal" };
    return { connected: channel?.connected || false, name: CHANNEL_INFO[channelId].name };
  };

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#c9d1d9] mb-2">
          Messaging Channels
        </h1>
        <p className="text-[#8b949e]">
          Connect messaging platforms to send and receive messages through your agent.
        </p>
      </div>

      {/* Channel Selection */}
      <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
        <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
          <h2 className="text-base font-semibold text-[#c9d1d9]">Channel Selection</h2>
          <p className="text-xs text-[#8b949e] mt-1">
            Choose a messaging platform to configure
          </p>
        </div>
        <div className="p-6 bg-[#0d1117]">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[#8b949e] py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading channel status...
            </div>
          ) : (
            <RadioGroup
              value={selectedChannel || ""}
              onValueChange={(value) => handleChannelSelect(value as ChannelId)}
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {availableChannels.map((channelId) => {
                const info = CHANNEL_INFO[channelId];
                const status = getChannelStatus(channelId);
                return (
                  <label
                    key={channelId}
                    className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
                      selectedChannel === channelId
                        ? "border-[#1f6feb] bg-[#1f6feb]/5"
                        : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
                    }`}
                  >
                    <RadioGroupItem value={channelId} id={channelId} className="mt-1" />
                    <div className="flex-1 space-y-1">
                      <div className="font-semibold text-sm text-[#c9d1d9] flex items-center gap-2">
                        {info.icon}
                        {info.name}
                        {status.connected && (
                          <CheckCircle2 className="h-4 w-4 text-[#3fb950]" />
                        )}
                      </div>
                      <div className="text-xs text-[#8b949e]">{info.description}</div>
                    </div>
                  </label>
                );
              })}
            </RadioGroup>
          )}
        </div>
      </div>

      {/* Channel Configuration - Only show when a channel is selected */}
      {selectedChannel && (
        <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
          <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
            <h2 className="text-base font-semibold text-[#c9d1d9]">Channel Connection</h2>
            <p className="text-xs text-[#8b949e] mt-1">
              {selectedChannel === "whatsapp"
                ? "Scan the QR code to link your account"
                : selectedChannel === "telegram"
                ? "Enter your Telegram bot token to connect"
                : selectedChannel === "discord"
                ? "Enter your Discord bot token to connect"
                : selectedChannel === "signal"
                ? "Signal requires signal-cli setup (see instructions)"
                : `Complete ${selectedChannel} setup`}
            </p>
          </div>
          <div className="p-6 space-y-4 bg-[#0d1117]">
            {renderChannel(selectedChannel)}
          </div>
        </div>
      )}
    </div>
  );
}
