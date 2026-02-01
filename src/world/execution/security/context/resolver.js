import { resolveSecurityContext as resolvePolicy } from "../policy/resolver.js";
import { ensureSandboxContainer } from "../sandbox/manager.js";
/**
 * Resolve full security context including sandbox
 */
export async function resolveSecurityContext(config, sessionId, sessionType, agentId, landDir, agentLandDir) {
    // Resolve policy-based context
    const context = resolvePolicy(config, sessionId, sessionType, agentId);
    // Resolve sandbox if needed
    let sandboxContext = null;
    if (context.isSandboxed && config?.sandbox) {
        try {
            sandboxContext = await ensureSandboxContainer({
                sessionId,
                agentId,
                workspaceDir: landDir,
                agentWorkspaceDir: agentLandDir,
                config: config.sandbox,
            });
        }
        catch (err) {
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
//# sourceMappingURL=resolver.js.map