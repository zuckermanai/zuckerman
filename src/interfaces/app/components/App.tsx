import React, { useState, useEffect, useRef } from "react";
import { GatewayClient } from "../infrastructure/gateway/client";
import { Sidebar } from "./Sidebar";
import { TitleBar } from "../layout/title-bar";
import { OnboardingFlow } from "../features/onboarding/onboarding-flow";
import { ConnectionError } from "../features/gateway/connection-error";
import { navigation } from "../lib/navigation";
import { HomePage } from "../pages/HomePage";
import { SettingsPage } from "../pages/SettingsPage";
import { InspectorPage } from "../pages/InspectorPage";
import type { OnboardingState } from "../features/onboarding/onboarding-flow";

declare global {
  interface Window {
    platform?: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
    };
  }
}

export interface AppState {
  currentSessionId: string | null;
  currentAgentId: string | null;
  sessions: Array<{
    id: string;
    label: string;
    type: "main" | "group" | "channel";
    agentId?: string;
  }>;
  agents: string[];
  connectionStatus: "connected" | "disconnected" | "connecting";
  gatewayClient: GatewayClient | null;
}

export default function App() {
  console.log("App component rendering...");
  
  const [showOnboarding, setShowOnboarding] = useState(() => {
    // Check if onboarding has been completed
    const completed = localStorage.getItem("zuckerman:onboarding:completed");
    return !completed;
  });
  
  const [state, setState] = useState<AppState>({
    currentSessionId: null,
    currentAgentId: null,
    sessions: [],
    agents: [],
    connectionStatus: "disconnected",
    gatewayClient: null,
  });
  const [currentPage, setCurrentPage] = useState<"home" | "settings" | "inspector">("home");
  
  // Track if we're currently connecting to prevent duplicate connections
  const connectingRef = useRef(false);

  const [gatewayClient] = useState(() => {
    // Load gateway config from settings
    const stored = localStorage.getItem("zuckerman:settings");
    let host = "127.0.0.1";
    let port = 18789;
    if (stored) {
      try {
        const settings = JSON.parse(stored);
        if (settings.gateway) {
          host = settings.gateway.host || host;
          port = settings.gateway.port || port;
        }
      } catch {}
    }
    const client = new GatewayClient({
      host,
      port,
      onConnect: () => {
        setState((prev) => ({ ...prev, connectionStatus: "connected" }));
        // Load initial data after a short delay to ensure state is updated
        setTimeout(() => {
          loadInitialData();
        }, 100);
      },
      onDisconnect: () => {
        setState((prev) => ({ ...prev, connectionStatus: "disconnected" }));
      },
      onError: (error) => {
        console.error("Gateway error:", error);
      },
      onEvent: (event) => {
        // Handle channel events (e.g., WhatsApp QR codes and connection status)
        if (event.event === "channel.whatsapp.qr" && event.payload) {
          const payload = event.payload as { qr: string; channelId: string };
          window.dispatchEvent(new CustomEvent("whatsapp-qr", { detail: payload }));
        } else if (event.event === "channel.whatsapp.connection" && event.payload) {
          const payload = event.payload as { connected: boolean; channelId: string };
          window.dispatchEvent(new CustomEvent("whatsapp-connection", { detail: payload }));
        }
      },
    });
    return client;
  });

  const loadInitialData = async () => {
    if (!gatewayClient || !gatewayClient.isConnected()) {
      console.warn("Cannot load initial data: gateway not connected");
      return;
    }

    try {
      // Load agents
      const agentsResponse = await gatewayClient.request("agents.list");
      const agents = (agentsResponse.ok && agentsResponse.result 
        ? (agentsResponse.result as { agents: string[] }).agents 
        : []) || [];
      
      // Determine current agent ID
      let currentAgentId = state.currentAgentId;
      if (agents.length > 0 && (!currentAgentId || !agents.includes(currentAgentId))) {
        currentAgentId = agents[0];
      }

      // Load sessions
      const sessionsResult = await gatewayClient.request("sessions.list") as { 
        sessions?: Array<{
          id: string;
          label: string;
          type: "main" | "group" | "channel";
          agentId?: string;
        }>
      };
      
      // listSessions() returns Session[] directly, not SessionState[]
      const sessions = (sessionsResult?.sessions || []).map((session) => ({
        id: session.id,
        label: session.label || session.id,
        type: (session.type || "main") as "main" | "group" | "channel",
        agentId: session.agentId,
      }));

      let currentSessionId = state.currentSessionId;
      if (sessions.length > 0 && !currentSessionId) {
        currentSessionId = sessions[0].id;
      } else if (sessions.length === 0 && currentAgentId) {
        // Create default session
        await createSession("main", currentAgentId);
        return; // createSession will update state
      }

      setState((prev) => ({
        ...prev,
        agents,
        sessions,
        currentAgentId: currentAgentId || prev.currentAgentId,
        currentSessionId: currentSessionId || prev.currentSessionId,
      }));
    } catch (error) {
      console.error("Failed to load initial data:", error);
    }
  };

  const createSession = async (
    type: "main" | "group" | "channel",
    agentId: string,
    label?: string
  ) => {
    if (!gatewayClient || !gatewayClient.isConnected()) return;

    try {
      const response = await gatewayClient.request("sessions.create", {
        type,
        agentId,
        label: label || `session-${Date.now()}`,
      });
      if (!response.ok || !response.result) {
        throw new Error(response.error?.message || "Failed to create session");
      }
      const result = response.result as { session: {
        id: string;
        label: string;
        type: string;
        agentId?: string;
      } };

      const newSession = {
        id: result.session.id,
        label: result.session.label,
        type: result.session.type as "main" | "group" | "channel",
        agentId: result.session.agentId,
      };

      setState((prev) => ({
        ...prev,
        sessions: [...prev.sessions, newSession],
        currentSessionId: newSession.id,
      }));
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  };

  useEffect(() => {
    setState((prev) => ({ ...prev, gatewayClient }));
    
    // Only auto-connect if not in onboarding and not already connected/connecting
    if (!showOnboarding && !connectingRef.current && gatewayClient && !gatewayClient.isConnected()) {
      connectingRef.current = true;
      connect().finally(() => {
        connectingRef.current = false;
      });
    }

    // Cleanup on unmount
    return () => {
      if (gatewayClient) {
        gatewayClient.disconnect();
      }
      connectingRef.current = false;
    };
  }, [showOnboarding, gatewayClient]);

  // Subscribe to navigation changes
  useEffect(() => {
    const unsubscribe = navigation.subscribe((page) => {
      if (page === "home" || page === "settings" || page === "inspector") {
        setCurrentPage(page);
      }
    });
    return unsubscribe;
  }, []);

  // Handle menu actions from Electron
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleMenuAction = (action: string) => {
      switch (action) {
        case "new-session":
          handleSidebarAction("new-session", {});
          break;
        case "settings":
          navigation.navigate("settings");
          break;
        case "clear-conversation":
          handleMainContentAction("clear-conversation", {});
          break;
      }
    };

    window.electronAPI.onMenuAction(handleMenuAction);
    return () => {
      window.electronAPI.removeMenuListeners();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    // Don't connect if already connected or connecting
    if (!gatewayClient || gatewayClient.isConnected() || connectingRef.current) {
      return;
    }

    connectingRef.current = true;
    setState((prev) => ({ ...prev, connectionStatus: "connecting" }));
    try {
      await gatewayClient.connect();
    } catch (error) {
      console.error("Failed to connect:", error);
      setState((prev) => ({ ...prev, connectionStatus: "disconnected" }));
    } finally {
      connectingRef.current = false;
    }
  };

  const handleRetryConnection = () => {
    connect();
  };

  const handleSidebarAction = (action: string, data: any) => {
    switch (action) {
      case "select-session":
        setState((prev) => ({ ...prev, currentSessionId: data.sessionId }));
        break;
      case "select-agent":
        setState((prev) => ({ ...prev, currentAgentId: data.agentId }));
        break;
      case "new-session":
        if (state.currentAgentId) {
          createSession("main", state.currentAgentId);
        }
        break;
      case "restart-onboarding":
        // Clear onboarding completion and show onboarding
        localStorage.removeItem("zuckerman:onboarding:completed");
        localStorage.removeItem("zuckerman:onboarding");
        setShowOnboarding(true);
        break;
      case "show-inspector":
        navigation.navigate("inspector");
        break;
      case "show-settings":
        navigation.navigate("settings");
        break;
      case "navigate-home":
        navigation.navigate("home");
        break;
    }
  };

  const handleGatewayConfigChange = async (host: string, port: number) => {
    // Disconnect current client
    if (gatewayClient) {
      gatewayClient.disconnect();
    }
    
    // Create new client with new config
    const newClient = new GatewayClient({
      host,
      port,
      onConnect: () => {
        setState((prev) => ({ ...prev, connectionStatus: "connected" }));
        loadInitialData();
      },
      onDisconnect: () => {
        setState((prev) => ({ ...prev, connectionStatus: "disconnected" }));
      },
      onError: (error) => {
        console.error("Gateway error:", error);
      },
      onEvent: (event) => {
        if (event.event === "channel.whatsapp.qr" && event.payload) {
          const payload = event.payload as { qr: string; channelId: string };
          window.dispatchEvent(new CustomEvent("whatsapp-qr", { detail: payload }));
        } else if (event.event === "channel.whatsapp.connection" && event.payload) {
          const payload = event.payload as { connected: boolean; channelId: string };
          window.dispatchEvent(new CustomEvent("whatsapp-connection", { detail: payload }));
        }
      },
    });
    
    setState((prev) => ({ ...prev, gatewayClient: newClient }));
    
    // Attempt to connect with new config
    if (!showOnboarding) {
      setState((prev) => ({ ...prev, connectionStatus: "connecting" }));
      try {
        await newClient.connect();
      } catch (error) {
        console.error("Failed to connect:", error);
        setState((prev) => ({ ...prev, connectionStatus: "disconnected" }));
      }
    }
  };

  const handleMainContentAction = async (action: string, data: any) => {
    switch (action) {
      case "send-message":
        await sendMessage(data.message);
        break;
      case "clear-conversation":
        // Clear conversation logic
        break;
    }
  };

  const sendMessage = async (message: string) => {
    // Ensure gateway is connected
    if (!gatewayClient) {
      throw new Error("Gateway client not initialized");
    }

    if (!gatewayClient.isConnected()) {
      // Try to connect
      try {
        await gatewayClient.connect();
      } catch (error) {
        throw new Error("Failed to connect to gateway. Please check your connection.");
      }
    }

    // Ensure we have an agent
    let agentId = state.currentAgentId;
    if (!agentId) {
      // Try to load agents and select the first one
      try {
        const agentsResponse = await gatewayClient.request("agents.list");
        const agents = (agentsResponse.ok && agentsResponse.result 
          ? (agentsResponse.result as { agents: string[] }).agents 
          : []) || [];
        
        if (agents.length === 0) {
          throw new Error("No agents available. Please configure an agent first.");
        }
        
        agentId = agents[0];
        setState((prev) => ({ ...prev, currentAgentId: agentId }));
      } catch (error) {
        throw new Error("Failed to load agents. Please check your configuration.");
      }
    }

    // Ensure we have a session
    let sessionId = state.currentSessionId;
    if (!sessionId) {
      // Create a new session
      try {
        const response = await gatewayClient.request("sessions.create", {
          type: "main",
          agentId: agentId!,
          label: `session-${Date.now()}`,
        });
        
        if (!response.ok || !response.result) {
          throw new Error(response.error?.message || "Failed to create session");
        }
        
        const result = response.result as { session: {
          id: string;
          label: string;
          type: string;
          agentId?: string;
        } };
        
        sessionId = result.session.id;
        
        const newSession = {
          id: result.session.id,
          label: result.session.label,
          type: result.session.type as "main" | "group" | "channel",
          agentId: result.session.agentId,
        };
        
        setState((prev) => ({
          ...prev,
          sessions: [...prev.sessions, newSession],
          currentSessionId: sessionId,
        }));
      } catch (error) {
        throw new Error(`Failed to create session: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    try {
      const response = await gatewayClient.request("agent.run", {
        sessionId: sessionId!,
        agentId: agentId!,
        message,
      });
      if (!response.ok || !response.result) {
        throw new Error(response.error?.message || "Failed to run agent");
      }
      
      // The response contains the agent's reply, but we need to reload
      // the session to get all messages including the new ones
      // The MainContent component will handle reloading via polling
      return response.result;
    } catch (error) {
      console.error("Failed to send message:", error);
      throw error; // Re-throw so UI can handle it
    }
  };

  const handleOnboardingComplete = async (onboardingState: OnboardingState) => {
    // Save onboarding completion
    localStorage.setItem("zuckerman:onboarding:completed", "true");
    
    // Channel config is already saved during ChannelStep if WhatsApp was connected
    // For other channels, they'll need manual setup later
    
    // Update agent selection
    if (onboardingState.agent.agentId) {
      setState((prev) => ({ ...prev, currentAgentId: onboardingState.agent.agentId }));
    }
    
    // Close onboarding
    setShowOnboarding(false);
    
    // Try to connect to gateway after onboarding
    connect();
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem("zuckerman:onboarding:completed", "true");
    setShowOnboarding(false);
  };

  console.log("App rendering with state:", state);

  // Show onboarding as full page if not completed
  if (showOnboarding) {
    return (
      <OnboardingFlow
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
        gatewayClient={gatewayClient}
      />
    );
  }

  // Show connection error if disconnected and not in onboarding
  const showConnectionError = !showOnboarding && state.connectionStatus === "disconnected";

  return (
    <div 
      className="flex flex-col bg-background text-foreground overflow-hidden relative"
      style={{
        width: "100vw",
        height: "100vh",
        maxWidth: "100vw",
        maxHeight: "100vh",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      <TitleBar />
      {showConnectionError ? (
        <ConnectionError onRetry={handleRetryConnection} />
      ) : (
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          <Sidebar state={state} onAction={handleSidebarAction} />
          {currentPage === "settings" && (
            <SettingsPage
              gatewayClient={gatewayClient}
              onClose={() => navigation.navigate("home")}
              onGatewayConfigChange={handleGatewayConfigChange}
            />
          )}
          {currentPage === "inspector" && (
            <InspectorPage
              gatewayClient={gatewayClient}
              onClose={() => navigation.navigate("home")}
            />
          )}
          {currentPage === "home" && (
            <HomePage
              state={state}
              onMainContentAction={handleMainContentAction}
            />
          )}
        </div>
      )}
    </div>
  );
}
