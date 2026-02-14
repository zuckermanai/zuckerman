import React, { useEffect } from "react";
import { MemoryRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { useApp } from "./hooks/use-app";
import { GatewayProvider } from "./core/gateway/gateway-provider";
import { AppSidebar } from "./components/layout/sidebar";
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";
import { TitleBar } from "./components/layout/title-bar";
import { OnboardingFlow } from "./features/onboarding/onboarding-flow";
import { ConnectionError } from "./features/gateway/connection-error";
import { SettingsPage } from "./features/home/settings/settings-page";
import { InspectorPage } from "./features/home/inspector-page";
import { AgentPage } from "./features/home/agent/agent-page";
import { CalendarPage } from "./features/home/calendar/calendar-page";

declare global {
  interface Window {
    platform?: {
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
    };
  }
}


function AppContent() {
  return (
    <GatewayProvider>
      <AppContentWithContext />
    </GatewayProvider>
  );
}

function AppContentWithContext() {
  const app = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const showConnectionError = app.connectionStatus === "disconnected";

  return (
    <AppRoutes app={app} navigate={navigate} location={location} showConnectionError={showConnectionError} />
  );
}

function AppRoutes({ app, navigate, location, showConnectionError }: {
  app: ReturnType<typeof useApp>;
  navigate: ReturnType<typeof useNavigate>;
  location: ReturnType<typeof useLocation>;
  showConnectionError: boolean;
}) {

  // Redirect to agent page by default when agent is selected
  useEffect(() => {
    if (
      !showConnectionError &&
      !app.showOnboarding &&
      app.currentAgentId &&
      !location.pathname.startsWith("/agent/") &&
      location.pathname !== "/settings" &&
      location.pathname !== "/inspector" &&
      location.pathname !== "/calendar"
    ) {
      navigate(`/agent/${app.currentAgentId}`, { replace: true });
    }
  }, [app.currentAgentId, location.pathname, navigate, showConnectionError, app.showOnboarding]);

  if (app.showOnboarding) {
    return (
      <OnboardingFlow
        onComplete={app.handleOnboardingComplete}
        onSkip={app.handleOnboardingSkip}
        gatewayClient={app.gatewayClient}
      />
    );
  }

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
        <ConnectionError onRetry={app.handleRetryConnection} />
      ) : (
        <SidebarProvider className="flex-1 min-h-0 overflow-hidden">
          <AppSidebar
            state={app}
            activeConversationIds={app.activeConversationIds}
            onAction={app.handleSidebarAction}
          />
          <SidebarInset className="flex flex-col min-h-0 overflow-hidden">
            <Routes>
              <Route
                path="/"
                element={
                  app.currentAgentId ? (
                    <AgentPage
                      state={app}
                      gatewayClient={app.gatewayClient}
                      onClose={() => navigate("/")}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <p className="text-muted-foreground">Select an agent to get started</p>
                      </div>
                    </div>
                  )
                }
              />
              <Route 
                path="/settings" 
                element={
                  <SettingsPage
                    gatewayClient={app.gatewayClient}
                    onClose={() => app.handleSidebarAction("navigate-home", {})}
                  />
                } 
              />
              <Route 
                path="/inspector" 
                element={
                  <InspectorPage
                    gatewayClient={app.gatewayClient}
                    onClose={() => app.handleSidebarAction("navigate-home", {})}
                  />
                } 
              />
              <Route 
                path="/calendar" 
                element={
                  <CalendarPage
                    onClose={() => app.handleSidebarAction("navigate-home", {})}
                  />
                } 
              />
              <Route 
                path="/agent/:agentId" 
                element={
                  <AgentPage
                    state={app}
                    gatewayClient={app.gatewayClient}
                    onClose={() => app.handleSidebarAction("navigate-home", {})}
                  />
                } 
              />
            </Routes>
          </SidebarInset>
        </SidebarProvider>
      )}
    </div>
  );
}

export default function App() {
  console.log("App component rendering...");

  return (
    <MemoryRouter>
      <AppContent />
    </MemoryRouter>
  );
}
