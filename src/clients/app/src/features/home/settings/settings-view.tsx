import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { GatewayClient } from "../../../core/gateway/client";
import { Server, Brain, Settings as SettingsIcon, Loader2, Trash2, Shield, MessageSquare } from "lucide-react";
import { useGateway } from "../../../hooks/use-gateway";
import { useSettings } from "../../../hooks/use-settings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GatewayView } from "./views/gateway-view";
import { LLMView } from "./views/llm-view";
import { SecurityView } from "./views/security-view";
import { ChannelsView } from "./views/channels-view";

interface SettingsProps {
  gatewayClient: GatewayClient | null;
  onClose?: () => void;
}

type SettingsTab = "gateway" | "channels" | "llm" | "security" | "advanced";

export function SettingsView({
  gatewayClient,
  onClose,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("gateway");
  
  const {
    serverStatus,
    isServerLoading,
    isServerStarting,
    isServerStopping,
    startServer,
    stopServer,
    checkServerStatus,
    startPolling,
    stopPolling,
  } = useGateway();

  const {
    settings,
    hasChanges,
    testingApiKey,
    connectionStatus,
    toolRestrictions,
    isLoadingTools,
    showResetDialog,
    isResetting,
    availableModels,
    isLoadingModels,
    updateSettings,
    saveSettings,
    testConnection,
    testApiKey,
    handleProviderChange,
    handleModelChange,
    handleToolToggle,
    handleEnableAllTools,
    handleReset,
    setShowResetDialog,
  } = useSettings(gatewayClient, undefined, startServer, stopServer);

  useEffect(() => {
    // Check gateway status when component mounts
    if (window.electronAPI && settings.gateway) {
      checkServerStatus(settings.gateway.host, settings.gateway.port);
    }
  }, [checkServerStatus, settings.gateway]);

  // Check gateway status when settings change
  useEffect(() => {
    if (window.electronAPI && activeTab === "gateway") {
      checkServerStatus(settings.gateway.host, settings.gateway.port);
      // Start polling when on gateway tab
      startPolling(settings.gateway.host, settings.gateway.port, 5000);
    } else {
      // Stop polling when leaving gateway tab
      stopPolling();
    }

    return () => {
      stopPolling();
    };
  }, [settings.gateway.host, settings.gateway.port, activeTab, checkServerStatus, startPolling, stopPolling]);


  const tabs: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: "gateway", label: "Gateway", icon: <Server className="h-4 w-4" /> },
    { id: "channels", label: "Channels", icon: <MessageSquare className="h-4 w-4" /> },
    { id: "llm", label: "LLM Provider", icon: <Brain className="h-4 w-4" /> },
    { id: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
    { id: "advanced", label: "Advanced", icon: <SettingsIcon className="h-4 w-4" /> },
  ];

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto w-full px-6 py-8">
          {/* GitHub-style header */}
          <div className="mb-8 pb-6 border-b border-border">
            <div className="flex items-center gap-1 mb-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                    ${activeTab === tab.id 
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"}
                  `}
                >
                  <div className="flex items-center gap-2">
                    {tab.icon}
                    {tab.label}
                  </div>
                </button>
              ))}
            </div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              {tabs.find(t => t.id === activeTab)?.label}
            </h1>
            <p className="text-sm text-muted-foreground">
              {activeTab === "gateway" && "Turn the gateway server on or off."}
              {activeTab === "channels" && "Connect and manage messaging channels like WhatsApp, Telegram, and more."}
              {activeTab === "llm" && "Configure your LLM provider and API keys."}
              {activeTab === "security" && "Configure security settings and tool restrictions."}
              {activeTab === "advanced" && "Configure gateway connection settings and advanced options."}
            </p>
          </div>

          <div className="space-y-6">
            {activeTab === "gateway" && (
              <GatewayView
                gatewayClient={gatewayClient}
                settings={settings}
                connectionStatus={connectionStatus}
                serverStatus={serverStatus}
                isServerStarting={isServerStarting}
                isServerStopping={isServerStopping}
                onTestConnection={testConnection}
                onUpdateGateway={(updates) => updateSettings("gateway", updates)}
                onToggleServer={async () => {
                  if (serverStatus?.running) {
                    await stopServer(settings.gateway.host, settings.gateway.port);
                  } else {
                    const success = await startServer(settings.gateway.host, settings.gateway.port);
                    if (success && gatewayClient) {
                      setTimeout(() => {
                        gatewayClient.connect().catch(() => {
                          // Connection will be handled by App component
                        });
                      }, 1000);
                    }
                  }
                }}
              />
            )}

            {activeTab === "channels" && (
              <ChannelsView gatewayClient={gatewayClient} />
            )}

            {activeTab === "llm" && (
              <LLMView
                llmProvider={settings.llmProvider}
                testingApiKey={testingApiKey}
                availableModels={availableModels}
                isLoadingModels={isLoadingModels}
                onProviderChange={handleProviderChange}
                onApiKeyChange={(apiKey) =>
                  updateSettings("llmProvider", {
                    apiKey,
                    validated: false,
                  })
                }
                onModelChange={handleModelChange}
                onTestApiKey={testApiKey}
              />
            )}

            {activeTab === "security" && (
              <SecurityView
                gatewayClient={gatewayClient}
                toolRestrictions={toolRestrictions}
                isLoadingTools={isLoadingTools}
                onToolToggle={handleToolToggle}
                onEnableAllTools={handleEnableAllTools}
              />
            )}

            {activeTab === "advanced" && (
              <React.Fragment>
                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">Gateway Configuration</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configure gateway connection settings.
                    </p>
                  </div>
                  <div className="px-6 py-4 space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="gateway-host" className="text-sm font-medium text-foreground">
                        Gateway Host
                      </Label>
                      <Input
                        id="gateway-host"
                        value={settings.gateway.host}
                        onChange={(e) =>
                          updateSettings("gateway", { host: e.target.value })
                        }
                        placeholder="127.0.0.1"
                        className="max-w-md"
                      />
                      <p className="text-sm text-muted-foreground">
                        The hostname or IP address of your Zuckerman Gateway. Default is 127.0.0.1.
                      </p>
                    </div>

                    <div className="border-t border-border pt-6 space-y-2">
                      <Label htmlFor="gateway-port" className="text-sm font-medium text-foreground">
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
                        className="w-32"
                      />
                      <p className="text-sm text-muted-foreground">
                        The port number the gateway is listening on. Default is 18789.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border border-border rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-foreground">Connection Settings</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Configure advanced connection behavior.
                    </p>
                  </div>
                  <div className="px-6 py-4 space-y-6">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="auto-reconnect"
                        checked={settings.advanced.autoReconnect}
                        onCheckedChange={(checked) =>
                          updateSettings("advanced", {
                            autoReconnect: checked === true,
                          })
                        }
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <Label htmlFor="auto-reconnect" className="cursor-pointer text-sm font-medium text-foreground">
                          Auto-reconnect
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                          Automatically attempt to reconnect to the gateway if the connection is lost.
                        </p>
                      </div>
                    </div>

                    <div className="border-t border-border pt-6 space-y-2">
                      <Label htmlFor="reconnect-attempts" className="text-sm font-medium text-foreground">
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
                      <p className="text-sm text-muted-foreground">
                        How many times the application will try to reconnect before showing an error.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border border-destructive/50 rounded-md bg-card">
                  <div className="px-6 py-4 border-b border-border">
                    <h2 className="text-base font-semibold text-destructive">Danger Zone</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Irreversible and destructive actions.
                    </p>
                  </div>
                  <div className="px-6 py-4">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-foreground mb-1">Reset All Data</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          This will permanently delete all Zuckerman data including:
                        </p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside mb-4 space-y-1">
                          <li>All chat history and conversations</li>
                          <li>Agent configurations</li>
                          <li>Memory and transcripts</li>
                          <li>All other stored data</li>
                        </ul>
                        <Button
                          variant="destructive"
                          onClick={() => setShowResetDialog(true)}
                          disabled={!window.electronAPI}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Reset All Data
                        </Button>
                        {!window.electronAPI && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Reset functionality requires Electron API.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset All Data</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all Zuckerman data? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            <p className="mb-2">This will permanently delete:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>All chat history and conversations</li>
              <li>Agent configurations</li>
              <li>Memory and transcripts</li>
              <li>All other stored data</li>
            </ul>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Reset All Data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
            {hasChanges && (
        <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-end">
          <Button 
            onClick={saveSettings}
            className="bg-[#0969da] hover:bg-[#0860ca] text-white"
          >
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}
