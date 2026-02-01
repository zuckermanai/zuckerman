import React from "react";
import { SettingsView } from "../features/home/settings/settings-view";
import { GatewayClient } from "../infrastructure/gateway/client";

interface SettingsPageProps {
  gatewayClient: GatewayClient | null;
  onClose: () => void;
  onGatewayConfigChange: (host: string, port: number) => void;
}

export function SettingsPage({
  gatewayClient,
  onClose,
  onGatewayConfigChange,
}: SettingsPageProps) {
  return (
    <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
      <SettingsView
        gatewayClient={gatewayClient}
        onClose={onClose}
        onGatewayConfigChange={onGatewayConfigChange}
      />
    </div>
  );
}
