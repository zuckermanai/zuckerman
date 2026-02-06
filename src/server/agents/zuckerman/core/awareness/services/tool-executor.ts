import type { LLMMessage, LLMTool } from "@server/world/providers/llm/types.js";
import type { SecurityContext } from "@server/world/execution/security/types.js";
import type { ConversationId } from "@server/agents/zuckerman/conversations/types.js";
import type { ToolExecutionContext, ToolResult } from "@server/agents/zuckerman/tools/terminal/index.js";
import { truncateOutput } from "@server/agents/zuckerman/tools/truncation.js";
import { activityRecorder } from "@server/world/activity/index.js";
import type { ZuckermanToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import type { PlanningManager } from "../../planning/index.js";
import type { StreamEventEmitter } from "./stream-emitter.js";
import type { LLMService } from "./llm-service.js";

export interface ToolExecutionParams {
  conversationId: ConversationId;
  runId: string;
  messages: LLMMessage[];
  toolCalls: any[];
  securityContext: SecurityContext;
  temperature?: number;
  llmTools: LLMTool[];
  homedir: string;
  agentId: string;
}

export interface ToolExecutionResult {
  runId: string;
  response: string;
  tokensUsed?: number;
}

export class ToolExecutor {
  constructor(
    private agentId: string,
    private toolRegistry: ZuckermanToolRegistry,
    private planningManager: PlanningManager,
    private streamEmitter: StreamEventEmitter,
    private llmService: LLMService
  ) {}

  async execute(params: ToolExecutionParams): Promise<ToolExecutionResult> {
    const {
      conversationId,
      runId,
      messages,
      toolCalls,
      securityContext,
      temperature,
      llmTools,
      homedir,
    } = params;

    // Add assistant message with tool calls to history
    messages.push({
      role: "assistant",
      content: "",
      toolCalls,
    });

    // Check if current step requires confirmation
    const currentStep = this.planningManager.getCurrentStep();
    if (currentStep?.requiresConfirmation) {
      await this.streamEmitter.emitStepConfirmation(runId, currentStep);
      // Note: In a real implementation, we'd wait for user confirmation here
      // For now, we proceed automatically (can be enhanced later)
    }

    // Execute tools
    const toolCallResults = await this.executeTools(
      toolCalls,
      conversationId,
      runId,
      securityContext,
      homedir
    );

    // Add tool results to messages
    for (const result of toolCallResults) {
      messages.push(result);
    }

    // Run LLM again with tool results
    let result;
    try {
      result = await this.llmService.call({
        messages,
        temperature,
        tools: llmTools,
      });
    } catch (err) {
      // If LLM call fails, mark task as failed
      const currentTask = this.planningManager.getCurrentTask();
      if (currentTask) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await this.planningManager.failCurrentTask(errorMessage);
        await this.streamEmitter.emitQueueUpdate(this.agentId, this.planningManager.getQueueState());
      }
      throw err; // Re-throw to be caught by outer catch
    }

    // Handle nested tool calls (recursive)
    if (result.toolCalls && result.toolCalls.length > 0) {
      return await this.execute({
        ...params,
        toolCalls: result.toolCalls,
      });
    }

    // Check if task should be completed (no more tool calls, task is done)
    const taskCompleted = await this.planningManager.checkAndCompleteTaskIfDone(
      result.content,
      !!result.toolCalls,
      conversationId
    );

    // Emit queue update event if task was completed
    if (taskCompleted) {
      await this.streamEmitter.emitQueueUpdate(this.agentId, this.planningManager.getQueueState());
    }

    // Emit lifecycle end event
    await this.streamEmitter.emitLifecycleEnd(runId, result.tokensUsed?.total);

    // Record agent run completion (from tool calls path)
    await activityRecorder.recordAgentRunComplete(
      this.agentId,
      conversationId,
      runId,
      result.content,
      result.tokensUsed?.total,
      undefined, // toolsUsed will be tracked separately
    );

    return {
      runId,
      response: result.content,
      tokensUsed: result.tokensUsed?.total,
    };
  }

  private async executeTools(
    toolCalls: any[],
    conversationId: ConversationId,
    runId: string,
    securityContext: SecurityContext,
    homedir: string
  ): Promise<Array<{ toolCallId: string; role: "tool"; content: string }>> {
    const toolCallResults = [];

    for (const toolCall of toolCalls) {
      // Try to get tool with repair (fixes case mismatches)
      const toolResult = this.toolRegistry.getWithRepair(toolCall.name);

      if (!toolResult) {
        // Tool not found - provide helpful error with suggestions
        const suggestions = this.toolRegistry.findSimilar(toolCall.name, 3);
        const suggestionText = suggestions.length > 0
          ? ` Did you mean: ${suggestions.join(", ")}?`
          : "";

        toolCallResults.push({
          toolCallId: toolCall.id,
          role: "tool" as const,
          content: `Error: Tool "${toolCall.name}" not found.${suggestionText} Available tools: ${this.toolRegistry.list().map(t => t.definition.name).join(", ")}`,
        });
        continue;
      }

      const { tool, repaired, originalName } = toolResult;

      // Log repair if it happened
      if (repaired && originalName !== tool.definition.name) {
        console.log(`[ToolRepair] Fixed tool name: "${originalName}" -> "${tool.definition.name}"`);
      }

      try {
        // Parse arguments
        const args = typeof toolCall.arguments === "string"
          ? JSON.parse(toolCall.arguments)
          : toolCall.arguments;

        // Emit tool start event
        await this.streamEmitter.emitToolCall(tool.definition.name, args);

        // Record tool call
        await activityRecorder.recordToolCall(
          this.agentId,
          conversationId,
          runId,
          tool.definition.name,
          args,
        );

        // Create execution context for tool
        const executionContext: ToolExecutionContext = {
          conversationId,
          homedir,
          stream: this.streamEmitter.createToolStream(),
        };

        // Execute tool
        let result = await tool.handler(args, securityContext, executionContext);

        // Truncate large results to fit within context limits
        result = await this.truncateResult(result);

        // Emit tool end event
        await this.streamEmitter.emitToolResult(tool.definition.name, result);

        // Record tool result
        await activityRecorder.recordToolResult(
          this.agentId,
          conversationId,
          runId,
          tool.definition.name,
          result,
        );

        // Track step progress after tool execution
        await this.handleStepProgress(result, conversationId, runId);

        // Convert result to string for LLM
        const resultContent = this.formatResultForLLM(result);

        toolCallResults.push({
          toolCallId: toolCall.id,
          role: "tool" as const,
          content: resultContent,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);

        // Record tool error
        await activityRecorder.recordToolError(
          this.agentId,
          conversationId,
          runId,
          toolCall.name,
          errorMsg,
        );

        toolCallResults.push({
          toolCallId: toolCall.id,
          role: "tool" as const,
          content: `Error executing tool: ${errorMsg}`,
        });
      }
    }

    return toolCallResults;
  }

  private async truncateResult(result: ToolResult): Promise<ToolResult> {
    // Truncate large results to fit within context limits
    // Skip truncation if result already indicates it was truncated
    if (result && typeof result === "object" && "success" in result && result.success) {
      const resultData = (result as { result?: unknown }).result;
      if (resultData && typeof resultData === "object" && "content" in resultData) {
        const content = (resultData as { content: unknown }).content;
        if (typeof content === "string" && content.length > 0) {
          // Check if content is already truncated (has truncation metadata)
          const isAlreadyTruncated = "truncated" in resultData && (resultData as { truncated?: boolean }).truncated === true;

          if (!isAlreadyTruncated) {
            const truncated = await truncateOutput(content);
            if (truncated.truncated) {
              // Update result with truncated content
              return {
                ...result,
                result: {
                  ...resultData,
                  content: truncated.content,
                  truncated: true,
                },
              };
            }
          }
        }
      }
    }
    return result;
  }

  private async handleStepProgress(
    result: unknown,
    conversationId: ConversationId,
    runId: string
  ): Promise<void> {
    const currentStep = this.planningManager.getCurrentStep();
    if (!currentStep) return;

    // Check if tool execution was successful
    const isSuccess = typeof result === "object" && result && "success" in result
      ? (result as { success?: boolean }).success !== false
      : true;

    if (isSuccess) {
      // Complete current step on successful tool execution
      this.planningManager.completeCurrentStep(result, conversationId);

      // Stream step completion and progress
      const steps = this.planningManager.getSteps();
      const progress = steps.length > 0
        ? Math.round((steps.filter(s => s.completed).length / steps.length) * 100)
        : 0;

      await this.streamEmitter.emitStepProgress(runId, currentStep, progress, true);

      // Check if all steps are completed
      if (this.planningManager.areAllStepsCompleted()) {
        // Complete the task
        await this.planningManager.completeCurrentTask(result, conversationId);
        await this.streamEmitter.emitQueueUpdate(this.agentId, this.planningManager.getQueueState());
      } else {
        // Stream next step if available
        const nextStep = this.planningManager.getCurrentStep();
        if (nextStep) {
          await this.streamEmitter.emitNextStep(runId, nextStep, progress);
        }
      }
    } else {
      // Handle step failure with contingency planning
      const errorMsg = typeof result === "object" && result && "error" in result
        ? String((result as { error?: string }).error || "Tool execution failed")
        : "Tool execution failed";

      const fallbackTask = await this.planningManager.handleStepFailure(
        currentStep,
        errorMsg,
        conversationId
      );

      await this.streamEmitter.emitStepFailure(
        runId,
        currentStep,
        errorMsg,
        fallbackTask ? {
          id: fallbackTask.id,
          title: fallbackTask.title,
        } : undefined
      );
    }
  }

  private formatResultForLLM(result: unknown): string {
    if (typeof result === "string") {
      return result;
    } else if (result && typeof result === "object" && "success" in result) {
      // For ToolResult, extract the content intelligently
      const toolResult = result as { success?: boolean; result?: unknown; error?: string };
      if (toolResult.success && toolResult.result) {
        if (typeof toolResult.result === "object" && "content" in toolResult.result) {
          return String((toolResult.result as { content: unknown }).content);
        } else {
          return JSON.stringify(toolResult.result);
        }
      } else {
        return toolResult.error || JSON.stringify(result);
      }
    } else {
      return JSON.stringify(result);
    }
  }
}
