import React from "react";
import { ChatView } from "./session/chat-view";
import { StatusBar } from "../../layout/status-bar";
import type { AppState } from "../../types/app-state";

interface HomePageProps {
  state: AppState;
  onMainContentAction: (action: string, data: any) => void;
}

export function HomePage({ state, onMainContentAction }: HomePageProps) {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div
        className="flex flex-1 overflow-hidden"
        style={{
          minHeight: 0,
        }}
      >
        <ChatView state={state} onAction={onMainContentAction} />
      </div>
      <StatusBar state={state} />
    </div>
  );
}
