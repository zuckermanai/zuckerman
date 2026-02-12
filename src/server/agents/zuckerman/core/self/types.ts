export interface BrainPart {
  id: string;
  name: string;
  maxIterations?: number;
  toolsAllowed?: boolean;
  getPrompt: (workingMemory: string[]) => string;
}
