import type { SecurityConfig, SecurityContext } from "../types.js";
import type { ConversationType } from "@server/agents/zuckerman/conversations/types.js";
import { resolveSecurityContext as resolvePolicy } from "../policy/resolver.js";
import { ensureSandboxContainer } from "../sandbox/manager.js";
import type { SandboxContext } from "../types.js";

/**
 * Resolve full security context including sandbox
 */
export async function resolveSecurityContext(
  config: SecurityConfig | undefined,
  conversationId: string,
  conversationType: ConversationType,
  agentId: string,
  homedir: string,
  agentHomedir?: string,
): Promise<SecurityContext> {
  // Resolve policy-based context
  const context = resolvePolicy(config, conversationId, conversationType, agentId);

  // Resolve sandbox if needed
  let sandboxContext: SandboxContext | null = null;
  if (context.isSandboxed && config?.sandbox) {
    try {
      sandboxContext = await ensureSandboxContainer({
        conversationId,
        agentId,
        workspaceDir: homedir,
        agentWorkspaceDir: agentHomedir,
        config: config.sandbox,
      });
    } catch (err) {
      console.error(`[Security] Failed to create sandbox:`, err);
      // Fallback to non-sandboxed if sandbox creation fails
      return {
        ...context,
        isSandboxed: false,
      };
    }
  }

  return {
    ...context,
    sandboxContainerName: sandboxContext?.containerName,
  };
}
