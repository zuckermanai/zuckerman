import React, { useState, useEffect } from "react";
import { GatewayClient } from "../../infrastructure/gateway/client";
import { WelcomeStep } from "./steps/WelcomeStep";
import { LLMProviderStep } from "./steps/LLMProviderStep";
import { ChannelStep } from "./steps/ChannelStep";
import { AgentStep } from "./steps/AgentStep";
import { SecurityStep } from "./steps/SecurityStep";
import { TestStep } from "./steps/TestStep";
import { CompleteStep } from "./steps/CompleteStep";
import logo from "@/assets/logo.png";

export interface OnboardingState {
  currentStep: number;
  gateway: {
    host: string;
    port: number;
    connected: boolean;
    error?: string;
  };
  llmProvider: {
    provider: "anthropic" | "openai" | "openrouter" | "mock" | null;
    apiKey: string;
    validated: boolean;
    error?: string;
  };
  channel: {
    type: "whatsapp" | "telegram" | "discord" | "slack" | "signal" | "imessage" | "none";
    connected: boolean;
    qrCode: string | null;
  };
  agent: {
    agentId: string | null;
    agents: string[];
  };
  security: {
    sandboxMode: "off" | "non-main" | "all";
    enabledTools: string[];
    deniedCommands: string;
  };
  testResults: {
    gateway: boolean;
    llmProvider: boolean;
    agent: boolean;
    session: boolean;
  };
}

const TOTAL_STEPS = 7;

interface OnboardingProps {
  onComplete: (state: OnboardingState) => void;
  onSkip: () => void;
  gatewayClient: GatewayClient | null;
}

export function OnboardingFlow({ onComplete, onSkip, gatewayClient }: OnboardingProps) {
  const [state, setState] = useState<OnboardingState>({
    currentStep: 1,
    gateway: {
      host: "127.0.0.1",
      port: 18789,
      connected: true, // Gateway connection is handled automatically by the app
    },
    llmProvider: {
      provider: null,
      apiKey: "",
      validated: false,
    },
    channel: {
      type: "none",
      connected: false,
      qrCode: null,
    },
    agent: {
      agentId: null,
      agents: [],
    },
    security: {
      sandboxMode: "all",
      enabledTools: ["terminal", "browser", "canvas"],
      deniedCommands: "rm,sudo,format",
    },
    testResults: {
      gateway: false,
      llmProvider: false,
      agent: false,
      session: false,
    },
  });

  // Load saved state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("zuckerman:onboarding");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState((prev) => ({ ...prev, ...parsed }));
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, []);

  // Save state to localStorage
  useEffect(() => {
    localStorage.setItem("zuckerman:onboarding", JSON.stringify(state));
  }, [state]);

  const updateState = (updates: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const nextStep = () => {
    if (state.currentStep < TOTAL_STEPS) {
      setState((prev) => ({ ...prev, currentStep: prev.currentStep + 1 }));
    }
  };

  const prevStep = () => {
    if (state.currentStep > 1) {
      setState((prev) => ({ ...prev, currentStep: prev.currentStep - 1 }));
    }
  };

  const handleComplete = () => {
    localStorage.removeItem("zuckerman:onboarding");
    onComplete(state);
  };

  const handleSkip = () => {
    localStorage.removeItem("zuckerman:onboarding");
    onSkip();
  };

  const renderStep = () => {
    switch (state.currentStep) {
      case 1:
        return <WelcomeStep onNext={nextStep} onSkip={handleSkip} />;
      case 2:
        return (
          <LLMProviderStep
            state={state}
            onUpdate={updateState}
            onNext={nextStep}
            onBack={prevStep}
            gatewayClient={gatewayClient}
          />
        );
      case 3:
        return (
          <ChannelStep
            state={state}
            onUpdate={updateState}
            onNext={nextStep}
            onBack={prevStep}
            gatewayClient={gatewayClient}
          />
        );
      case 4:
        return (
          <AgentStep
            state={state}
            onUpdate={updateState}
            onNext={nextStep}
            onBack={prevStep}
            gatewayClient={gatewayClient}
          />
        );
      case 5:
        return (
          <SecurityStep
            state={state}
            onUpdate={updateState}
            onNext={nextStep}
            onBack={prevStep}
          />
        );
      case 6:
        return (
          <TestStep
            state={state}
            onUpdate={updateState}
            onNext={nextStep}
            onBack={prevStep}
            gatewayClient={gatewayClient}
          />
        );
      case 7:
        return <CompleteStep state={state} onComplete={handleComplete} onBack={prevStep} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Zuckerman" className="h-6 w-6" />
              <div className="text-xl font-semibold">Zuckerman</div>
              <div className="h-4 w-px bg-border" />
              <span className="text-sm text-muted-foreground">
                Step {state.currentStep} of {TOTAL_STEPS}
              </span>
            </div>
            <button
              onClick={handleSkip}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip setup
            </button>
          </div>
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex gap-1.5">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
                const stepNum = i + 1;
                const isActive = stepNum === state.currentStep;
                const isComplete = stepNum < state.currentStep;
                return (
                  <div
                    key={stepNum}
                    className={`h-1 flex-1 rounded-full transition-all ${
                      isActive
                        ? "bg-primary"
                        : isComplete
                        ? "bg-primary/40"
                        : "bg-border"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-12">
          <div className="max-w-2xl mx-auto">
            {renderStep()}
          </div>
        </div>
      </div>
    </div>
  );
}
