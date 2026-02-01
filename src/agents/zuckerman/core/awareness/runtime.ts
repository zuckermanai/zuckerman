import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { AgentRuntime, AgentRunParams, AgentRunResult } from "@world/runtime/agents/types.js";
import type { LLMMessage } from "@agents/zuckerman/core/awareness/providers/types.js";
import type { SessionId } from "@agents/zuckerman/sessions/types.js";
import { loadConfig } from "@world/config/index.js";
import { SessionManager } from "@agents/zuckerman/sessions/index.js";
import { ZuckermanToolRegistry } from "@agents/zuckerman/tools/registry.js";
import { LLMProviderService } from "@agents/zuckerman/core/awareness/providers/service/selector.js";
import { selectModel } from "@agents/zuckerman/core/awareness/providers/service/model-selector.js";
import { PromptLoader, type LoadedPrompts } from "@agents/zuckerman/core/memory/loader.js";
import {
  resolveAgentLandDir,
  ensureLandDir,
} from "@world/land/resolver.js";
import {
  loadMemoryForSession,
  formatMemoryForPrompt,
} from "@agents/zuckerman/core/memory/persistence.js";

export class ZuckermanAwareness implements AgentRuntime {
  readonly agentId = "zuckerman";
  
  private promptLoader: PromptLoader;
  private providerService: LLMProviderService;
  private sessionManager: SessionManager;
  private toolRegistry: ZuckermanToolRegistry;
  
  // Load prompts from agent's core directory (where markdown files are)
  private readonly agentDir: string;

  constructor(sessionManager?: SessionManager, providerService?: LLMProviderService, promptLoader?: PromptLoader) {
    this.sessionManager = sessionManager || new SessionManager(this.agentId);
    this.toolRegistry = new ZuckermanToolRegistry();
    this.providerService = providerService || new LLMProviderService();
    this.promptLoader = promptLoader || new PromptLoader();
    
    // Detect if running from dist or src
    // Prompts are always in src/agents (source files), not in dist
    // But we need to handle both cases for hot-reload during development
    const srcAgentsDir = join(process.cwd(), "src", "agents", this.agentId);
    const distAgentsDir = join(process.cwd(), "dist", "agents", this.agentId);
    
    // Prefer src/ for prompts (markdown files), but fallback to dist/ if src doesn't exist
    // This handles the case where we're running from a packaged/distributed version
    if (existsSync(srcAgentsDir)) {
      this.agentDir = srcAgentsDir;
    } else {
      // If src doesn't exist, we're probably in a packaged build
      // Prompts should be copied to dist/agents during build, but for now use src path
      this.agentDir = srcAgentsDir;
    }
  }

  async loadPrompts(): Promise<LoadedPrompts> {
    return this.promptLoader.loadPrompts(this.agentDir);
  }

  async buildSystemPrompt(
    prompts: LoadedPrompts,
    landDir?: string,
  ): Promise<string> {
    const basePrompt = this.promptLoader.buildSystemPrompt(prompts);
    const parts: string[] = [basePrompt];
    
    // Add memory (only for main sessions - will be filtered in run method)
    if (landDir) {
      const { dailyLogs, longTermMemory } = loadMemoryForSession(landDir);
      if (dailyLogs.size > 0 || longTermMemory) {
        const memorySection = formatMemoryForPrompt(dailyLogs, longTermMemory);
        parts.push(memorySection);
      }
    }
    
    // Add tool information to system prompt
    const tools = this.toolRegistry.list();
    if (tools.length > 0) {
      const toolDescriptions = tools.map((tool) => {
        return `- **${tool.definition.name}**: ${tool.definition.description}`;
      }).join("\n");
      
      const toolSection = `\n\n## Available Tools\n\n${toolDescriptions}\n\n**Tool Execution Guidelines:**\n- Execute tools autonomously to complete tasks\n- Continue iteratively until the task is complete\n- Handle errors gracefully and try alternatives when needed\n- Only narrate tool usage for complex or sensitive operations`;
      
      parts.push(toolSection);
    }
    
    return parts.join("\n\n---\n\n");
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const { sessionId, message, thinkingLevel = "off", temperature, model, securityContext } = params;
    const runId = randomUUID();

    // Get LLM provider and config
    const config = await loadConfig();
    const provider = await this.providerService.selectProvider(config);

    // Resolve land directory
    const landDir = resolveAgentLandDir(config, this.agentId);
    ensureLandDir(landDir);

    // Load agent prompts
    const prompts = await this.loadPrompts();

    // Get session to check if it's main session (for memory loading)
    const sessionState = this.sessionManager.getSession(sessionId);
    const isMainSession = sessionState?.session.type === "main";

    // Get session entry for overrides
    const sessionEntry = this.sessionManager.getSessionEntry(sessionId);

    // Build system prompt with land context
    // Only load memory for main sessions (not groups/channels)
    const systemPrompt = await this.buildSystemPrompt(
      prompts,
      isMainSession ? landDir : undefined,
    );

    // Build messages from session history
    let messages = this.buildMessages(sessionId, message);

    // Select model - check session overrides first
    const providerOverride = sessionEntry?.providerOverride;
    const providerToUse = providerOverride 
      ? await this.providerService.selectProvider(config, providerOverride)
      : provider;
    const modelToUse = sessionEntry?.modelOverride || selectModel(providerToUse, config, model);
    const temperatureToUse = sessionEntry?.temperatureOverride ?? temperature ?? config.agents?.defaults?.temperature ?? 1.0;
    const thinkingLevelToUse = (sessionEntry?.thinkingLevel as any) || thinkingLevel || "off";

    // Convert tools to LLM format
    const tools = this.toolRegistry.list().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.definition.name,
        description: tool.definition.description,
        parameters: tool.definition.parameters,
      },
    }));

    const toolsUsed: string[] = [];
    let iteration = 0;
    let lastResponse: string = "";
    let totalTokensUsed = 0;
    
    // Configure timeout (session override > config > default 600s)
    const timeoutSeconds = sessionEntry?.timeoutSecondsOverride ?? 
      config.agents?.defaults?.timeoutSeconds ?? 
      600;
    const timeoutMs = timeoutSeconds * 1000;
    const startTime = Date.now();
    
    // Safeguards
    const MAX_TOOL_FAILURES = 8;
    const MAX_REPETITIVE_CALLS = 5; // Same tool+args called repeatedly
    const toolFailures: Array<{ tool: string; error: string }> = [];
    const recentToolCalls: Array<{ tool: string; args: string }> = [];

    while (true) {
      iteration++;
      
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeoutMs) {
        return {
          response: lastResponse || `Agent execution timed out after ${timeoutSeconds}s. The task may require more time or a different approach.`,
          runId,
          tokensUsed: totalTokensUsed,
          toolsUsed,
        };
      }
      
      // Check for excessive tool failures
      if (toolFailures.length >= MAX_TOOL_FAILURES) {
        const failureSummary = toolFailures
          .slice(-MAX_TOOL_FAILURES)
          .map(f => `${f.tool}: ${f.error}`)
          .join("; ");
        return {
          response: lastResponse || `Agent encountered multiple tool failures (${toolFailures.length}). Stopping to prevent infinite loops. Failures: ${failureSummary}`,
          runId,
          tokensUsed: totalTokensUsed,
          toolsUsed,
        };
      }

      // Call LLM with tools (use session overrides)
      const llmProvider = providerOverride
        ? await this.providerService.selectProvider(config, providerOverride)
        : providerToUse;
      const llmResponse = await llmProvider.call({
        messages,
        systemPrompt,
        temperature: temperatureToUse,
        model: modelToUse,
        tools: tools.length > 0 ? tools : undefined,
      });

      // Track tokens
      if (llmResponse.tokensUsed?.total) {
        totalTokensUsed += llmResponse.tokensUsed.total;
      }

      // Store last response content
      if (llmResponse.content) {
        lastResponse = llmResponse.content;
      }

      // If no tool calls, return the response
      if (!llmResponse.toolCalls || llmResponse.toolCalls.length === 0) {
        // Add assistant response to messages
        messages.push({
          role: "assistant",
          content: llmResponse.content,
        });

        // Track tokens in session
        if (llmResponse.tokensUsed) {
          await this.sessionManager.updateTokenCounts(sessionId, {
            inputTokens: llmResponse.tokensUsed.input,
            outputTokens: llmResponse.tokensUsed.output,
            totalTokens: llmResponse.tokensUsed.total,
            contextTokens: totalTokensUsed || llmResponse.tokensUsed.total,
          });
        }

        // Add assistant response to messages and persist
        await this.sessionManager.addMessage(sessionId, "assistant", llmResponse.content, { runId });

        return {
          response: llmResponse.content,
          runId,
          tokensUsed: totalTokensUsed || llmResponse.tokensUsed?.total,
          toolsUsed,
        };
      }

      // Handle tool calls
      const toolCallResults: Array<{ role: "tool"; content: string; toolCallId: string }> = [];

      for (const toolCall of llmResponse.toolCalls) {
        const tool = this.toolRegistry.get(toolCall.name);
        if (!tool) {
          toolCallResults.push({
            role: "tool",
            content: JSON.stringify({ 
              success: false, 
              error: `Tool "${toolCall.name}" not found` 
            }),
            toolCallId: toolCall.id,
          });
          continue;
        }

        toolsUsed.push(toolCall.name);

        // Parse tool arguments
        let toolParams: Record<string, unknown> = {};
        try {
          toolParams = JSON.parse(toolCall.arguments);
        } catch {
          // If JSON parsing fails, try to extract basic params
          toolParams = { action: toolCall.arguments };
        }

        // Check for repetitive tool calls (same tool + same args)
        const recentSameCalls = recentToolCalls.filter(
          tc => tc.tool === toolCall.name && tc.args === JSON.stringify(toolParams)
        ).length;
        
        if (recentSameCalls >= MAX_REPETITIVE_CALLS) {
          toolCallResults.push({
            role: "tool",
            content: JSON.stringify({ 
              success: false, 
              error: `Tool "${toolCall.name}" called repeatedly with same arguments. Stopping to prevent infinite loop.`,
              tool: toolCall.name,
            }),
            toolCallId: toolCall.id,
          });
          // Add to failures to trigger safeguard
          toolFailures.push({ tool: toolCall.name, error: "Repetitive calls detected" });
          continue;
        }

        // Track recent calls (keep last 10)
        recentToolCalls.push({ tool: toolCall.name, args: JSON.stringify(toolParams) });
        if (recentToolCalls.length > 10) {
          recentToolCalls.shift();
        }

        try {
          // Execute tool
          const result = await tool.handler(toolParams, securityContext);

          // Track failures
          if (!result.success) {
            toolFailures.push({ 
              tool: toolCall.name, 
              error: result.error || "Unknown error" 
            });
            // Keep only recent failures
            if (toolFailures.length > MAX_TOOL_FAILURES) {
              toolFailures.shift();
            }
          } else {
            // Clear failures on success (only keep last 3 for context)
            if (toolFailures.length > 3) {
              toolFailures.splice(0, toolFailures.length - 3);
            }
          }

          // Format result for LLM - provide structured error info to help agent retry
          const resultContent = result.success
            ? JSON.stringify(result.result || { success: true })
            : JSON.stringify({ 
                success: false, 
                error: result.error || "Unknown error",
                tool: toolCall.name,
                // Include partial results if available to help agent adapt
                ...(result.result && typeof result.result === "object" ? result.result : {})
              });

          toolCallResults.push({
            role: "tool",
            content: resultContent,
            toolCallId: toolCall.id,
          });
        } catch (error) {
          // Provide detailed error info to help agent retry with different approach
          const errorMessage = error instanceof Error ? error.message : String(error);
          toolFailures.push({ tool: toolCall.name, error: errorMessage });
          
          toolCallResults.push({
            role: "tool",
            content: JSON.stringify({ 
              success: false, 
              error: `Error executing tool: ${errorMessage}`,
              tool: toolCall.name,
            }),
            toolCallId: toolCall.id,
          });
        }
      }

      // Add assistant message with tool calls (even if empty content, preserve tool call info)
      const assistantMessage = {
        role: "assistant" as const,
        content: llmResponse.content || "",
        toolCalls: llmResponse.toolCalls,
      };
      messages.push(assistantMessage);
      
      // Persist assistant message
      await this.sessionManager.addMessage(
        sessionId,
        "assistant",
        assistantMessage.content,
        { toolCalls: assistantMessage.toolCalls, runId },
      );

      // Add tool results (as tool role messages)
      for (const result of toolCallResults) {
        const toolMessage = {
          role: "tool" as const,
          content: result.content,
          toolCallId: result.toolCallId,
        };
        messages.push(toolMessage);
        
        // Persist tool result
        await this.sessionManager.addMessage(
          sessionId,
          "tool",
          result.content,
          { toolCallId: result.toolCallId, runId },
        );
      }
    }

    // This should never be reached (loop exits on no tool calls or timeout)
    // But keep as safety fallback
    return {
      response: lastResponse || "Agent loop completed unexpectedly.",
      runId,
      tokensUsed: totalTokensUsed,
      toolsUsed,
    };
  }

  clearCache(): void {
    this.promptLoader.clearCache(this.agentDir);
    this.providerService.clearCache();
  }

  getToolRegistry(): ZuckermanToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Build messages array from session history and current message
   */
  private buildMessages(sessionId: SessionId, message: string): LLMMessage[] {
    const messages: LLMMessage[] = [];
    const sessionState = this.sessionManager.getSession(sessionId);

    // Add conversation history (last 10 messages for context)
    if (sessionState) {
      const historyMessages = sessionState.messages.slice(-10);
      for (const msg of historyMessages) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add current user message
    messages.push({
      role: "user",
      content: message,
    });

    return messages;
  }
}

// Export as default for dynamic import compatibility
export default ZuckermanAwareness;

// Also export as ZuckermanRuntime for backward compatibility
export { ZuckermanAwareness as ZuckermanRuntime };
