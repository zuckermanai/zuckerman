import React from "react";
import { InspectorView } from "./inspector/inspector-view";
import { GatewayClient } from "../../infrastructure/gateway/client";

interface InspectorPageProps {
  gatewayClient: GatewayClient | null;
  onClose: () => void;
}

export function InspectorPage({ gatewayClient, onClose }: InspectorPageProps) {
  return (
    <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
      <div className="flex-1 overflow-y-auto">
        <InspectorView 
          gatewayClient={gatewayClient} 
          onClose={onClose}
        />
      </div>
    </div>
  );
}
