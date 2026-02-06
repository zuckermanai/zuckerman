import type { LLMMessage } from "@server/world/providers/llm/types.js";
import type { ConversationState } from "@server/agents/zuckerman/conversations/types.js";
import type { MemoryHandler } from "./memory-handler.js";

export class MessageBuilder {
  constructor(private memoryHandler: MemoryHandler) {}

  /**
   * Build messages array for LLM call
   */
  async buildMessages(
    systemPrompt: string,
    userMessage: string,
    conversation: ConversationState | null,
    relevantMemoriesText: string
  ): Promise<LLMMessage[]> {
    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add conversation history
    if (conversation) {
      for (const msg of conversation.messages) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }
    }

    // Add current user message with relevant memories context
    const userContent = relevantMemoriesText 
      ? `${userMessage}${relevantMemoriesText}` 
      : userMessage;
    
    messages.push({ 
      role: "system", 
      content: userContent 
    });

    return messages;
  }

  /**
   * Get conversation context for memory extraction (last 3 messages)
   */
  getConversationContext(conversation: ConversationState | null): string | undefined {
    if (!conversation) return undefined;
    return conversation.messages.slice(-3).map(m => m.content).join("\n");
  }
}
