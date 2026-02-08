import type { RunContext } from "@server/world/providers/llm/context.js";
import { LLMService } from "@server/world/providers/llm/llm-service.js";
import { ToolService } from "../../tools/index.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { CriticismService } from "./criticism-service.js";
import { ContextService } from "./context-service.js";

export class System1 {
  constructor(
    private conversationManager: ConversationManager,
    private context: RunContext
  ) {}

  async run(options?: { useContextBuilder?: boolean }): Promise<{ runId: string; response: string; tokensUsed?: number }> {
    const llmService = new LLMService(this.context.llmModel, this.context.streamEmitter, this.context.runId);
    const toolService = new ToolService();
    const criticismService = new CriticismService(this.context);

    // Optionally build context first
    let enrichedMessage = this.context.message;
    if (options?.useContextBuilder) {
      try {
        const contextService = new ContextService(this.conversationManager, this.context);
        const contextResult = await contextService.buildContext(this.context.message);
        
        if (contextResult.gatheredInformation.length > 0) {
          await this.conversationManager.addMessage(
            this.context.conversationId,
            "system",
            `Context gathered:\n${contextResult.enrichedContext}`,
            { runId: this.context.runId }
          );

          enrichedMessage = `${this.context.message}\n\n[Context: ${contextResult.enrichedContext}]`;
        }
      } catch (error) {
        console.warn(`[System1] Context building failed, continuing without it:`, error);
      }
    }

    while (true) {
      const conversation = this.conversationManager.getConversation(this.context.conversationId);
      const result = await llmService.call({
        messages: llmService.buildMessages(this.context, conversation),
        temperature: this.context.temperature,
        availableTools: this.context.availableTools,
      });

      // Handle final response (no tool calls)
      if (!result.toolCalls?.length) {
        try {
          const validation = await criticismService.run({
            userRequest: enrichedMessage,
            systemResult: result.content,
          });

          if (!validation.satisfied) {
            const missing = validation.missing.length ? ` Missing: ${validation.missing.join(', ')}.` : '';
            await this.conversationManager.addMessage(this.context.conversationId, "system", `Validation: ${validation.reason}.${missing} Instructions: Try different approach to complete the task.`, { runId: this.context.runId });
            continue;
          }
        } catch (error) {
          console.warn(`[System1] Validation error:`, error);
        }

        await this.conversationManager.addMessage(this.context.conversationId, "assistant", result.content, { runId: this.context.runId });

        const response = { runId: this.context.runId, response: result.content, tokensUsed: result.tokensUsed?.total };
        await this.context.streamEmitter.emitLifecycleEnd(this.context.runId, result.tokensUsed?.total, result.content);
        return response;
      }

      // Handle tool calls
      const toolCalls = result.toolCalls.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: typeof tc.arguments === "string" ? tc.arguments : JSON.stringify(tc.arguments),
      }));
      await this.conversationManager.addMessage(this.context.conversationId, "assistant", "", { toolCalls, runId: this.context.runId });

      const toolResults = await toolService.executeTools(this.context, result.toolCalls);
      for (const toolResult of toolResults) {
        await this.conversationManager.addMessage(this.context.conversationId, "tool", toolResult.content, { toolCallId: toolResult.toolCallId, runId: this.context.runId });
      }
    }
  }
}
