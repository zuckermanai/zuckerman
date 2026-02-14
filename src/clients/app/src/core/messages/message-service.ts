import type { GatewayClient } from "../core/gateway/client";
import type { Message, BackendMessage } from "../types/message";
import { ConversationService } from "../conversations/conversation-service";

/**
 * Message service - handles message operations including deduplication
 */
export class MessageService {
  private conversationService: ConversationService;

  constructor(
    private client: GatewayClient,
    conversationService?: ConversationService
  ) {
    // Allow dependency injection, fallback to creating new instance
    this.conversationService = conversationService || new ConversationService(client);
  }

  /**
   * Load messages from a conversation
   */
  async loadMessages(conversationId: string): Promise<Message[]> {
    const conversationState = await this.conversationService.getConversation(conversationId);
    const backendMessages = conversationState.messages || [];

    const transformed = this.transformMessages(backendMessages, conversationId);

    return transformed;
  }

  /**
   * Transform backend messages to UI messages
   */
  transformMessages(backendMessages: BackendMessage[], conversationId?: string): Message[] {
    return backendMessages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system" | "tool",
      content: msg.content,
      timestamp: msg.timestamp || Date.now(),
      conversationId,
      rawResponse: undefined,
      toolCalls: msg.toolCalls as Array<{
        id: string;
        name: string;
        arguments: string;
      }> | undefined,
      toolCallId: msg.toolCallId,
    }));
  }

  /**
   * Deduplicate messages by content + role + approximate timestamp
   */
  deduplicateMessages(messages: Message[]): Message[] {
    const deduplicated: Message[] = [];
    const seen = new Set<string>();

    for (const msg of messages) {
      const timeKey = Math.floor((msg.timestamp || 0) / 1000);
      const key = `${msg.role}:${msg.content}:${timeKey}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(msg);
      }
    }

    return deduplicated;
  }

  /**
   * Send a message via agent.run
   */
  async sendMessage(
    conversationId: string,
    agentId: string,
    message: string
  ): Promise<unknown> {
    console.log(`[MessageService] Sending message to agent "${agentId}" in conversation "${conversationId}"`);
    
    const response = await this.client.request("agent.run", {
      conversationId,
      agentId,
      message,
    });

    if (!response.ok) {
      const errorMessage = response.error?.message || "Failed to run agent";
      const errorCode = response.error?.code || "UNKNOWN_ERROR";
      console.error(`[MessageService] Agent run failed:`, {
        code: errorCode,
        message: errorMessage,
        agentId,
        conversationId,
      });
      throw new Error(errorMessage);
    }

    if (!response.result) {
      console.error(`[MessageService] Agent run returned no result:`, {
        agentId,
        conversationId,
        response,
      });
      throw new Error("Agent run returned no result");
    }

    return response.result;
  }
}
