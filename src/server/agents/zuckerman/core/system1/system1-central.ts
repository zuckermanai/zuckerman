import { generateText, streamText } from "ai";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { CriticismService } from "./criticism-service.js";
import { ContextService } from "./context-service.js";
import { convertToModelMessages } from "@server/world/providers/llm/helpers.js";
import { activityRecorder } from "@server/agents/zuckerman/activity/index.js";
import type { Tool } from "ai";
import type { LanguageModel } from "ai";
import type { StreamEventEmitter } from "@server/world/communication/stream-emitter.js";
import { ToolRegistry } from "@server/agents/zuckerman/tools/registry.js";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";

export class System1 {
  constructor(
    private conversationManager: ConversationManager,
    private agentId: string,
    private conversationId: string,
    private runId: string,
    private message: string,
    private temperature: number | undefined,
    private llmModel: LanguageModel,
    private streamEmitter: StreamEventEmitter,
    private availableTools: Record<string, Tool>,
    private systemPrompt: string,
    private relevantMemoriesText: string,
    private toolRegistry: ToolRegistry
  ) {}

  async run(options?: { useContextBuilder?: boolean }): Promise<{ runId: string; response: string; tokensUsed?: number }> {
    const criticismService = new CriticismService(
      this.llmModel,
      this.streamEmitter,
      this.runId,
      this.availableTools,
      this.toolRegistry
    );

    // Optionally build context first
    let enrichedMessage = this.message;
    if (options?.useContextBuilder) {
      try {
        const contextService = new ContextService(
          this.conversationManager,
          this.llmModel,
          this.streamEmitter,
          this.runId,
          this.availableTools,
          this.toolRegistry
        );
        const contextResult = await contextService.buildContext(this.message);
        
        if (contextResult.gatheredInformation.length > 0) {
          await this.conversationManager.addMessage(
            this.conversationId,
            "system",
            `Context gathered:\n${contextResult.enrichedContext}`,
            { runId: this.runId }
          );

          enrichedMessage = `${this.message}\n\n[Context: ${contextResult.enrichedContext}]`;
        }
      } catch (error) {
        console.warn(`[System1] Context building failed, continuing without it:`, error);
      }
    }

    while (true) {
      const conversation = this.conversationManager.getConversation(this.conversationId);
      if (!conversation) {
        throw new Error(`Conversation ${this.conversationId} not found`);
      }
      // Build messages for LLM
      const conversationMessages: ConversationMessage[] = [
        { role: "system", content: `${this.systemPrompt}\n\n${this.relevantMemoriesText}`.trim(), timestamp: Date.now() },
        ...conversation.messages,
      ];

      // Ensure conversation ends with a user message (Anthropic requirement)
      // Check the last non-system message - if it's assistant (and not followed by tool), add user message
      const nonSystemMessages = conversationMessages.filter(m => m.role !== "system");
      if (nonSystemMessages.length > 0) {
        const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
        // If last message is assistant (not tool), we need a user message to continue
        // Tool messages are fine as they're followed by assistant responses
        if (lastMessage.role === "assistant") {
          // Add a continuation user message to ensure conversation ends with user message
          conversationMessages.push({
            role: "user",
            content: "Please continue.",
            timestamp: Date.now(),
          });
        }
      }

      const messages = convertToModelMessages(conversationMessages);

      // Use AI SDK directly
      let result;
      let tokensUsed: number | undefined;

      if (this.streamEmitter && Object.keys(this.availableTools).length === 0) {
        // Streaming for non-tool calls
        try {
          const streamResult = await streamText({
            model: this.llmModel,
            messages,
            temperature: this.temperature,
          });

          let content = "";
          for await (const chunk of streamResult.textStream) {
            content += chunk;
            await this.streamEmitter.emitToken(this.runId, chunk);
          }

          const usage = await streamResult.usage;
          result = { text: content };
          tokensUsed = usage?.totalTokens;
        } catch (err) {
          console.warn(`[System1] Streaming failed, falling back:`, err);
          const genResult = await generateText({
            model: this.llmModel,
            messages,
            temperature: this.temperature,
            tools: this.availableTools,
          });
          result = genResult;
          tokensUsed = genResult.usage?.totalTokens;
        }
      } else {
        // Non-streaming with tools - AI SDK handles tool execution automatically
        const genResult = await generateText({
          model: this.llmModel,
          messages,
          temperature: this.temperature,
          tools: this.availableTools,
        });
        result = genResult;
        tokensUsed = genResult.usage?.totalTokens;

        // Handle tool calls for callbacks
        const toolCalls = await genResult.toolCalls;
        if (toolCalls && toolCalls.length > 0) {
          for (const toolCall of toolCalls) {
            const args = typeof toolCall.input === "object" && toolCall.input !== null 
              ? toolCall.input as Record<string, unknown>
              : { value: toolCall.input };
            await this.streamEmitter.emitToolCall(toolCall.toolName, args);
            await activityRecorder.recordToolCall(
              this.agentId,
              this.conversationId,
              this.runId,
              toolCall.toolName,
              args,
            );
          }
        }

        // Simulate streaming for better UX
        if (this.streamEmitter && result.text) {
          const chunkSize = 5;
          for (let i = 0; i < result.text.length; i += chunkSize) {
            const chunk = result.text.slice(i, i + chunkSize);
            await this.streamEmitter.emitToken(this.runId, chunk);
            const delay = i < result.text.length / 2 ? 15 : 25;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      try {
        const validation = await criticismService.run({
          userRequest: enrichedMessage,
          systemResult: result.text,
        });

        if (!validation.satisfied) {
          const missing = validation.missing.length ? ` Missing: ${validation.missing.join(', ')}.` : '';
          await this.conversationManager.addMessage(this.conversationId, "system", `Validation: ${validation.reason}.${missing} Instructions: Try different approach to complete the task.`, { runId: this.runId });
          continue;
        }
      } catch (error) {
        console.warn(`[System1] Validation error:`, error);
      }

      await this.conversationManager.addMessage(this.conversationId, "assistant", result.text, { runId: this.runId });

      const response = { runId: this.runId, response: result.text, tokensUsed };
      await this.streamEmitter.emitLifecycleEnd(this.runId, tokensUsed, result.text);
      return response;
    }
  }
}
