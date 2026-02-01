import React, { useState, useEffect } from "react";
import type { AppState } from "../infrastructure/types/app-state";
import { HealthService } from "../services/health-service";

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
      const healthService = new HealthService(state.gatewayClient);
      const healthData = await healthService.checkHealth();
      if (healthData) {
        setHealth(healthData);
      }
    } catch (error) {
      console.error("Failed to get health:", error);
    }
  };

  const formatUptime = (ms: number) => {
    if (!state.gatewayClient) return "";
    const healthService = new HealthService(state.gatewayClient);
    return healthService.formatUptime(ms);
  };

  const getStatusColor = () => {
    if (state.connectionStatus === "connected") return "text-green-500";
    if (state.connectionStatus === "connecting") return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <div 
      className="border-t border-border bg-background px-4 flex items-center text-xs text-muted-foreground"
      style={{
        height: "calc(32px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        minHeight: "32px",
        backgroundColor: 'hsl(var(--background))',
        borderColor: 'hsl(var(--border))',
      }}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
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
            <div className="h-4 w-px bg-border" />
            <span>Uptime: {formatUptime(health.uptime)}</span>
            <div className="h-4 w-px bg-border" />
            <span>v{health.version}</span>
          </>
        )}
      </div>
    </div>
  );
}
