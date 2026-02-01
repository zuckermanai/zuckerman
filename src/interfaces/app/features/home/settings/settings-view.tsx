import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GatewayClient } from "../../../infrastructure/gateway/client";
import { Server, Palette, Settings as SettingsIcon, CheckCircle2, XCircle } from "lucide-react";

interface SettingsProps {
  gatewayClient: GatewayClient | null;
  onClose?: () => void;
  onGatewayConfigChange?: (host: string, port: number) => void;
}

type SettingsTab = "gateway" | "appearance" | "advanced";

interface SettingsState {
  gateway: {
    host: string;
    port: number;
  };
  appearance: {
    theme: "light" | "dark" | "system";
    fontSize: string;
  };
  advanced: {
    autoReconnect: boolean;
    reconnectAttempts: number;
  };
}

export function SettingsView({
  gatewayClient,
  onClose,
  onGatewayConfigChange,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("gateway");
  const [settings, setSettings] = useState<SettingsState>(() => {
    const stored = localStorage.getItem("zuckerman:settings");
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Fallback to defaults
      }
    }
    return {
      gateway: {
        host: "127.0.0.1",
        port: 18789,
      },
      appearance: {
        theme: "system",
        fontSize: "14",
      },
      advanced: {
        autoReconnect: true,
        reconnectAttempts: 5,
      },
    };
  });

  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Load current settings when component mounts
    const stored = localStorage.getItem("zuckerman:settings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
      } catch {}
    }
    setHasChanges(false);
    setConnectionStatus("idle");
  }, []);

  const handleSave = () => {
    localStorage.setItem("zuckerman:settings", JSON.stringify(settings));
    
    // Apply gateway config changes if provided
    if (onGatewayConfigChange && hasChanges) {
      onGatewayConfigChange(settings.gateway.host, settings.gateway.port);
    }

    // Apply theme if changed
    if (settings.appearance.theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (settings.appearance.theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      // System theme - check system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }

    setHasChanges(false);
  };

  const handleTestConnection = async () => {
    setConnectionStatus("testing");
    try {
      const testClient = new GatewayClient({
        host: settings.gateway.host,
        port: settings.gateway.port,
      });
      
      await Promise.race([
        testClient.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Connection timeout")), 5000)
        ),
      ]) as Promise<void>;
      
      testClient.disconnect();
      setConnectionStatus("success");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    } catch (error) {
      setConnectionStatus("error");
      setTimeout(() => setConnectionStatus("idle"), 3000);
    }
  };

  const updateSettings = <K extends keyof SettingsState>(
    section: K,
    updates: Partial<SettingsState[K]>
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
    setHasChanges(true);
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "gateway", label: "Gateway", icon: <Server className="h-4 w-4" /> },
    { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
    { id: "advanced", label: "Advanced", icon: <SettingsIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-8 py-8">
          <div className="mb-8 border-b pb-6">
            <div className="flex items-center gap-2 mb-6">
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "secondary" : "ghost"}
                  onClick={() => setActiveTab(tab.id)}
                  className="gap-2"
                >
                  {tab.icon}
                  {tab.label}
                </Button>
              ))}
            </div>
            <h1 className="text-2xl font-semibold mb-2">
              {tabs.find(t => t.id === activeTab)?.label}
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeTab === "gateway" && "Configure how your application connects to the Zuckerman Gateway server."}
              {activeTab === "appearance" && "Customize how the application looks and feels on your device."}
              {activeTab === "advanced" && "Configure technical settings and advanced connection behavior."}
            </p>
          </div>

          <div className="space-y-6">
            {activeTab === "gateway" && (
              <Card>
                <CardHeader>
                  <CardTitle>Gateway Configuration</CardTitle>
                  <CardDescription>
                    Configure how your application connects to the Zuckerman Gateway server.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="gateway-host">
                      Gateway Host
                    </Label>
                    <Input
                      id="gateway-host"
                      value={settings.gateway.host}
                      onChange={(e) =>
                        updateSettings("gateway", { host: e.target.value })
                      }
                      placeholder="127.0.0.1"
                    />
                    <p className="text-xs text-muted-foreground">
                      The hostname or IP address of your Zuckerman Gateway. Default is 127.0.0.1.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gateway-port">
                      Gateway Port
                    </Label>
                    <Input
                      id="gateway-port"
                      type="number"
                      value={settings.gateway.port}
                      onChange={(e) =>
                        updateSettings("gateway", {
                          port: parseInt(e.target.value) || 18789,
                        })
                      }
                      placeholder="18789"
                      min="1"
                      max="65535"
                    />
                    <p className="text-xs text-muted-foreground">
                      The port number the gateway is listening on. Default is 18789.
                    </p>
                  </div>

                  <Separator />

                  <div className="flex items-start gap-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleTestConnection}
                      disabled={connectionStatus === "testing"}
                    >
                      {connectionStatus === "testing" && "Testing..."}
                      {connectionStatus === "idle" && "Test connection"}
                      {connectionStatus === "success" && (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Connected
                        </>
                      )}
                      {connectionStatus === "error" && (
                        <>
                          <XCircle className="h-4 w-4 mr-2" />
                          Connection failed
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground pt-2">
                      Verifies that the gateway is reachable with these settings.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "appearance" && (
              <Card>
                <CardHeader>
                  <CardTitle>Appearance Settings</CardTitle>
                  <CardDescription>
                    Customize how the application looks and feels on your device.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="theme">
                      Theme preference
                    </Label>
                    <Select
                      value={settings.appearance.theme}
                      onValueChange={(value: "light" | "dark" | "system") =>
                        updateSettings("appearance", { theme: value })
                      }
                    >
                      <SelectTrigger id="theme" className="w-[240px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">Sync with system</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose how Zuckerman looks to you.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="font-size">
                      Text size
                    </Label>
                    <Select
                      value={settings.appearance.fontSize}
                      onValueChange={(value) =>
                        updateSettings("appearance", { fontSize: value })
                      }
                    >
                      <SelectTrigger id="font-size" className="w-[240px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12">12px (Small)</SelectItem>
                        <SelectItem value="14">14px (Medium)</SelectItem>
                        <SelectItem value="16">16px (Large)</SelectItem>
                        <SelectItem value="18">18px (Extra Large)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Adjust the font size for the chat and interface.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "advanced" && (
              <Card>
                <CardHeader>
                  <CardTitle>Advanced Settings</CardTitle>
                  <CardDescription>
                    Configure technical settings and advanced connection behavior.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-start gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Checkbox
                          id="auto-reconnect"
                          checked={settings.advanced.autoReconnect}
                          onCheckedChange={(checked) =>
                            updateSettings("advanced", {
                              autoReconnect: checked === true,
                            })
                          }
                        />
                        <Label htmlFor="auto-reconnect" className="cursor-pointer">
                          Auto-reconnect
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        Automatically attempt to reconnect to the gateway if the connection is lost.
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="reconnect-attempts">
                      Maximum reconnection attempts
                    </Label>
                    <Input
                      id="reconnect-attempts"
                      type="number"
                      value={settings.advanced.reconnectAttempts}
                      onChange={(e) =>
                        updateSettings("advanced", {
                          reconnectAttempts: parseInt(e.target.value) || 5,
                        })
                      }
                      min="1"
                      max="20"
                      className="w-24"
                    />
                    <p className="text-xs text-muted-foreground">
                      How many times the application will try to reconnect before showing an error.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      
      {hasChanges && (
        <div className="border-t px-8 py-4 flex items-center justify-end">
          <Button 
            onClick={handleSave}
          >
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}
