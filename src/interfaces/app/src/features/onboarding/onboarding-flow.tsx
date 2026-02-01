import React, { useState, useEffect } from "react";
import { GatewayClient } from "../../core/gateway/client";
import { WelcomeStep } from "./steps/WelcomeStep";
import { LLMProviderStep } from "./steps/LLMProviderStep";
import { ChannelStep } from "./steps/ChannelStep";
import { AgentStep } from "./steps/AgentStep";
import { SecurityStep } from "./steps/SecurityStep";
import { TestStep } from "./steps/TestStep";
import { TitleBar } from "../../components/layout/title-bar";
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

const TOTAL_STEPS = 6;

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
      enabledTools: ["terminal", "browser", "filesystem", "cron", "device", "canvas"],
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
    } else {
      handleComplete();
    }
  };

  const prevStep = () => {
    if (state.currentStep > 1) {
      setState((prev) => ({ ...prev, currentStep: prev.currentStep - 1 }));
    }
  };

  const goToStep = (stepId: number) => {
    // Only allow going to previous steps or the next step if it's already been reached
    // This maintains the flow while allowing easy "go back"
    if (stepId < state.currentStep || stepId === state.currentStep) {
      setState((prev) => ({ ...prev, currentStep: stepId }));
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
      default:
        return null;
    }
  };

  const steps = [
    { id: 1, title: "Welcome" },
    { id: 2, title: "LLM Provider" },
    { id: 3, title: "Channel" },
    { id: 4, title: "Agent" },
    { id: 5, title: "Security" },
    { id: 6, title: "Final Test" },
  ];

  return (
    <div className="h-screen bg-[#0d1117] text-[#c9d1d9] flex flex-col font-sans overflow-hidden">
      <TitleBar />
      {/* GitHub Top Nav Style Header */}
      <header className="bg-[#161b22] border-b border-[#30363d] py-4 px-6 shrink-0">
        <div className="max-w-[1280px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
              <img src={logo} alt="Zuckerman" className="h-8 w-8" />
              <span className="font-semibold text-[16px]">Zuckerman</span>
            </div>
            <div className="h-5 w-[1px] bg-[#30363d] mx-2" />
            <span className="text-sm font-medium text-[#8b949e]">Onboarding</span>
          </div>
          <button
            onClick={handleSkip}
            className="text-xs font-medium text-[#8b949e] hover:text-[#58a6ff] transition-colors"
          >
            Skip setup
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-[#0d1117]">
        <div className="max-w-[1280px] mx-auto px-6 py-8 flex gap-8 min-h-full">
          {/* Sidebar Navigation */}
          <aside className="w-64 shrink-0 hidden md:block">
            <nav className="space-y-0.5 sticky top-0">
              <div className="px-3 mb-2">
                <h3 className="text-xs font-semibold text-[#8b949e] uppercase tracking-wider">
                  Setup Steps
                </h3>
              </div>
              {steps.map((step) => {
                const isActive = step.id === state.currentStep;
                const isCompleted = step.id < state.currentStep;
                const isNavigable = step.id <= state.currentStep;
                
                return (
                  <button
                    key={step.id}
                    onClick={() => goToStep(step.id)}
                    disabled={!isNavigable}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors text-left ${
                      isActive 
                        ? "bg-[#1f6feb] text-white font-medium" 
                        : isNavigable
                        ? "text-[#c9d1d9] hover:bg-[#21262d] cursor-pointer"
                        : "text-[#8b949e] cursor-not-allowed opacity-50"
                    }`}
                  >
                    <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] border shrink-0 ${
                      isActive 
                        ? "border-white bg-white/20" 
                        : isCompleted 
                        ? "border-[#3fb950] bg-[#3fb950]/10 text-[#3fb950]" 
                        : "border-[#30363d]"
                    }`}>
                      {isCompleted ? "✓" : step.id}
                    </div>
                    {step.title}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Step Content */}
          <div className="flex-1 min-w-0">
            <div className="bg-[#0d1117] pb-12">
              {renderStep()}
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-[#0d1117] border-t border-[#30363d] py-6 px-6 shrink-0">
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-[12px] text-[#8b949e]">
          <div className="flex items-center gap-4">
            <span>© 2026 Zuckerman</span>
            <a href="#" className="hover:text-[#58a6ff]">Terms</a>
            <a href="#" className="hover:text-[#58a6ff]">Privacy</a>
            <a href="#" className="hover:text-[#58a6ff]">Security</a>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#3fb950]" />
              Systems Operational
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
