import type { StreamCallback, StreamEvent } from "@server/world/runtime/agents/types.js";

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
