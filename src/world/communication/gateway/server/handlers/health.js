const startTime = Date.now();
const VERSION = "0.1.0";
export function createHealthHandlers() {
    return {
        health: async ({ respond, params }) => {
            const wantsProbe = params?.probe === true;
            const health = {
                ts: Date.now(),
                uptime: Date.now() - startTime,
                version: VERSION,
                status: "healthy",
            };
            respond(true, health);
        },
        ping: async ({ respond }) => {
            respond(true, { pong: Date.now() });
        },
        methods: async ({ respond }) => {
            // Return list of available methods
            respond(true, {
                methods: [
                    "health",
                    "ping",
                    "methods",
                    "sessions.create",
                    "sessions.list",
                    "sessions.get",
                    "sessions.delete",
                    "agents.list",
                    "agent.run",
                    "agent.prompts",
                ],
            });
        },
    };
}
//# sourceMappingURL=health.js.map