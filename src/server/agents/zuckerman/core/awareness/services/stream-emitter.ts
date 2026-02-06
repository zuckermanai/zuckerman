import type { StreamCallback, StreamEvent } from "@server/world/runtime/agents/types.js";
import type { TaskStep } from "../../planning/tactical/index.js";

export class StreamEventEmitter {
  constructor(private stream?: StreamCallback) {}

  async emitLifecycleStart(runId: string): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "lifecycle",
      data: {
        phase: "start",
        runId,
      },
    });
  }

  async emitLifecycleEnd(runId: string, tokensUsed?: number): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "lifecycle",
      data: {
        phase: "end",
        runId,
        tokensUsed,
      },
    });
  }

  async emitLifecycleError(runId: string, error: string): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "lifecycle",
      data: {
        phase: "error",
        error,
        runId,
      },
    });
  }

  async emitToken(runId: string, token: string): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "token",
      data: {
        token,
        runId,
      },
    });
  }


  async emitPlanMessage(runId: string, message: string): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "lifecycle",
      data: {
        runId,
        message,
      },
    });
  }

  async emitToolCall(tool: string, toolArgs: Record<string, unknown>): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "tool.call",
      data: {
        tool,
        toolArgs,
      },
    });
  }

  async emitToolResult(tool: string, toolResult: unknown): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "tool.result",
      data: {
        tool,
        toolResult,
      },
    });
  }

  async emitStepProgress(
    runId: string,
    step: TaskStep,
    progress: number,
    completed?: boolean
  ): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "lifecycle",
      data: {
        runId,
        step: {
          id: step.id,
          title: step.title,
          description: step.description,
          order: step.order,
          requiresConfirmation: step.requiresConfirmation,
          confirmationReason: step.confirmationReason,
          completed,
        },
        progress,
      },
    });
  }

  async emitStepConfirmation(runId: string, step: TaskStep): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "lifecycle",
      data: {
        runId,
        step: {
          id: step.id,
          title: step.title,
          requiresConfirmation: true,
          confirmationReason: step.confirmationReason,
        },
        confirmationRequired: true,
      },
    });
  }

  async emitStepFailure(
    runId: string,
    step: TaskStep,
    error: string,
    fallbackTask?: { id: string; title: string }
  ): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "lifecycle",
      data: {
        runId,
        step: {
          id: step.id,
          title: step.title,
          error,
        },
        fallbackTask,
      },
    });
  }

  async emitNextStep(runId: string, step: TaskStep, progress: number): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "lifecycle",
      data: {
        runId,
        step: {
          id: step.id,
          title: step.title,
          description: step.description,
          order: step.order,
          requiresConfirmation: step.requiresConfirmation,
          confirmationReason: step.confirmationReason,
        },
        progress,
      },
    });
  }

  async emitQueueUpdate(agentId: string, queueState: unknown): Promise<void> {
    if (!this.stream) return;
    await this.stream({
      type: "queue",
      data: {
        agentId,
        queue: queueState,
        timestamp: Date.now(),
      },
    });
  }

  createToolStream(): ((event: { type: string; data: { tool: string; toolArgs?: Record<string, unknown>; toolResult?: unknown } }) => void) | undefined {
    if (!this.stream) return undefined;
    return (event) => {
      this.stream!({
        type: event.type === "tool.call" ? "tool.call" : "tool.result",
        data: {
          tool: event.data.tool,
          toolArgs: event.data.toolArgs,
          toolResult: event.data.toolResult,
        },
      });
    };
  }
}
