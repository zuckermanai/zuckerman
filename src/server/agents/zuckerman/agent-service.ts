import { randomUUID } from "node:crypto";
import type { AgentRuntime, AgentRunParams, AgentRunResult } from "@server/world/runtime/agents/types.js";
import type { ConversationId, ConversationState, Conversation, ConversationKey, ConversationType, ConversationLabel } from "./conversations/types.js";
import { ConversationManager } from "./conversations/index.js";
import { ConversationRouter } from "./conversations/router.js";
import { Self } from "./core/self/self.js";
import { IdentityLoader } from "./core/identity/identity-loader.js";
import { agentDiscovery } from "@server/agents/discovery.js";
import type {
  AgentEvent,
  WriteEvent,
  ThinkEvent,
  RememberEvent,
  ActEvent,
  LearnEvent,
  StreamTokenEvent,
  StreamLifecycleEvent,
  StreamToolCallEvent,
  StreamToolResultEvent,
  StreamResponseEvent,
  SelfErrorEvent,
  MessageEvent,
} from "./core/self/events.js";
import { activityRecorder } from "./activity/index.js";

/**
 * Public API for Zuckerman agent
 * This service exposes only the public interface and prevents external access to internal implementation
 * 
 * Implements AgentRuntime interface to work with AgentRuntimeFactory
 */
export class AgentService implements AgentRuntime {
  private readonly runtime: Self;
  private readonly conversationManager: ConversationManager;
  private readonly conversationRouter: ConversationRouter;
  private readonly identityLoader: IdentityLoader;
  private readonly agentDir: string;
  readonly agentId: string;

  constructor(agentId: string) {
    this.agentId = agentId;
    // AgentService always creates its own ConversationManager internally
    this.conversationManager = new ConversationManager(this.agentId);
    this.conversationRouter = new ConversationRouter(this.agentId, this.conversationManager);
    this.runtime = new Self(this.agentId);
    this.identityLoader = new IdentityLoader();
    
    // Get agent directory from discovery service
    const metadata = agentDiscovery.getMetadata(this.agentId);
    if (!metadata) {
      throw new Error(`Agent "${this.agentId}" not found in discovery service`);
    }
    this.agentDir = metadata.agentDir;

    // Setup event handlers
    this.setupEventHandlers();
  }

  /**
   * Setup event handlers that route events to conversation manager and other services
   */
  private setupEventHandlers(): void {
    this.runtime.on("write", async (event: WriteEvent) => {
      const runId = event.runId || randomUUID();
      // Get conversationId from event, or use main conversation if empty
      let conversationId = event.conversationId?.trim() || "";
      
      if (!conversationId) {
        // If no conversationId provided, use main conversation
        const mainConversation = this.conversationManager.getOrCreateMainConversation(this.agentId);
        conversationId = mainConversation.id;
        console.log(`[AgentService] Write event using main conversation: ${conversationId}`);
      }
      
      // Ensure conversation exists
      const conversation = this.conversationManager.getConversation(conversationId);
      if (!conversation) {
        console.warn(`[AgentService] Conversation ${conversationId} not found, skipping write event`);
        return;
      }
      
      await this.conversationManager.addMessage(conversationId, event.role, event.content, { runId });
      console.log(`[AgentService] Added ${event.role} message to conversation ${conversationId}`);
    });

    this.runtime.on("think", async (event: ThinkEvent) => {
      // Think events are internal - don't add to conversation
    });

    this.runtime.on("remember", async (event: RememberEvent) => {
      console.log(`[AgentService] Remembering: ${event.memory}`);
      // Could store in memory system
    });

    this.runtime.on("act", async (event: ActEvent) => {
      console.log(`[AgentService] Acting: ${event.action}`);
    });

    this.runtime.on("learn", async (event: LearnEvent) => {
      console.log(`[AgentService] Learning: ${event.knowledge}`);
      // Could store in memory system
    });

    this.runtime.on("message", async (event: MessageEvent) => {
      const runId = event.runId || randomUUID();
      await activityRecorder.recordAgentMessage(
        this.agentId,
        event.conversationId,
        runId,
        event.message
      ).catch(err => console.warn(`[AgentService] Failed to record message:`, err));
    });

    // Streaming events
    this.runtime.on("stream.token", async (event: StreamTokenEvent) => {
      // Handle token streaming if needed
    });

    this.runtime.on("stream.lifecycle", async (event: StreamLifecycleEvent) => {
      if (event.phase === "start" && event.message) {
        await activityRecorder.recordAgentRunStart(
          this.agentId,
          event.conversationId,
          event.runId,
          event.message
        ).catch(err => console.warn(`[AgentService] Failed to record run start:`, err));
      } else if (event.phase === "end") {
        // Get response from conversation messages
        const conversation = this.conversationManager.getConversation(event.conversationId);
        const lastMessage = conversation?.messages
          .filter(m => m.role === "assistant")
          .pop();
        // Extract string content from message
        const response = typeof lastMessage?.content === "string" 
          ? lastMessage.content 
          : Array.isArray(lastMessage?.content)
            ? lastMessage.content
              .filter((part: any) => part.type === "text")
              .map((part: any) => part.text)
              .join("")
            : "";
        
        await activityRecorder.recordAgentRunComplete(
          this.agentId,
          event.conversationId,
          event.runId,
          response,
          event.tokensUsed,
          event.toolsUsed
        ).catch(err => console.warn(`[AgentService] Failed to record run complete:`, err));
      } else if (event.phase === "error" && event.error) {
        await activityRecorder.recordAgentRunError(
          this.agentId,
          event.conversationId,
          event.runId,
          event.error
        ).catch(err => console.warn(`[AgentService] Failed to record run error:`, err));
      }
    });

    this.runtime.on("stream.tool.call", async (event: StreamToolCallEvent) => {
      await activityRecorder.recordToolCall(
        this.agentId,
        event.conversationId,
        event.runId,
        event.tool,
        event.toolArgs
      ).catch(err => console.warn(`[AgentService] Failed to record tool call:`, err));
    });

    this.runtime.on("stream.tool.result", async (event: StreamToolResultEvent) => {
      const toolResult = typeof event.toolResult === "string" 
        ? event.toolResult 
        : JSON.stringify(event.toolResult);
      
      // Check if result is an error
      if (typeof event.toolResult === "string" && event.toolResult.startsWith("Error:")) {
        await activityRecorder.recordToolError(
          this.agentId,
          event.conversationId,
          event.runId,
          event.tool,
          toolResult
        ).catch(err => console.warn(`[AgentService] Failed to record tool error:`, err));
      } else {
        await activityRecorder.recordToolResult(
          this.agentId,
          event.conversationId,
          event.runId,
          event.tool,
          event.toolResult
        ).catch(err => console.warn(`[AgentService] Failed to record tool result:`, err));
      }
    });

    this.runtime.on("stream.response", async (event: StreamResponseEvent) => {
      await activityRecorder.recordAgentResponse(
        this.agentId,
        event.conversationId,
        event.runId,
        event.response
      ).catch(err => console.warn(`[AgentService] Failed to record response:`, err));
    });

    this.runtime.on("self.error", async (event: SelfErrorEvent) => {
      await activityRecorder.recordSelfError(
        this.agentId,
        event.conversationId,
        event.runId,
        event.errorContext,
        event.error
      ).catch(err => console.warn(`[AgentService] Failed to record self error:`, err));
    });
  }

  /**
   * Register an event handler
   */
  on<T extends AgentEvent>(eventType: T["type"], handler: (event: T) => void | Promise<void>): () => void {
    return this.runtime.on(eventType, handler);
  }

  /**
   * Emit an event to the runtime
   */
  async emit(event: AgentEvent): Promise<void> {
    await this.runtime.emit(event);
  }

  /**
   * Initialize the agent (called once when agent is created)
   */
  async initialize(): Promise<void> {
    await this.runtime.initialize();
    // Start autonomous background processing loop
    await this.runtime.start();
  }

  /**
   * Run the agent with given parameters
   */
  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const { conversationId, message } = params;
    const runId = params.runId || randomUUID();
    
    if (params.channelMetadata) {
      await this.conversationManager.updateChannelMetadata(conversationId, params.channelMetadata);
    }
    await this.conversationManager.addMessage(conversationId, "user", message, { runId });
    
    // Get conversation messages
    const conversation = this.conversationManager.getConversation(conversationId);
    const conversationMessages = conversation?.messages || [];
    
    return await this.runtime.run({ 
      ...params, 
      runId, 
      conversationMessages
    });
  }

  /**
   * Load agent prompts (for inspection/debugging)
   */
  async loadPrompts(): Promise<{ files: Map<string, string> }> {
    const prompts = await this.identityLoader.loadPrompts(this.agentDir);
    return { files: prompts.files };
  }

  /**
   * Clear caches (for hot reload)
   */
  clearCache(): void {
    // Clear identity loader cache if available
    if (this.identityLoader.clearCache) {
      this.identityLoader.clearCache(this.agentDir);
    }
  }

  /**
   * Get conversation by ID (read-only)
   */
  getConversation(conversationId: ConversationId): ConversationState | undefined {
    return this.conversationManager.getConversation(conversationId);
  }

  /**
   * List all conversations (read-only)
   */
  listConversations(): Conversation[] {
    return this.conversationManager.listConversations();
  }

  /**
   * Create a new conversation (for routing/setup)
   */
  createConversation(
    label: string,
    type: "main" | "group" | "channel" = "main",
    agentId?: string
  ): Conversation {
    return this.conversationManager.createConversation(label, type, agentId);
  }

  /**
   * Delete a conversation (for API operations)
   */
  deleteConversation(conversationId: ConversationId): boolean {
    return this.conversationManager.deleteConversation(conversationId);
  }

  /**
   * Get or create main conversation (for routing)
   */
  getOrCreateMainConversation(agentId?: string): Conversation {
    return this.conversationRouter.getOrCreateMainConversation(agentId);
  }

  /**
   * Get or create conversation by key (for routing from world)
   */
  getOrCreateConversationByKey(
    conversationKey: ConversationKey,
    type: ConversationType,
    label?: ConversationLabel,
  ): Conversation {
    return this.conversationRouter.getOrCreateConversation(conversationKey, type, label, this.agentId);
  }

}
