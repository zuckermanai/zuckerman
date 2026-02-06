import type { CalendarEvent } from "./types.js";
import { getCronExecutionContext } from "./execution-context.js";
import { resolveAgentHomedir } from "@server/world/homedir/resolver.js";
import { loadConfig } from "@server/world/config/index.js";
import { resolveSecurityContext } from "@server/world/execution/security/context/index.js";
import { deriveConversationKey } from "@server/agents/zuckerman/conversations/index.js";
import { loadConversationStore, resolveConversationStorePath } from "@server/agents/zuckerman/conversations/store.js";
import { activityRecorder } from "@server/world/activity/index.js";
import { saveEvents } from "./storage.js";
import { scheduleEvent, calculateNextOccurrence } from "./scheduler.js";

// Execute an event
export async function executeEvent(event: CalendarEvent, eventsMap: Map<string, CalendarEvent>): Promise<void> {
  console.log(`[Calendar] Executing event: ${event.id} - ${event.title} at ${new Date().toISOString()}`);
  event.lastTriggeredAt = Date.now();

  const agentId = event.action.agentId || "zuckerman";

  try {
    if (event.action.type === "systemEvent") {
      console.log(`[Calendar] System event: ${event.action.actionMessage || ""}`);
      // Record calendar event triggered for system events
      await activityRecorder.recordCalendarEventTriggered(
        agentId,
        event.id,
        event.title,
      ).catch((err) => {
        console.warn("Failed to record calendar event triggered:", err);
      });
    } else if (event.action.type === "agentTurn") {
      await executeAgentTurn(event, eventsMap);
    } else {
      console.warn(`[Calendar] Unknown action type: ${(event.action as any).type}`);
    }
  } catch (error) {
    console.error(`[Calendar] Error executing event ${event.id}:`, error);
    if (error instanceof Error) {
      console.error(`[Calendar] Error stack:`, error.stack);
    }
    // Don't rethrow - allow scheduler to continue
  }

  // Update next occurrence for recurring events
  if (event.recurrence && event.recurrence.type !== "none") {
    event.nextOccurrenceAt = calculateNextOccurrence(event);
    if (event.nextOccurrenceAt) {
      scheduleEvent(event, eventsMap);
    }
  }

  saveEvents(eventsMap);
}

// Execute an agent turn action
async function executeAgentTurn(event: CalendarEvent, eventsMap: Map<string, CalendarEvent>): Promise<void> {
  const action = event.action;
  if (action.type !== "agentTurn" || !action.actionMessage) {
    console.warn(`[Calendar] Invalid agentTurn action for event ${event.id}`);
    return;
  }

  // Get execution context
  const context = getCronExecutionContext();
  if (!context || !context.agentFactory) {
    console.error(`[Calendar] Execution context not available for event ${event.id}`);
    return;
  }

  const agentId = action.agentId || "zuckerman";
  const agentFactory = context.agentFactory;
  const channelRegistry = context.channelRegistry;

  // Get runtime
  let runtime;
  try {
    runtime = await agentFactory.getRuntime(agentId);
    if (!runtime) {
      console.error(`[Calendar] Failed to get runtime for agent ${agentId}`);
      return;
    }
  } catch (error) {
    console.error(`[Calendar] Error getting runtime for agent ${agentId}:`, error);
    return;
  }

  // Get conversation manager
  const conversationManager = agentFactory.getConversationManager(agentId);

  // Create or get conversation
  let conversationId: string;
  let isNewConversation = false;
  
  const conversationTarget = action.conversationTarget || "isolated";
  if (conversationTarget === "isolated") {
    // Create temporary isolated conversation
    const conversation = conversationManager.createConversation(`cron-${event.id}`, "main", agentId);
    conversationId = conversation.id;
    isNewConversation = true;
  } else {
    // Use main conversation - get or create
    const conversationKey = deriveConversationKey(agentId, "main");
    const storePath = resolveConversationStorePath(agentId);
    const store = loadConversationStore(storePath);
    const conversationEntry = store[conversationKey];
    
    if (conversationEntry) {
      conversationId = conversationEntry.conversationId;
    } else {
      const conversation = conversationManager.createConversation("main", "main", agentId);
      conversationId = conversation.id;
      isNewConversation = true;
    }
  }

  // Get conversation state
  const conversation = conversationManager.getConversation(conversationId);
  if (!conversation) {
    console.error(`[Calendar] Failed to get conversation ${conversationId}`);
    return;
  }

  // Record calendar event triggered with conversationId for activity tracking
  await activityRecorder.recordCalendarEventTriggered(
    agentId,
    event.id,
    event.title,
    conversationId,
  ).catch((err) => {
    console.warn("Failed to record calendar event triggered:", err);
  });

  // Set channel metadata from context if provided
  if (action.context) {
    const contextMetadata: {
      channel?: string;
      to?: string;
      accountId?: string;
    } = {};
    
    if (action.context.channel) {
      contextMetadata.channel = action.context.channel;
    }
    if (action.context.to) {
      contextMetadata.to = action.context.to;
    }
    if (action.context.accountId) {
      contextMetadata.accountId = action.context.accountId;
    }
    
    if (Object.keys(contextMetadata).length > 0) {
      await conversationManager.updateChannelMetadata(conversationId, contextMetadata);
      console.log(`[Calendar] Set channel metadata for event ${event.id}:`, contextMetadata);
    }
  }

  // Load config and resolve security context
  const config = await loadConfig();
  const homedir = resolveAgentHomedir(config, agentId);
  const securityContext = await resolveSecurityContext(
    config.security,
    conversationId,
    conversation.conversation.type,
    agentId,
    homedir,
  );

  // Run agent
  console.log(`[Calendar] Running agent turn for event ${event.id} in conversation ${conversationId}`);
  const conversationIdSource = action.conversationIdSource;
  if (conversationIdSource) {
    console.log(`[Calendar] Event created by conversation: ${conversationIdSource}`);
  }
  console.log(`[Calendar] Action message: "${action.actionMessage}"`);
  if (action.contextMessage) {
    console.log(`[Calendar] Context message: "${action.contextMessage}"`);
  }
  
  // Frame the message as a scheduled task execution instruction
  // This ensures the agent executes the action rather than asking questions about it
  const executionInstruction = `This is a scheduled task execution. Please execute the following action immediately without asking for clarification:\n\n${action.actionMessage}`;
  
  const message = action.contextMessage 
    ? `${action.contextMessage}\n\n${executionInstruction}`
    : executionInstruction;
  
  const runParams: any = {
    conversationId,
    message,
    securityContext,
  };
  
  let result;
  try {
    console.log(`[Calendar] Calling runtime.run() for event ${event.id}...`);
    
    // Add timeout to prevent hanging (5 minutes max)
    const timeoutMs = 5 * 60 * 1000;
    const runPromise = runtime.run(runParams);
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Agent run timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    
    result = await Promise.race([runPromise, timeoutPromise]);
    console.log(`[Calendar] Agent completed for event ${event.id}, got response (length: ${result.response?.length || 0})`);
  } catch (error) {
    console.error(`[Calendar] Agent run failed for event ${event.id}:`, error);
    if (error instanceof Error) {
      console.error(`[Calendar] Error message:`, error.message);
      console.error(`[Calendar] Error stack:`, error.stack);
    }
    // Don't rethrow - log and continue so scheduler doesn't crash
    return;
  }

  // Log agent response
  const responsePreview = result.response?.substring(0, 300) || "(no response)";
  console.log(`[Calendar] Agent response for event ${event.id} (${result.response?.length || 0} chars):`, responsePreview);
  
  // Note: toolsUsed is not currently returned by runtime, but tools are executed during the run
  // Check conversation messages to see if tools were called
  const conversationAfter = conversationManager.getConversation(conversationId);
  const toolMessages = conversationAfter?.messages.filter(m => m.role === "tool") || [];
  if (toolMessages.length > 0) {
    console.log(`[Calendar] Agent executed ${toolMessages.length} tool call(s) for event ${event.id}`);
  } else {
    console.log(`[Calendar] Agent did not execute any tools for event ${event.id} - response was: "${responsePreview}"`);
  }

  // Add response to conversation
  conversationManager.addMessage(conversationId, "assistant", result.response);

  // Note: Agent uses its tools (like telegram) to send messages
  // Channel metadata is already set on the conversation, so tools can access it
  // No need for separate delivery logic - the agent handles it
}
