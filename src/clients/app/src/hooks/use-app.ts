import { useEffect, useCallback, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useGateway } from "./use-gateway";
import { useAgents } from "./use-agents";
import { useChat } from "./use-chat";
import { useGatewayContext } from "../core/gateway/use-gateway-context";
import { removeStorageItem, getStorageItem, setStorageItem } from "../core/storage/local-storage";
import type { OnboardingState } from "../features/onboarding/onboarding-flow";
import type { AppState } from "../types/app-state";

export interface UseAppReturn extends AppState {
  // Actions
  setCurrentAgentId: (agentId: string | null) => void;
  setCurrentConversationId: (conversationId: string | null) => void;
  createConversation: (type: "main" | "group" | "channel", agentId: string, label?: string) => Promise<void>;
  connect: () => Promise<void>;

  // Chat feature
  activeConversationIds: Set<string>;
  addToActiveConversations: (conversationId: string) => void;
  removeFromActiveConversations: (conversationId: string) => void;
  messages: import("../types/message").Message[];
  isSending: boolean;
  sendMessage: (message: string) => Promise<void>;
  loadMessages: () => Promise<void>;

  // UI Actions
  handleSidebarAction: (action: string, data: any) => void;
  handleMainContentAction: (action: string, data: any) => Promise<void>;
  handleRetryConnection: () => void;

  // Onboarding
  showOnboarding: boolean;
  handleOnboardingComplete: (onboardingState: OnboardingState) => Promise<void>;
  handleOnboardingSkip: () => void;
}

/**
 * Consolidated hook for app orchestration:
 * - Gateway connection
 * - Agents management
 * - Chat feature (conversations + messages + active conversations)
 * - UI actions (sidebar, menu, navigation)
 * - Onboarding flow
 */
export function useApp(): UseAppReturn {
  const navigate = useNavigate();
  const location = useLocation();

  // Get gateway client from context (for components that still need it)
  const { gatewayClient } = useGatewayContext();

  // Gateway actions and server management
  const {
    connectionStatus,
    connect,
  } = useGateway();

  // Agents
  const { agents, currentAgentId, setCurrentAgentId, loadAgents } = useAgents();

  // Chat feature (conversations + messages + active conversations)
  const {
    conversations,
    currentConversationId,
    setCurrentConversationId,
    createConversation,
    activeConversationIds,
    addToActiveConversations,
    removeFromActiveConversations,
    messages,
    isSending,
    sendMessage,
    loadMessages,
  } = useChat(currentAgentId, currentAgentId);

  // Onboarding state
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !getStorageItem<string>("zuckerman:onboarding:completed", "");
  });

  // Auto-connect when gateway is ready (only if not explicitly stopped)
  useEffect(() => {
    const isExplicitlyStopped = localStorage.getItem("zuckerman:gateway:explicitly-stopped") === "true";
    if (isExplicitlyStopped) {
      return; // Don't auto-connect if gateway was explicitly stopped
    }

    if (connectionStatus === "disconnected") {
      connect();
    }
  }, [connectionStatus, connect]);

  // Reconnect on mount/remount (handles HMR) - only if not explicitly stopped
  useEffect(() => {
    const isExplicitlyStopped = localStorage.getItem("zuckerman:gateway:explicitly-stopped") === "true";
    if (isExplicitlyStopped) {
      return; // Don't auto-connect if gateway was explicitly stopped
    }

    const timeoutId = setTimeout(() => {
      if (connectionStatus === "disconnected") {
        connect();
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [connectionStatus, connect]);

  // Load agents when connected (handled by useAgents hook via context)
  // This effect is kept for explicit manual loading if needed
  useEffect(() => {
    if (connectionStatus === "connected") {
      // Small delay to ensure connection is fully established
      const timeoutId = setTimeout(() => {
        loadAgents().catch((error) => {
          console.error("[App] Failed to load agents after connection:", error);
        });
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [connectionStatus, loadAgents]);

  // Load conversations when agent is selected
  useEffect(() => {
    if (connectionStatus === "connected" && currentAgentId) {
      if (conversations.length === 0) {
        createConversation("main", currentAgentId).catch(console.error);
      }
    }
  }, [connectionStatus, currentAgentId, conversations.length, createConversation]);

  // UI Actions
  const handleRetryConnection = useCallback(() => {
    connect();
  }, [connect]);

  const handleSidebarAction = useCallback(
    (action: string, data: any) => {
      switch (action) {
          case "select-agent":
          setCurrentAgentId(data.agentId);
          navigate(`/agent/${data.agentId}`);
          break;
        case "restart-onboarding":
          removeStorageItem("zuckerman:onboarding:completed");
          removeStorageItem("zuckerman:onboarding");
          window.location.reload();
          break;
        case "show-inspector":
          navigate("/inspector");
          break;
        case "show-settings":
          navigate("/settings");
          break;
        case "show-calendar":
          navigate("/calendar");
          break;
        case "navigate-home":
          navigate("/");
          break;
      }
    },
    [
      setCurrentConversationId,
      addToActiveConversations,
      removeFromActiveConversations,
      activeConversationIds,
      currentConversationId,
      setCurrentAgentId,
      currentAgentId,
      createConversation,
      navigate,
      location.pathname,
    ]
  );

  const handleMainContentAction = useCallback(async (action: string, data: any) => {
    switch (action) {
      case "send-message":
        // Handled by useChat hook
        break;
      case "clear-conversation":
        // Clear conversation logic
        break;
    }
  }, []);

  // Electron menu actions
  useEffect(() => {
    if (!window.electronAPI) return;

    const handleMenuAction = (action: string) => {
      switch (action) {
        case "new-conversation":
          handleSidebarAction("new-conversation", {});
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSidebarAction, handleMainContentAction, navigate]);

  // Onboarding handlers
  const handleOnboardingComplete = useCallback(
    async (onboardingState: OnboardingState) => {
      setStorageItem("zuckerman:onboarding:completed", "true");

      // Save API keys if LLM provider is configured
      if (
        window.electronAPI &&
        onboardingState.llmProvider.provider &&
        onboardingState.llmProvider.provider !== "mock" &&
        onboardingState.llmProvider.apiKey
      ) {
        const keys: { anthropic?: string; openai?: string; openrouter?: string } = {};
        if (onboardingState.llmProvider.provider === "anthropic") {
          keys.anthropic = onboardingState.llmProvider.apiKey;
        } else if (onboardingState.llmProvider.provider === "openai") {
          keys.openai = onboardingState.llmProvider.apiKey;
        } else if (onboardingState.llmProvider.provider === "openrouter") {
          keys.openrouter = onboardingState.llmProvider.apiKey;
        }

        try {
          await window.electronAPI.saveApiKeys(keys);
        } catch (error) {
          console.error("[Onboarding] Error saving API keys:", error);
        }
      }

      if (onboardingState.agent.agentId) {
        setCurrentAgentId(onboardingState.agent.agentId);
      }

      setShowOnboarding(false);
      connect();
    },
    [setCurrentAgentId, connect]
  );

  const handleOnboardingSkip = useCallback(() => {
    setStorageItem("zuckerman:onboarding:completed", "true");
    setShowOnboarding(false);
  }, []);

  return {
    currentConversationId,
    currentAgentId,
    conversations,
    agents,
    connectionStatus,
    gatewayClient, // Still needed by some components (OnboardingFlow, SettingsPage, etc.)
    setCurrentAgentId,
    setCurrentConversationId,
    createConversation,
    connect,
    activeConversationIds,
    addToActiveConversations,
    removeFromActiveConversations,
    messages,
    isSending,
    sendMessage,
    loadMessages,
    handleSidebarAction,
    handleMainContentAction,
    handleRetryConnection,
    showOnboarding,
    handleOnboardingComplete,
    handleOnboardingSkip,
  };
}
