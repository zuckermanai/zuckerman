import type { GatewayClient } from "../infrastructure/gateway/client";
import type { Message, BackendMessage } from "../infrastructure/types/message";
import { SessionService } from "./session-service";

/**
 * Message service - handles message operations including deduplication
 */
export class MessageService {
  private sessionService: SessionService;

  constructor(private client: GatewayClient) {
    this.sessionService = new SessionService(client);
  }

  /**
   * Load messages from a session
   */
  async loadMessages(sessionId: string): Promise<Message[]> {
    const sessionState = await this.sessionService.getSession(sessionId);
    const backendMessages = sessionState.messages || [];

    const transformed = this.transformMessages(backendMessages);

    return transformed;
  }

  /**
   * Transform backend messages to UI messages
   */
  transformMessages(backendMessages: BackendMessage[]): Message[] {
    return backendMessages.map((msg) => ({
      role: msg.role as "user" | "assistant" | "system",
      content: msg.content,
      timestamp: msg.timestamp || Date.now(),
      rawResponse: undefined,
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
    sessionId: string,
    agentId: string,
    message: string
  ): Promise<unknown> {
    const response = await this.client.request("agent.run", {
      sessionId,
      agentId,
      message,
    });

    if (!response.ok || !response.result) {
      throw new Error(response.error?.message || "Failed to run agent");
    }

    return response.result;
  }
}
