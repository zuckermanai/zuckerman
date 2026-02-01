import { Command } from "commander";
import { GatewayClient } from "../gateway-client.js";
import { ensureGatewayRunning, isGatewayRunning } from "../gateway-utils.js";
import { outputJson, shouldOutputJson } from "../utils/json-output.js";

export function createStatusCommand(): Command {
  const cmd = new Command("status")
    .description("Show overall system status (World, Gateway, Agents, Sessions)")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .action(async (options: { host?: string; port?: string; json?: boolean }) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      // Check gateway status first
      const gatewayRunning = await isGatewayRunning(host, port);
      if (!gatewayRunning) {
        console.log("🌐 Gateway: Not running");
        console.log("   Run 'zuckerman gateway start' to start it");
        return;
      }

      // Connect and get all status info
      await ensureGatewayRunning(host, port);
      const client = new GatewayClient({ host, port });

      try {
        await client.connect();

        // Get gateway health
        const healthResponse = await client.call({ method: "health" });
        const health = healthResponse.ok && healthResponse.result
          ? (healthResponse.result as { status: string; version: string; uptime: number })
          : null;

        // Get agents
        const agentsResponse = await client.call({ method: "agents.list" });
        const agents = agentsResponse.ok && agentsResponse.result
          ? ((agentsResponse.result as { agents: Array<{ id: string }> }).agents || [])
          : [];

        // Get sessions
        const sessionsResponse = await client.call({ method: "sessions.list" });
        const sessions = sessionsResponse.ok && sessionsResponse.result
          ? ((sessionsResponse.result as { sessions: Array<{ id: string }> }).sessions || [])
          : [];

        const statusData = {
          gateway: health ? {
            status: health.status,
            version: health.version,
            uptime: health.uptime,
            uptimeSeconds: Math.floor(health.uptime / 1000),
            address: `ws://${host}:${port}`,
          } : null,
          agents: {
            count: agents.length,
            list: agents.map(a => ({ id: a.id })),
          },
          sessions: {
            count: sessions.length,
            list: sessions.map(s => ({ id: s.id })),
          },
        };

        if (shouldOutputJson(options)) {
          outputJson(statusData, options);
        } else {
          // Display status
          console.log("📊 Zuckerman Status\n");

          // Gateway (World)
          if (health) {
            console.log("🌐 Gateway (World):");
            console.log(`   Status: ${health.status}`);
            console.log(`   Version: ${health.version}`);
            console.log(`   Uptime: ${Math.floor(health.uptime / 1000)}s`);
            console.log(`   Address: ws://${host}:${port}`);
          } else {
            console.log("🌐 Gateway (World): Unknown");
          }

          console.log();

          // Agents
          console.log(`🤖 Agents: ${agents.length}`);
          if (agents.length > 0) {
            agents.forEach((agent) => {
              console.log(`   • ${agent.id}`);
            });
          }

          console.log();

          // Sessions
          console.log(`💬 Sessions: ${sessions.length}`);
          if (sessions.length > 0) {
            sessions.forEach((session) => {
              console.log(`   • ${session.id.slice(0, 8)}...`);
            });
          }
        }

        client.disconnect();
      } catch (err) {
        client.disconnect();
        console.error("Error:", err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    });

  return cmd;
}
