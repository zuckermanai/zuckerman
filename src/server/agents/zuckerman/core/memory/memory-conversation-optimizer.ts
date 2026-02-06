import { LLMManager } from "@server/world/providers/llm/index.js";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";

function getTokens(messages: ConversationMessage[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil((m.content?.length || 0) / 4), 0);
}

export async function pruneUnusedMessages(
  messages: ConversationMessage[],
  threshold = 50000
): Promise<ConversationMessage[]> {
  // Filter out already ignored messages for token calculation
  const activeMessages = messages.filter(m => !m.ignore);
  if (!activeMessages.length || getTokens(activeMessages) <= threshold) return messages;

  console.log(`[Prune] Pruning messages:`, messages.length, getTokens(messages), threshold);

  const text = activeMessages.map((m, i) => 
    `[${i}] ${m.role} | ${(m.content?.length || 0)} chars | ${(m.content || "").substring(0, 300)}`
  ).join("\n");

  try {
    const llm = await LLMManager.getInstance().fastCheap();
    const res = await llm.call({
      messages: [{
        role: "user",
        content: `You are analyzing a conversation with ${activeMessages.length} messages (${getTokens(activeMessages)} tokens). The token limit is ${threshold}. Identify message indices to ignore that don't add value for future responses.

REMOVE:
- Short acknowledgments ("ok", "thanks", "got it", "sure")
- Redundant information already covered elsewhere
- Large data payloads already processed (file contents, search results, API responses)
- Empty or near-empty messages

KEEP:
- User questions and requests
- Assistant responses with actual content
- Important context and decisions
- Recent messages (last few exchanges)
- Tool call results that provide actionable information

Return ONLY a JSON array of indices to ignore, e.g., [0, 2, 5]. Do not include explanations.

Messages:
${text}`,
      }],
      temperature: 0.3,
    });

    const match = res.content.match(/\[.*\]/s);
    if (match) {
      const indices = new Set(JSON.parse(match[0]) as number[]);
      console.log(`[Prune] Pruned messages:`, indices);
      // Mark messages as ignored (preserve original array structure)
      const result = [...messages];
      let activeIndex = 0;
      for (let i = 0; i < result.length; i++) {
        if (!result[i].ignore && indices.has(activeIndex)) {
          result[i] = { ...result[i], ignore: true };
        }
        if (!result[i].ignore) activeIndex++;
      }
      return result;
    }
  } catch (e) {
    console.warn(`[Prune] Failed:`, e);
  }

  return messages;
}
