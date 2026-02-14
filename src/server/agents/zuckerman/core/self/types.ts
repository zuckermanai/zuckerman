import type { AgentEvent } from "./events.js";

export interface BrainPart {
  id: string;
  name: string;
  maxIterations?: number;
  toolsAllowed?: boolean;
  temperature?: number;
  getPrompt: (workingMemory: string[]) => string;
}

export type EventHandler<T extends AgentEvent = AgentEvent> = (event: T) => void | Promise<void>;

export type Action = "respond" | "sleep" | "think";
