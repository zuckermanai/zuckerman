import React, { useState, useEffect, useRef, useCallback } from "react";
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useAppState } from "./hooks/use-app-state";
import { Sidebar } from "./layout/sidebar";
import { TitleBar } from "./layout/title-bar";
import { OnboardingFlow } from "./features/onboarding/onboarding-flow";
import { ConnectionError } from "./features/gateway/connection-error";
import { HomePage } from "./features/home/home-page";
import { SettingsPage } from "./features/home/settings/settings-page";
import { InspectorPage } from "./features/home/inspector-page";
import type { OnboardingState } from "./features/onboarding/onboarding-flow";
import { removeStorageItem, setStorageItem } from "./infrastructure/storage/local-storage";

declare global {
  interface Window {
    platform?: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
    };
  }
}

interface ResizableSidebarProps {
  width: number;
  onWidthChange: (width: number) => void;
  children: React.ReactNode;
  minWidth?: number;
  maxWidth?: number;
}

function ResizableSidebar({ 
  width, 
  onWidthChange, 
  children, 
  minWidth = 200, 
  maxWidth = 800 
}: ResizableSidebarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidthRef.current + deltaX));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, minWidth, maxWidth, onWidthChange]);

  return (
    <div 
      ref={sidebarRef}
      className="relative flex shrink-0"
      style={{ width: `${width}px` }}
    >
      {children}
      {/* Drag handle - wider for easier grabbing */}
      <div
        onMouseDown={handleMouseDown}
        className={`
          absolute right-0 top-0 bottom-0 cursor-col-resize
          hover:bg-primary/40 transition-colors
          ${isDragging ? 'bg-primary/60' : 'bg-transparent'}
        `}
        style={{ 
          zIndex: 10,
          width: '4px',
          marginRight: '-2px' // Extend slightly beyond edge for easier grabbing
        }}
        title="Drag to resize sidebar"
      />
    </div>
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem("zuckerman:sidebar:width");
    return stored ? parseInt(stored, 10) : 240;
  });

  const state = useAppState();

  // Manage active sessions state (lifted up from Sidebar)
  const [activeSessionIds, setActiveSessionIds] = useState<Set<string>>(() => {
    const stored = localStorage.getItem("zuckerman:active-sessions");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? new Set(parsed) : new Set();
      } catch {
        return new Set<string>();
      }
    }
    // If no stored active sessions, use currentSessionId as default
    return state.currentSessionId ? new Set([state.currentSessionId]) : new Set<string>();
  });

  // Sync currentSessionId with active sessions on mount/change
  useEffect(() => {
    if (state.currentSessionId) {
      setActiveSessionIds((prev) => {
        if (prev.has(state.currentSessionId!)) return prev;
        const updated = new Set(prev);
        updated.add(state.currentSessionId!);
        return updated;
      });
    }
  }, [state.currentSessionId]);

  // Persist active sessions to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem("zuckerman:active-sessions", JSON.stringify(Array.from(activeSessionIds)));
  }, [activeSessionIds]);

  // Handlers for active sessions management
  const addToActiveSessions = useCallback((sessionId: string) => {
    setActiveSessionIds((prev) => {
      if (prev.has(sessionId)) return prev;
      const updated = new Set(prev);
      updated.add(sessionId);
      return updated;
    });
  }, []);

  const removeFromActiveSessions = useCallback((sessionId: string) => {
    setActiveSessionIds((prev) => {
      if (!prev.has(sessionId)) return prev;
      const updated = new Set(prev);
      updated.delete(sessionId);
      return updated;
    });
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
          navigate("/settings");
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

  const handleRetryConnection = () => {
    state.connect();
  };

  const handleSidebarAction = (action: string, data: any) => {
    switch (action) {
      case "select-session":
        state.setCurrentSessionId(data.sessionId);
        addToActiveSessions(data.sessionId);
        if (location.pathname !== "/") {
          navigate("/");
        }
        break;
      case "restore-session":
        state.setCurrentSessionId(data.sessionId);
        addToActiveSessions(data.sessionId);
        if (location.pathname !== "/") {
          navigate("/");
        }
        break;
      case "archive-session":
        removeFromActiveSessions(data.sessionId);
        // If this was the current session, switch to another active session or null
        if (data.sessionId === state.currentSessionId) {
          const remainingActive = Array.from(activeSessionIds).filter(id => id !== data.sessionId);
          const nextActive = remainingActive.length > 0 ? remainingActive[0] : null;
          state.setCurrentSessionId(nextActive);
        }
        break;
      case "select-agent":
        state.setCurrentAgentId(data.agentId);
        if (location.pathname !== "/") {
          navigate("/");
        }
        break;
      case "new-session":
        if (state.currentAgentId) {
          // createSession automatically sets currentSessionId, so it will be added via select-session
          // But we also need to ensure it's added to active sessions
          state.createSession("main", state.currentAgentId).catch(console.error);
          if (location.pathname !== "/") {
            navigate("/");
          }
        }
        break;
      case "restart-onboarding":
        removeStorageItem("zuckerman:onboarding:completed");
        removeStorageItem("zuckerman:onboarding");
        // This will be handled by parent App component
        window.location.reload();
        break;
      case "show-inspector":
        navigate("/inspector");
        break;
      case "show-settings":
        navigate("/settings");
        break;
      case "navigate-home":
        navigate("/");
        break;
    }
  };

  const handleMainContentAction = async (action: string, data: any) => {
    switch (action) {
      case "send-message":
        // Handled by useMessages hook in ChatView
        break;
      case "clear-conversation":
        // Clear conversation logic
        break;
    }
  };

  // Show connection error if disconnected
  const showConnectionError = state.connectionStatus === "disconnected";

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
        backgroundColor: 'hsl(var(--background))',
      }}
    >
      <TitleBar />
      {showConnectionError ? (
        <ConnectionError onRetry={handleRetryConnection} />
      ) : (
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          <ResizableSidebar 
            width={sidebarWidth} 
            onWidthChange={(width) => {
              setSidebarWidth(width);
              localStorage.setItem("zuckerman:sidebar:width", String(width));
            }}
          >
            <Sidebar 
              state={state} 
              activeSessionIds={activeSessionIds}
              onAction={handleSidebarAction} 
            />
          </ResizableSidebar>
          <Routes>
            <Route path="/" element={<HomePage state={state} onMainContentAction={handleMainContentAction} />} />
            <Route 
              path="/settings" 
              element={
                <SettingsPage
                  gatewayClient={state.gatewayClient}
                  onClose={() => navigate("/")}
                  onGatewayConfigChange={state.updateGatewayConfig}
                />
              } 
            />
            <Route 
              path="/inspector" 
              element={
                <InspectorPage
                  gatewayClient={state.gatewayClient}
                  onClose={() => navigate("/")}
                />
              } 
            />
          </Routes>
        </div>
      )}
    </div>
  );
}

export default function App() {
  console.log("App component rendering...");

  const [showOnboarding, setShowOnboarding] = useState(() => {
    const completed = localStorage.getItem("zuckerman:onboarding:completed");
    return !completed;
  });

  const state = useAppState();

  const handleOnboardingComplete = async (onboardingState: OnboardingState) => {
    setStorageItem("zuckerman:onboarding:completed", "true");

    // Update agent selection
    if (onboardingState.agent.agentId) {
      state.setCurrentAgentId(onboardingState.agent.agentId);
    }

    // Close onboarding
    setShowOnboarding(false);

    // Try to connect to gateway after onboarding
    state.connect();
  };

  const handleOnboardingSkip = () => {
    setStorageItem("zuckerman:onboarding:completed", "true");
    setShowOnboarding(false);
  };

  // Show onboarding as full page if not completed
  if (showOnboarding) {
    return (
      <OnboardingFlow
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
        gatewayClient={state.gatewayClient}
      />
    );
  }

  return (
    <MemoryRouter>
      <AppContent />
    </MemoryRouter>
  );
}
