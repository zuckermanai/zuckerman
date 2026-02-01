import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, CheckCircle2, AlertCircle, QrCode, MessageSquare } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { OnboardingState } from "../onboarding-flow";
import { GatewayClient } from "../../../infrastructure/gateway/client";

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
  const [connecting, setConnecting] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for QR code and connection events from gateway
  useEffect(() => {
    const handleQrEvent = (e: CustomEvent<{ qr: string; channelId: string }>) => {
      if (e.detail.channelId === "whatsapp" && selectedChannel === "whatsapp") {
        setQrCode(e.detail.qr);
        setConnecting(false);
      }
    };

    const handleConnectionEvent = (e: CustomEvent<{ connected: boolean; channelId: string }>) => {
      if (e.detail.channelId === "whatsapp" && selectedChannel === "whatsapp") {
        if (e.detail.connected) {
          setConnected(true);
          setQrCode(null);
          setConnecting(false);
          onUpdate({
            channel: {
              type: "whatsapp",
              connected: true,
              qrCode: null,
            },
          });
        }
      }
    };

    window.addEventListener("whatsapp-qr", handleQrEvent as EventListener);
    window.addEventListener("whatsapp-connection", handleConnectionEvent as EventListener);
    return () => {
      window.removeEventListener("whatsapp-qr", handleQrEvent as EventListener);
      window.removeEventListener("whatsapp-connection", handleConnectionEvent as EventListener);
    };
  }, [selectedChannel, onUpdate]);

  const handleChannelSelect = (channel: ChannelType) => {
    setSelectedChannel(channel);
    setConnected(false);
    setQrCode(null);
    setError(null);
    onUpdate({
      channel: {
        type: channel,
        connected: false,
        qrCode: null,
      },
    });
  };

  const handleConnect = async () => {
    if (!gatewayClient || selectedChannel === "none") return;

    setConnecting(true);
    setError(null);

    try {
      // Ensure gateway is connected
      if (!gatewayClient.isConnected()) {
        await gatewayClient.connect();
      }

      if (selectedChannel === "whatsapp") {
        try {
          // First, enable WhatsApp in config
          const configResponse = await gatewayClient.request("config.update", {
            updates: {
              channels: {
                whatsapp: {
                  enabled: true,
                  dmPolicy: "pairing",
                  allowFrom: [],
                },
              },
            },
          }) as { ok: boolean; error?: { message: string } };

          if (!configResponse.ok) {
            throw new Error(configResponse.error?.message || "Failed to update config");
          }

          // Reload channels to pick up the new config
          const reloadResponse = await gatewayClient.request("channels.reload", {}) as {
            ok: boolean;
            error?: { message: string };
          };

          if (!reloadResponse.ok) {
            throw new Error(reloadResponse.error?.message || "Failed to reload channels");
          }

          // Now start WhatsApp channel
          const startResponse = await gatewayClient.request("channels.start", {
            channelId: "whatsapp",
          }) as { ok: boolean; error?: { message: string } };

          if (!startResponse.ok) {
            throw new Error(startResponse.error?.message || "Failed to start WhatsApp");
          }

          // For WhatsApp, QR code will be received via WebSocket event
          // Set pending state - QR code will come through event listener
          setQrCode("pending");
          setConnecting(false); // QR generation happens asynchronously
        } catch (err: any) {
          setError(err.message || "Failed to connect WhatsApp");
          setConnecting(false);
        }
      } else {
        // For other channels, mark as configured (they'll need tokens later)
        setConnected(true);
        onUpdate({
          channel: {
            type: selectedChannel,
            connected: true,
            qrCode: null,
          },
        });
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect channel");
      setConnecting(false);
    } finally {
      setConnecting(false);
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Choose Your Chat Channel</h1>
        <p className="text-muted-foreground">
          Select how you want to chat with your agent. You can add more channels later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Channel Selection</CardTitle>
          <CardDescription>
            Choose your preferred messaging platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={selectedChannel}
            onValueChange={(value) => handleChannelSelect(value as ChannelType)}
            className="space-y-3"
          >
            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="whatsapp" id="whatsapp" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  WhatsApp
                </div>
                <div className="text-sm text-muted-foreground">
                  Most popular globally. Requires QR code pairing.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="telegram" id="telegram" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Telegram
                </div>
                <div className="text-sm text-muted-foreground">
                  Popular for bots. Requires bot token from @BotFather.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="discord" id="discord" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Discord
                </div>
                <div className="text-sm text-muted-foreground">
                  Great for communities. Requires bot token.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="slack" id="slack" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Slack
                </div>
                <div className="text-sm text-muted-foreground">
                  Perfect for teams. Requires bot and app tokens.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors">
              <RadioGroupItem value="none" id="none" className="mt-1" />
              <div className="flex-1 space-y-1">
                <div className="font-medium text-sm">Skip for now</div>
                <div className="text-sm text-muted-foreground">
                  You can add channels later in settings
                </div>
              </div>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {selectedChannel !== "none" && (
        <Card>
          <CardHeader>
            <CardTitle>Channel Setup</CardTitle>
            <CardDescription>
              {selectedChannel === "whatsapp"
                ? "Connect your WhatsApp account by scanning the QR code"
                : `${selectedChannel.charAt(0).toUpperCase() + selectedChannel.slice(1)} setup will be configured in settings`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedChannel === "whatsapp" && (
              <>
                {qrCode === "pending" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 bg-muted rounded-lg border-2 border-dashed border-primary/20">
                      <Loader2 className="h-6 w-6 text-primary shrink-0 animate-spin" />
                      <div className="flex-1">
                        <div className="font-medium text-sm">Generating QR Code...</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Please wait while we generate the QR code for WhatsApp pairing.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {qrCode && qrCode !== "pending" && (
                  <div className="space-y-4">
                    <div className="flex flex-col items-center gap-4 p-6 bg-muted rounded-lg border">
                      <QrCode className="h-6 w-6 text-primary" />
                      <div className="text-center">
                        <div className="font-medium text-sm mb-2">Scan QR Code with WhatsApp</div>
                        <div className="text-sm text-muted-foreground mb-4">
                          Open WhatsApp on your phone → Settings → Linked Devices → Link a Device,
                          then scan this QR code.
                        </div>
                        <div className="flex justify-center p-4 bg-background rounded-lg border-2 border-dashed">
                          <QRCodeSVG value={qrCode} size={256} level="M" />
                        </div>
                      </div>
                    </div>
                    {connecting && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Waiting for WhatsApp connection...</span>
                      </div>
                    )}
                    {!connecting && (
                      <div className="text-xs text-muted-foreground p-3 bg-background rounded border text-center">
                        💡 Once you scan the QR code, this page will automatically detect the connection.
                      </div>
                    )}
                  </div>
                )}

                {connected && (
                  <div className="flex items-center gap-2 text-sm text-green-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>WhatsApp connected successfully!</span>
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-medium">Connection failed</div>
                      <div className="text-muted-foreground mt-1">{error}</div>
                    </div>
                  </div>
                )}

                {!connected && !qrCode && (
                  <Button
                    onClick={handleConnect}
                    disabled={connecting || !gatewayClient}
                    className="w-full"
                  >
                    {connecting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <QrCode className="mr-2 h-4 w-4" />
                        Connect WhatsApp
                      </>
                    )}
                  </Button>
                )}
              </>
            )}

            {selectedChannel !== "whatsapp" && (
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">
                  {selectedChannel.charAt(0).toUpperCase() + selectedChannel.slice(1)} setup requires
                  additional configuration (bot tokens, API keys, etc.) that will be done after onboarding.
                  You can configure it in the settings later.
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        {selectedChannel === "none" ? (
          <Button onClick={handleSkip}>Skip</Button>
        ) : (
          <Button
            onClick={onNext}
            disabled={!connected && selectedChannel === "whatsapp"}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
