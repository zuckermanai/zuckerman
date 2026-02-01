/**
 * Resolve security context for a session
 */
export function resolveSecurityContext(config, sessionId, sessionType, agentId) {
    const sandboxConfig = config?.sandbox ?? { mode: "off" };
    const isSandboxed = shouldSandbox(sandboxConfig, sessionType);
    // Resolve tool policy
    const toolPolicy = resolveToolPolicy(config, sessionType, isSandboxed);
    // Resolve execution policy
    const executionPolicy = resolveExecutionPolicy(config, sessionType);
    // Resolve workspace access
    const workspaceAccess = resolveWorkspaceAccess(config, sessionType, isSandboxed);
    return {
        sessionId,
        sessionType,
        agentId,
        isSandboxed,
        toolPolicy,
        executionPolicy,
        workspaceAccess,
    };
}
function shouldSandbox(sandboxConfig, sessionType) {
    if (sandboxConfig.mode === "off" || sandboxConfig.enabled === false) {
        return false;
    }
    if (sandboxConfig.mode === "all") {
        return true;
    }
    // "non-main" mode: sandbox non-main sessions
    if (sandboxConfig.mode === "non-main") {
        return sessionType !== "main";
    }
    return false;
}
function resolveToolPolicy(config, sessionType, isSandboxed) {
    // Start with global tool policy
    const globalPolicy = {
        profile: config?.tools?.profile ?? "full",
        allow: config?.tools?.allow,
        deny: config?.tools?.deny,
    };
    // Apply session-specific overrides
    const sessionConfig = config?.sessions?.[sessionType];
    if (sessionConfig?.tools) {
        const sessionPolicy = {
            ...globalPolicy,
            profile: sessionConfig.tools.profile ?? globalPolicy.profile,
            allow: sessionConfig.tools.allow ?? globalPolicy.allow,
            deny: [
                ...(globalPolicy.deny ?? []),
                ...(sessionConfig.tools.deny ?? []),
            ],
        };
        // Apply sandbox-specific restrictions if sandboxed
        if (isSandboxed && config?.tools?.sandbox?.tools) {
            return {
                ...sessionPolicy,
                allow: config.tools.sandbox.tools.allow ?? sessionPolicy.allow,
                deny: [
                    ...(sessionPolicy.deny ?? []),
                    ...(config.tools.sandbox.tools.deny ?? []),
                ],
            };
        }
        return sessionPolicy;
    }
    // Apply sandbox-specific restrictions if sandboxed
    if (isSandboxed && config?.tools?.sandbox?.tools) {
        return {
            ...globalPolicy,
            allow: config.tools.sandbox.tools.allow ?? globalPolicy.allow,
            deny: [
                ...(globalPolicy.deny ?? []),
                ...(config.tools.sandbox.tools.deny ?? []),
            ],
        };
    }
    return globalPolicy;
}
function resolveExecutionPolicy(config, sessionType) {
    const globalExecution = config?.execution ?? {};
    const sessionExecution = config?.sessions?.[sessionType]?.execution ?? {};
    return {
        allowlist: sessionExecution.allowlist ?? globalExecution.allowlist,
        denylist: sessionExecution.denylist ?? globalExecution.denylist,
        timeout: sessionExecution.timeout ?? globalExecution.timeout ?? 30000,
        maxOutput: sessionExecution.maxOutput ?? globalExecution.maxOutput ?? 10485760, // 10MB
        maxProcesses: sessionExecution.maxProcesses ?? globalExecution.maxProcesses,
        allowedPaths: sessionExecution.allowedPaths ?? globalExecution.allowedPaths,
        blockedPaths: sessionExecution.blockedPaths ?? globalExecution.blockedPaths,
    };
}
function resolveWorkspaceAccess(config, sessionType, isSandboxed) {
    if (!isSandboxed) {
        return "rw"; // Host access is read-write
    }
    const sandboxConfig = config?.sandbox;
    const sessionConfig = config?.sessions?.[sessionType];
    // Session-specific override
    if (sessionConfig?.sandbox === false) {
        return "rw";
    }
    // Sandbox workspace access
    return sandboxConfig?.workspaceAccess ?? "rw";
}
//# sourceMappingURL=resolver.js.map