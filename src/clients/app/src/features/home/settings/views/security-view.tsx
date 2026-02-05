import React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { GatewayClient } from "../../../../core/gateway/client";

interface SecurityViewProps {
  gatewayClient: GatewayClient | null;
  toolRestrictions: {
    profile: "minimal" | "coding" | "messaging" | "full";
    enabledTools: Set<string>;
  };
  isLoadingTools: boolean;
  onToolToggle: (toolId: string) => void;
  onEnableAllTools: () => void;
}

export function SecurityView({
  gatewayClient,
  toolRestrictions,
  isLoadingTools,
  onToolToggle,
  onEnableAllTools,
}: SecurityViewProps) {
  return (
    <React.Fragment>
      <div className="border border-border rounded-md bg-card">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Tool Restrictions</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select which tools your agent can use.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={onEnableAllTools}
              disabled={!gatewayClient?.isConnected() || isLoadingTools}
            >
              Enable All
            </Button>
          </div>
        </div>
        <div className="px-6 py-4">
          {isLoadingTools ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading tools...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {[
                { id: "terminal", label: "Terminal", description: "Execute shell commands" },
                { id: "browser", label: "Browser", description: "Web browsing and automation" },
                { id: "filesystem", label: "Filesystem", description: "Read and write files" },
                { id: "cron", label: "Cron", description: "Scheduled tasks" },
              ].map((tool) => (
                <label
                  key={tool.id}
                  className="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    checked={toolRestrictions.enabledTools.has(tool.id)}
                    onCheckedChange={() => onToolToggle(tool.id)}
                    disabled={!gatewayClient?.isConnected()}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-foreground">{tool.label}</div>
                    <div className="text-sm text-muted-foreground">{tool.description}</div>
                  </div>
                </label>
              ))}
              {!gatewayClient?.isConnected() && (
                <p className="text-xs text-muted-foreground mt-2">
                  Connect to gateway to manage tool restrictions.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </React.Fragment>
  );
}
