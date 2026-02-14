import type { GatewayRequestHandlers } from "./types.js";
import type { AgentRuntimeFactory } from "@server/world/runtime/agents/index.js";
import type { ChannelRegistry } from "@server/world/communication/messengers/channels/index.js";
import type { SimpleRouter } from "@server/world/communication/routing/index.js";
import { createHealthHandlers } from "./handlers/health.js";
import { createConversationHandlers } from "./handlers/conversations.js";
import { createAgentHandlers } from "./handlers/agents.js";
import { createChannelHandlers } from "./handlers/channels.js";
import { createConfigHandlers } from "./handlers/config.js";
import { createTextToSpeechHandlers } from "./handlers/text-to-speech.js";
import { createActivityHandlers } from "./handlers/activities.js";
import { createMemoryHandlers } from "./handlers/memory.js";

export interface CoreHandlersDeps {
  agentFactory: AgentRuntimeFactory;
  router: SimpleRouter;
  channelRegistry: ChannelRegistry | null;
  broadcastEvent?: (event: { type: "event"; event: string; payload?: unknown }) => void;
}

export function createCoreHandlers(deps: CoreHandlersDeps): GatewayRequestHandlers {
  const { agentFactory, router, channelRegistry, broadcastEvent } = deps;
  
  const healthHandlers = createHealthHandlers();
  const conversationHandlers = createConversationHandlers(agentFactory);
  const agentHandlers = createAgentHandlers(agentFactory);
  const channelHandlers = channelRegistry 
    ? createChannelHandlers(channelRegistry, router, agentFactory, broadcastEvent)
    : {};
  const configHandlers = createConfigHandlers();
  const textToSpeechHandlers = createTextToSpeechHandlers();
  const activityHandlers = createActivityHandlers();
  const memoryHandlers = createMemoryHandlers(agentFactory);

  // Combine all handlers, filtering out undefined values
  const handlers: GatewayRequestHandlers = {};
  
  for (const [key, handler] of Object.entries(healthHandlers)) {
    if (handler) handlers[key] = handler;
  }
  
  for (const [key, handler] of Object.entries(conversationHandlers)) {
    if (handler) handlers[key] = handler;
  }
  
  for (const [key, handler] of Object.entries(agentHandlers)) {
    if (handler) handlers[key] = handler;
  }

  for (const [key, handler] of Object.entries(channelHandlers)) {
    if (handler) handlers[key] = handler;
  }

  for (const [key, handler] of Object.entries(configHandlers)) {
    if (handler) {
      handlers[key] = handler;
    }
  }
  
  // Debug: Log registered config handlers
  const configHandlerKeys = Object.keys(configHandlers);
  if (configHandlerKeys.length > 0) {
    console.log(`[Gateway] Registered config handlers: ${configHandlerKeys.join(", ")}`);
  }

  for (const [key, handler] of Object.entries(textToSpeechHandlers)) {
    if (handler) handlers[key] = handler;
  }

  for (const [key, handler] of Object.entries(activityHandlers)) {
    if (handler) handlers[key] = handler;
  }

  for (const [key, handler] of Object.entries(memoryHandlers)) {
    if (handler) handlers[key] = handler;
  }

  return handlers;
}
