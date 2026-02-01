import React, { useState, useEffect } from "react";
import type { AppState } from "../infrastructure/types/app-state";

interface StatusBarProps {
  state: AppState;
}

export function StatusBar({ state }: StatusBarProps) {
  const [health, setHealth] = useState<{
    status: string;
    uptime: number;
    version: string;
  } | null>(null);

  useEffect(() => {
    if (state.connectionStatus === "connected" && state.gatewayClient?.isConnected()) {
      updateHealth();
      const interval = setInterval(updateHealth, 5000);
      return () => clearInterval(interval);
    }
  }, [state.connectionStatus, state.gatewayClient]);

  const updateHealth = async () => {
    if (!state.gatewayClient?.isConnected()) return;

    try {
      const response = await state.gatewayClient.request("health");
      if (response.ok && response.result) {
        const result = response.result as {
          status: string;
          uptime: number;
          version: string;
        };
        setHealth(result);
      }
    } catch (error) {
      console.error("Failed to get health:", error);
    }
  };

  const formatUptime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getStatusColor = () => {
    if (state.connectionStatus === "connected") return "text-green-500";
    if (state.connectionStatus === "connecting") return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div 
      className="border-t border-border bg-background px-4 flex items-center text-[11px] text-muted-foreground"
      style={{
        height: "calc(24px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        minHeight: "24px",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              state.connectionStatus === "connected"
                ? "bg-green-500"
                : state.connectionStatus === "connecting"
                ? "bg-yellow-500 animate-pulse"
                : "bg-red-500"
            }`}
          />
          <span className={getStatusColor()}>
            {state.connectionStatus === "connected"
              ? "Connected"
              : state.connectionStatus === "connecting"
              ? "Connecting..."
              : "Disconnected"}
          </span>
        </div>
        {health && (
          <>
            <div className="h-3 w-px bg-border" />
            <span>Uptime: {formatUptime(health.uptime)}</span>
            <div className="h-3 w-px bg-border" />
            <span>v{health.version}</span>
          </>
        )}
      </div>
    </div>
  );
}
