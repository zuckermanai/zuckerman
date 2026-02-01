import type { GatewayRequestHandlers } from "./types.js";
import type { SessionManager } from "@agents/zuckerman/sessions/index.js";
import type { AgentRuntimeFactory } from "@world/runtime/agents/index.js";
import type { ChannelRegistry } from "@world/communication/messengers/channels/index.js";
import type { SimpleRouter } from "@world/communication/routing/index.js";
import { createHealthHandlers } from "./handlers/health.js";
import { createSessionHandlers } from "./handlers/sessions.js";
import { createAgentHandlers } from "./handlers/agents.js";
import { createChannelHandlers } from "./handlers/channels.js";
import { createConfigHandlers } from "./handlers/config.js";
import { createTextToSpeechHandlers } from "./handlers/text-to-speech.js";

export interface CoreHandlersDeps {
  sessionManager: SessionManager;
  agentFactory: AgentRuntimeFactory;
  router: SimpleRouter;
  channelRegistry: ChannelRegistry | null;
}

export function createCoreHandlers(deps: CoreHandlersDeps): GatewayRequestHandlers {
  const { sessionManager, agentFactory, router, channelRegistry } = deps;
  
  const healthHandlers = createHealthHandlers();
  const sessionHandlers = createSessionHandlers(agentFactory);
  const agentHandlers = createAgentHandlers(sessionManager, agentFactory);
  const channelHandlers = channelRegistry 
    ? createChannelHandlers(channelRegistry, router, sessionManager, agentFactory)
    : {};
  const configHandlers = createConfigHandlers();
  const textToSpeechHandlers = createTextToSpeechHandlers();

  // Combine all handlers, filtering out undefined values
  const handlers: GatewayRequestHandlers = {};
  
  for (const [key, handler] of Object.entries(healthHandlers)) {
    if (handler) handlers[key] = handler;
  }
  
  for (const [key, handler] of Object.entries(sessionHandlers)) {
    if (handler) handlers[key] = handler;
  }
  
  for (const [key, handler] of Object.entries(agentHandlers)) {
    if (handler) handlers[key] = handler;
  }

  for (const [key, handler] of Object.entries(channelHandlers)) {
    if (handler) handlers[key] = handler;
  }

  for (const [key, handler] of Object.entries(configHandlers)) {
    if (handler) handlers[key] = handler;
  }

  for (const [key, handler] of Object.entries(textToSpeechHandlers)) {
    if (handler) handlers[key] = handler;
  }

  return handlers;
}
