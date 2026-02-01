import type { SecurityConfig, SecurityContext } from "../types.js";
import type { SessionType } from "@agents/zuckerman/sessions/types.js";
import { resolveSecurityContext as resolvePolicy } from "../policy/resolver.js";
import { ensureSandboxContainer } from "../sandbox/manager.js";
import type { SandboxContext } from "../types.js";

/**
 * Resolve full security context including sandbox
 */
export async function resolveSecurityContext(
  config: SecurityConfig | undefined,
  sessionId: string,
  sessionType: SessionType,
  agentId: string,
  landDir: string,
  agentLandDir?: string,
): Promise<SecurityContext> {
  // Resolve policy-based context
  const context = resolvePolicy(config, sessionId, sessionType, agentId);

  // Resolve sandbox if needed
  let sandboxContext: SandboxContext | null = null;
  if (context.isSandboxed && config?.sandbox) {
    try {
      sandboxContext = await ensureSandboxContainer({
        sessionId,
        agentId,
        workspaceDir: landDir,
        agentWorkspaceDir: agentLandDir,
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
