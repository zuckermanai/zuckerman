import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, AlertCircle, QrCode, MessageSquare, X, Plus, Shield } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { OnboardingState } from "../onboarding-flow";
import { GatewayClient } from "../../../core/gateway/client";
import { useWhatsAppChannel } from "../../../hooks/channels/use-whatsapp-channel";
import { useTelegramChannel } from "../../../hooks/channels/use-telegram-channel";
import { useDiscordChannel } from "../../../hooks/channels/use-discord-channel";
import { useSignalChannel } from "../../../hooks/channels/use-signal-channel";

type ChannelType = "whatsapp" | "telegram" | "discord" | "slack" | "signal" | "imessage" | "none";

interface ChannelStepProps {
  state: OnboardingState;
  onUpdate: (updates: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack: () => void;
  gatewayClient: GatewayClient | null;
}

export function ChannelStep({
  state,
  onUpdate,
  onNext,
  onBack,
  gatewayClient,
}: ChannelStepProps) {
  const [selectedChannel, setSelectedChannel] = useState<ChannelType>(
    (state.channel?.type as ChannelType) || "none"
  );
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [discordBotToken, setDiscordBotToken] = useState("");
  const [newPhoneNumber, setNewPhoneNumber] = useState("");

  // Use channel hooks
  const whatsapp = useWhatsAppChannel(gatewayClient, {
    enabled: selectedChannel === "whatsapp",
  });

  const telegram = useTelegramChannel(gatewayClient, {
    enabled: selectedChannel === "telegram",
  });

  const discord = useDiscordChannel(gatewayClient, {
    enabled: selectedChannel === "discord",
  });

  const signal = useSignalChannel(gatewayClient, {
    enabled: selectedChannel === "signal",
  });

  // Sync hook state to onboarding state
  useEffect(() => {
    if (selectedChannel === "whatsapp") {
      onUpdate({
        channel: {
          type: "whatsapp",
          connected: whatsapp.connected,
          qrCode: whatsapp.qrCode,
        },
      });
    } else if (selectedChannel === "telegram") {
      onUpdate({
        channel: {
          type: "telegram",
          connected: telegram.connected,
          qrCode: null,
        },
      });
    } else if (selectedChannel === "discord") {
      onUpdate({
        channel: {
          type: "discord",
          connected: discord.connected,
          qrCode: null,
        },
      });
    } else if (selectedChannel === "signal") {
      onUpdate({
        channel: {
          type: "signal",
          connected: signal.connected,
          qrCode: null,
        },
      });
    }
  }, [selectedChannel, whatsapp.connected, whatsapp.qrCode, telegram.connected, discord.connected, signal.connected, onUpdate]);

  const handleChannelSelect = (channel: ChannelType) => {
    whatsapp.reset();
    telegram.reset();
    discord.reset();
    signal.reset();
    setSelectedChannel(channel);
    setTelegramBotToken("");
    setDiscordBotToken("");
    setNewPhoneNumber("");
    onUpdate({
      channel: {
        type: channel,
        connected: false,
        qrCode: null,
      },
    });
  };

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

  const handleConnect = async () => {
    if (!gatewayClient || selectedChannel === "none") return;

    try {
      // Ensure gateway is connected
      if (!gatewayClient.isConnected()) {
        await gatewayClient.connect();
      }

      if (selectedChannel === "whatsapp") {
        await whatsapp.connect();
      } else if (selectedChannel === "telegram") {
        if (!telegramBotToken.trim()) {
          return;
        }
        await telegram.connect(telegramBotToken);
      } else if (selectedChannel === "discord") {
        if (!discordBotToken.trim()) {
          return;
        }
        await discord.connect(discordBotToken);
      } else if (selectedChannel === "signal") {
        await signal.connect();
      } else {
        // For other channels, mark as configured
        onUpdate({
          channel: {
            type: selectedChannel,
            connected: true,
            qrCode: null,
          },
        });
      }
    } catch (err: any) {
      // Error is handled by hooks
    }
  };

  const handleSkip = () => {
    onUpdate({
      channel: {
        type: "none",
        connected: false,
        qrCode: null,
      },
    });
    onNext();
  };

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#c9d1d9] mb-2">
          Connect Chat Channel
        </h1>
        <p className="text-[#8b949e]">
          Select how you want to chat with your agent. You can add more channels later in settings.
        </p>
      </div>

      <div className="border border-[#30363d] rounded-md overflow-hidden bg-[#161b22]">
        <div className="px-6 py-4 border-b border-[#30363d] bg-[#161b22]">
          <h2 className="text-base font-semibold text-[#c9d1d9]">Channel Selection</h2>
          <p className="text-xs text-[#8b949e] mt-1">
            Choose your preferred messaging platform
          </p>
        </div>
        <div className="p-6 bg-[#0d1117]">
          <RadioGroup
            value={selectedChannel}
            onValueChange={(value) => handleChannelSelect(value as ChannelType)}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              selectedChannel === "whatsapp" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="whatsapp" id="whatsapp" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9] flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  WhatsApp
                </div>
                <div className="text-xs text-[#8b949e]">
                  Standard mobile messaging. Requires QR pairing.
                </div>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              selectedChannel === "telegram" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="telegram" id="telegram" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9] flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Telegram
                </div>
                <div className="text-xs text-[#8b949e]">
                  Fast and bot-friendly. Setup in settings.
                </div>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              selectedChannel === "discord" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="discord" id="discord" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9] flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Discord
                </div>
                <div className="text-xs text-[#8b949e]">
                  Great for community chats. Setup in settings.
                </div>
              </div>
            </label>

            <label className={`flex items-start gap-3 p-4 rounded-md border cursor-pointer transition-all ${
              selectedChannel === "none" 
                ? "border-[#1f6feb] bg-[#1f6feb]/5" 
                : "border-[#30363d] hover:border-[#8b949e] bg-[#161b22]"
            }`}>
              <RadioGroupItem value="none" id="none" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-semibold text-sm text-[#c9d1d9]">Skip for now</div>
                <div className="text-xs text-[#8b949e]">
                  Don't connect a channel during setup.
                </div>
              </div>
            </label>
          </RadioGroup>
        </div>
      </div>

      {selectedChannel !== "none" && (
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
                : `Complete ${selectedChannel} setup in settings after onboarding`}
            </p>
          </div>
          <div className="p-6 space-y-4 bg-[#0d1117]">
            {selectedChannel === "whatsapp" && (
              <div className="space-y-4">
                {whatsapp.qrCode === "pending" && (
                  <div className="flex items-center gap-3 p-4 bg-[#161b22] rounded-md border border-[#30363d] border-dashed">
                    <Loader2 className="h-5 w-5 text-[#58a6ff] animate-spin" />
                    <span className="text-sm text-[#8b949e]">Generating QR Code...</span>
                  </div>
                )}

                {whatsapp.qrCode && whatsapp.qrCode !== "pending" && (
                  <div className="flex flex-col items-center gap-6 p-6 bg-[#161b22] rounded-md border border-[#30363d]">
                    <div className="text-center space-y-2">
                      <div className="font-semibold text-sm text-[#c9d1d9]">Pair with WhatsApp</div>
                      <div className="text-xs text-[#8b949e] max-w-[300px]">
                        Open WhatsApp → Linked Devices → Link a Device.
                      </div>
                    </div>
                    <div className="p-4 bg-white rounded-lg">
                      <QRCodeSVG value={whatsapp.qrCode} size={200} level="M" />
                    </div>
                    {!whatsapp.connected && (
                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Waiting for scan...</span>
                        </div>
                        <div className="text-xs text-[#8b949e] opacity-70">
                          Scan the QR code above with your WhatsApp app
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {whatsapp.connected && (
                  <>
                    <div className="flex items-center gap-2 text-sm text-[#3fb950] p-4 bg-[#238636]/5 border border-[#238636]/20 rounded-md">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Successfully connected to WhatsApp</span>
                    </div>

                    {/* WhatsApp Security Controls */}
                    <div className="pt-4 border-t border-[#30363d] space-y-4">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-[#8b949e]" />
                        <div className="font-semibold text-sm text-[#c9d1d9]">Security & Access Control</div>
                      </div>

                      {/* DM Policy */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="dm-policy" className="text-[#c9d1d9]">Direct Message Policy</Label>
                          {whatsapp.savingConfig && (
                            <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span>Saving...</span>
                            </div>
                          )}
                        </div>
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
                          <div className="flex items-center justify-between">
                            <Label className="text-[#c9d1d9]">Allowed Phone Numbers</Label>
                            {whatsapp.savingConfig && (
                              <div className="flex items-center gap-2 text-xs text-[#8b949e]">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>Saving...</span>
                              </div>
                            )}
                          </div>
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
                              {whatsapp.savingConfig ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="h-4 w-4" />
                              )}
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
                  </>
                )}

                {whatsapp.error && (
                  <div className="flex items-start gap-2 text-sm text-[#f85149] p-4 bg-[#f85149]/5 border border-[#f85149]/20 rounded-md">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-semibold">Connection failed</div>
                      <div className="text-xs opacity-80">{whatsapp.error}</div>
                    </div>
                  </div>
                )}

                {!whatsapp.connected && !whatsapp.qrCode && (
                  <Button
                    onClick={handleConnect}
                    disabled={whatsapp.connecting || !gatewayClient}
                    className="w-full bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border-[#30363d]"
                  >
                    {whatsapp.connecting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Initializing...
                      </>
                    ) : (
                      <>
                        <QrCode className="mr-2 h-4 w-4" />
                        Generate QR Code
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {selectedChannel === "telegram" && (
              <div className="space-y-4">
                {telegram.connected && (
                  <div className="flex items-center gap-2 text-sm text-[#3fb950] p-4 bg-[#238636]/5 border border-[#238636]/20 rounded-md">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Successfully connected to Telegram</span>
                  </div>
                )}

                {!telegram.connected && (
                  <>
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
                        disabled={telegram.connecting}
                        className="bg-[#161b22] border-[#30363d] text-[#c9d1d9]"
                      />
                    </div>

                    {telegram.error && (
                      <div className="flex items-start gap-2 text-sm text-[#f85149] p-4 bg-[#f85149]/5 border border-[#f85149]/20 rounded-md">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <div className="font-semibold">Connection failed</div>
                          <div className="text-xs opacity-80">{telegram.error}</div>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={handleConnect}
                      disabled={telegram.connecting || !gatewayClient || !telegramBotToken.trim()}
                      className="w-full bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border-[#30363d]"
                    >
                      {telegram.connecting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Connect Telegram
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}

            {selectedChannel === "discord" && (
              <div className="space-y-4">
                {discord.connected && (
                  <div className="flex items-center gap-2 text-sm text-[#3fb950] p-4 bg-[#238636]/5 border border-[#238636]/20 rounded-md">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Successfully connected to Discord</span>
                  </div>
                )}

                {!discord.connected && (
                  <>
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
                        disabled={discord.connecting}
                        className="bg-[#161b22] border-[#30363d] text-[#c9d1d9]"
                      />
                    </div>

                    {discord.error && (
                      <div className="flex items-start gap-2 text-sm text-[#f85149] p-4 bg-[#f85149]/5 border border-[#f85149]/20 rounded-md">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <div className="font-semibold">Connection failed</div>
                          <div className="text-xs opacity-80">{discord.error}</div>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={handleConnect}
                      disabled={discord.connecting || !gatewayClient || !discordBotToken.trim()}
                      className="w-full bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border-[#30363d]"
                    >
                      {discord.connecting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Connect Discord
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}

            {selectedChannel === "signal" && (
              <div className="space-y-4">
                {signal.connected && (
                  <div className="flex items-center gap-2 text-sm text-[#3fb950] p-4 bg-[#238636]/5 border border-[#238636]/20 rounded-md">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Successfully connected to Signal</span>
                  </div>
                )}

                {!signal.connected && (
                  <>
                    {/* Signal Setup Info - Only show when connecting or after error */}
                    {(signal.connecting || signal.error) && (
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
                    )}

                    {signal.error && (
                      <div className="flex items-start gap-2 text-sm text-[#f85149] p-4 bg-[#f85149]/5 border border-[#f85149]/20 rounded-md">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <div className="flex-1">
                          <div className="font-semibold">Connection failed</div>
                          <div className="text-xs opacity-80">{signal.error}</div>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={handleConnect}
                      disabled={signal.connecting || !gatewayClient}
                      className="w-full bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] border-[#30363d]"
                    >
                      {signal.connecting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Connect Signal
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}

            {selectedChannel !== "whatsapp" && selectedChannel !== "telegram" && selectedChannel !== "discord" && selectedChannel !== "signal" && (
              <div className="p-4 bg-[#161b22] rounded-md border border-[#30363d] text-sm text-[#8b949e]">
                {selectedChannel.charAt(0).toUpperCase() + selectedChannel.slice(1)} integration will be configured later in the main settings dashboard. You can continue with the onboarding.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-6 border-t border-[#30363d]">
        <Button 
          variant="ghost" 
          onClick={onBack}
          className="text-[#8b949e] hover:text-[#c9d1d9]"
        >
          Back
        </Button>
        {selectedChannel === "none" ? (
          <Button 
            onClick={handleSkip}
            className="bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636]"
          >
            Continue
          </Button>
        ) : (
          <Button
            onClick={onNext}
            disabled={
              (selectedChannel === "whatsapp" && !whatsapp.connected) ||
              (selectedChannel === "telegram" && !telegram.connected) ||
              (selectedChannel === "discord" && !discord.connected) ||
              (selectedChannel === "signal" && !signal.connected)
            }
            className="bg-[#238636] hover:bg-[#2ea043] text-white border-[#238636]"
          >
            Next Step
          </Button>
        )}
      </div>
    </div>
  );
}
