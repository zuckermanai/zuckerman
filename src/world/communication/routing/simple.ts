import type { Router, Route } from "./types.js";
import type { ChannelMessage } from "@world/communication/messengers/channels/types.js";
import { SessionManager } from "@agents/zuckerman/sessions/index.js";
import { resolveAgentRoute, resolveAgentLand } from "./resolver.js";
import { loadConfig } from "@world/config/index.js";
import type { AgentRuntimeFactory } from "@world/runtime/agents/index.js";

export interface RoutedMessage {
  sessionId: string;
  agentId: string;
  sessionKey: string;
  landDir: string;
}

export class SimpleRouter implements Router {
  private routes: Route[] = [];
  private agentFactory: AgentRuntimeFactory;

  constructor(agentFactory: AgentRuntimeFactory) {
    this.agentFactory = agentFactory;
  }

  /**
   * Get session manager for an agent
   */
  private getSessionManager(agentId: string): SessionManager {
    return this.agentFactory.getSessionManager(agentId);
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
          return route.sessionId;
        }
      }
    }

    // Default: use main session for default agent
    const config = await loadConfig();
    const defaultAgent = config.agents?.list?.find((a) => a.default) || config.agents?.list?.[0];
    const agentId = defaultAgent?.id || "zuckerman";
    const sessionManager = this.getSessionManager(agentId);
    const mainSession = sessionManager.getOrCreateMainSession(agentId);
    return mainSession.id;
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

    // Get or create session for this route
    const sessionManager = this.getSessionManager(route.agentId);
    const session = sessionManager.getOrCreateMainSession(route.agentId);
    
    // Resolve land directory
    const landDir = resolveAgentLand(config, route.agentId);

    return {
      sessionId: session.id,
      agentId: route.agentId,
      sessionKey: route.sessionKey,
      landDir,
    };
  }
}
