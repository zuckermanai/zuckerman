export interface BrainPart {
  id: string;
  name: string;
  maxIterations?: number;
  toolsAllowed?: boolean;
  temperature?: number;
  getPrompt: (workingMemory: string[]) => string;
}
