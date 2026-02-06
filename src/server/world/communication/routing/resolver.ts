import type { ZuckermanConfig, AgentBinding } from "@server/world/config/types.js";
import type { ChannelType } from "@server/world/communication/messengers/channels/types.js";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ResolveRouteInput {
  config: ZuckermanConfig;
  channel: ChannelType;
  accountId?: string;
  peer?: {
    kind: "dm" | "group" | "channel";
    id: string;
  };
  guildId?: string; // Discord
  teamId?: string; // Slack
}

export interface ResolvedRoute {
  agentId: string;
  channel: ChannelType;
  accountId?: string;
  conversationKey: string;
  matchedBy: "binding.peer" | "binding.guild" | "binding.team" | "binding.account" | "binding.channel" | "default";
}

function normalizeId(id: string | undefined | null): string | null {
  if (!id) return null;
  return id.trim().toLowerCase();
}

function matchesChannel(bindingChannel: string | undefined, messageChannel: ChannelType): boolean {
  if (!bindingChannel) return true;
  return bindingChannel.toLowerCase() === messageChannel.toLowerCase();
}

function matchesAccountId(bindingAccountId: string | undefined, messageAccountId: string | undefined): boolean {
  if (!bindingAccountId) return true;
  if (bindingAccountId === "*") return true;
  if (!messageAccountId) return false;
  return bindingAccountId.toLowerCase() === messageAccountId.toLowerCase();
}

function matchesPeer(bindingPeer: AgentBinding["match"]["peer"] | undefined, messagePeer: ResolveRouteInput["peer"]): boolean {
  if (!bindingPeer || !messagePeer) return false;
  return bindingPeer.kind === messagePeer.kind && normalizeId(bindingPeer.id) === normalizeId(messagePeer.id);
}

function matchesGuild(bindingGuildId: string | undefined, messageGuildId: string | undefined): boolean {
  if (!bindingGuildId || !messageGuildId) return false;
  return normalizeId(bindingGuildId) === normalizeId(messageGuildId);
}

function matchesTeam(bindingTeamId: string | undefined, messageTeamId: string | undefined): boolean {
  if (!bindingTeamId || !messageTeamId) return false;
  return normalizeId(bindingTeamId) === normalizeId(messageTeamId);
}

function listBindings(config: ZuckermanConfig): AgentBinding[] {
  return config.routing?.bindings || [];
}

function pickFirstExistingAgentId(config: ZuckermanConfig, agentId: string): string {
  const agents = config.agents?.list || [];
  const exists = agents.some(a => a.id === agentId);
  if (exists) return agentId;
  
  // Fallback to first agent or default
  const defaultAgent = agents.find(a => a.default) || agents[0];
  return defaultAgent?.id || agentId;
}

function buildConversationKey(params: {
  agentId: string;
  channel: ChannelType;
  accountId?: string;
  peer?: ResolveRouteInput["peer"];
}): string {
  const { agentId, channel, accountId, peer } = params;
  
  if (peer) {
    if (peer.kind === "dm") {
      // Direct messages collapse to main conversation
      return `agent:${agentId}:main`;
    }
    // Groups/channels get isolated conversations
    return `agent:${agentId}:${channel}:${peer.kind}:${peer.id}`;
  }
  
  // Default main conversation
  return `agent:${agentId}:main`;
}

/**
 * Resolve which agent should handle a message based on routing rules
 */
export function resolveAgentRoute(input: ResolveRouteInput): ResolvedRoute {
  const { config, channel, accountId, peer, guildId, teamId } = input;
  
  const bindings = listBindings(config).filter((binding) => {
    if (!binding || typeof binding !== "object") return false;
    if (!matchesChannel(binding.match.channel, channel)) return false;
    return matchesAccountId(binding.match.accountId, accountId);
  });

  const choose = (agentId: string, matchedBy: ResolvedRoute["matchedBy"]) => {
    const resolvedAgentId = pickFirstExistingAgentId(config, agentId);
    const conversationKey = buildConversationKey({
      agentId: resolvedAgentId,
      channel,
      accountId,
      peer,
    });
    
    return {
      agentId: resolvedAgentId,
      channel,
      accountId,
      conversationKey,
      matchedBy,
    };
  };

  // 1. Exact peer match (most specific)
  if (peer) {
    const peerMatch = bindings.find((b) => matchesPeer(b.match.peer, peer));
    if (peerMatch) return choose(peerMatch.agentId, "binding.peer");
  }

  // 2. Guild match (Discord)
  if (guildId) {
    const guildMatch = bindings.find((b) => matchesGuild(b.match.guildId, guildId));
    if (guildMatch) return choose(guildMatch.agentId, "binding.guild");
  }

  // 3. Team match (Slack)
  if (teamId) {
    const teamMatch = bindings.find((b) => matchesTeam(b.match.teamId, teamId));
    if (teamMatch) return choose(teamMatch.agentId, "binding.team");
  }

  // 4. Account match
  if (accountId) {
    const accountMatch = bindings.find(
      (b) => b.match.accountId && b.match.accountId !== "*" && matchesAccountId(b.match.accountId, accountId)
    );
    if (accountMatch) return choose(accountMatch.agentId, "binding.account");
  }

  // 5. Channel match (any account on that channel)
  const channelMatch = bindings.find((b) => !b.match.peer && !b.match.accountId);
  if (channelMatch) return choose(channelMatch.agentId, "binding.channel");

  // 6. Default agent
  const agents = config.agents?.list || [];
  const defaultAgent = agents.find(a => a.default) || agents[0];
  const defaultAgentId = defaultAgent?.id || "zuckerman";
  
  return choose(defaultAgentId, "default");
}

// Homedir resolution in world/homedir/resolver
// Re-export for backward compatibility
export { resolveAgentHomedir as resolveAgentHomedir } from "@server/world/homedir/resolver.js";
