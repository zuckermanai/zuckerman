import type { Router, Route } from "./types.js";
import type { ChannelMessage } from "@server/world/communication/messengers/channels/types.js";
import { ConversationManager } from "@server/agents/zuckerman/conversations/index.js";
import { resolveAgentRoute, resolveAgentHomedir } from "./resolver.js";
import { loadConfig } from "@server/world/config/index.js";
import type { AgentRuntimeFactory } from "@server/world/runtime/agents/index.js";

export interface RoutedMessage {
  conversationId: string;
  agentId: string;
  conversationKey: string;
  homedir: string;
}

export class SimpleRouter implements Router {
  private routes: Route[] = [];
  private agentFactory: AgentRuntimeFactory;

  constructor(agentFactory: AgentRuntimeFactory) {
    this.agentFactory = agentFactory;
  }

  /**
   * Get conversation manager for an agent
   */
  private getConversationManager(agentId: string): ConversationManager {
    return this.agentFactory.getConversationManager(agentId);
  }

  addRoute(route: Route): void {
    this.routes.push(route);
  }

  removeRoute(channelId: string): void {
    this.routes = this.routes.filter((r) => r.channelId !== channelId);
  }

  async route(message: ChannelMessage): Promise<string | null> {
    // Find matching route
    for (const route of this.routes) {
      if (route.channelId === message.channelId) {
        if (!route.condition || route.condition(message)) {
          return route.conversationId;
        }
      }
    }

    // Default: use main conversation for default agent
    const config = await loadConfig();
    const defaultAgent = config.agents?.list?.find((a) => a.default) || config.agents?.list?.[0];
    const agentId = defaultAgent?.id || "zuckerman";
    const conversationManager = this.getConversationManager(agentId);
    const mainConversation = conversationManager.getOrCreateMainConversation(agentId);
    return mainConversation.id;
  }

  /**
   * Route a message to an agent using routing rules
   */
  async routeToAgent(message: ChannelMessage, options?: {
    accountId?: string;
    guildId?: string;
    teamId?: string;
  }): Promise<RoutedMessage> {
    const config = await loadConfig();
    
    // Determine peer type from message metadata
    const peer = message.metadata?.peerId ? {
      kind: (message.metadata?.peerKind as "dm" | "group" | "channel") || "dm",
      id: message.metadata.peerId as string,
    } : undefined;

    // Resolve agent route
    const route = resolveAgentRoute({
      config,
      channel: message.channelId as any,
      accountId: options?.accountId,
      peer,
      guildId: options?.guildId,
      teamId: options?.teamId,
    });

    // Get or create conversation for this route
    const conversationManager = this.getConversationManager(route.agentId);
    const conversation = conversationManager.getOrCreateMainConversation(route.agentId);
    
    // Resolve homedir directory
    const homedir = resolveAgentHomedir(config, route.agentId);

    return {
      conversationId: conversation.id,
      agentId: route.agentId,
      conversationKey: route.conversationKey,
      homedir,
    };
  }
}
