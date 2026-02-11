import { generateText, Output } from "ai";
import { z } from "zod";
import { LLMProvider } from "@server/world/providers/llm/index.js";
import type { ConversationMessage } from "@server/agents/zuckerman/conversations/types.js";
import { convertToModelMessages } from "@server/world/providers/llm/helpers.js";

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
    const llm = await LLMProvider.getInstance().fastCheap();
    const indicesSchema = z.object({
      indices: z.array(z.number()),
    });
    
    const res = await generateText({
      model: llm,
      messages: convertToModelMessages([{
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

Messages:
${text}`,
        timestamp: Date.now(),
      }]),
      temperature: 0.3,
      output: Output.object({ schema: indicesSchema }),
    });

    const indices = res.output.indices;

    if (indices.length > 0) {
      const indicesSet = new Set(indices);
      console.log(`[Prune] Pruned messages:`, indicesSet);
      // Mark messages as ignored (preserve original array structure)
      const result = [...messages];
      let activeIndex = 0;
      for (let i = 0; i < result.length; i++) {
        if (!result[i].ignore && indicesSet.has(activeIndex)) {
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
