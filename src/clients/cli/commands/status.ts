import { Command } from "commander";
import { GatewayClient } from "../gateway-client.js";
import { ensureGatewayRunning, isGatewayRunning } from "../gateway-utils.js";
import { outputJson, shouldOutputJson } from "../utils/json-output.js";

export function createStatusCommand(): Command {
  const cmd = new Command("status")
    .description("Show overall system status (World, Gateway, Agents, Conversations)")
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
        const agentsRaw = agentsResponse.ok && agentsResponse.result
          ? ((agentsResponse.result as { agents: string[] | Array<{ id: string }> }).agents || [])
          : [];
        // Handle both formats: array of strings or array of objects
        const agents = agentsRaw.map((agent) => 
          typeof agent === "string" ? { id: agent } : agent
        );

        // Get conversations
        const conversationsResponse = await client.call({ method: "conversations.list" });
        const conversations = conversationsResponse.ok && conversationsResponse.result
          ? ((conversationsResponse.result as { conversations: Array<{ id: string }> }).conversations || [])
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
          conversations: {
            count: conversations.length,
            list: conversations.map(c => ({ id: c.id })),
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

          // Conversations
          console.log(`💬 Conversations: ${conversations.length}`);
          if (conversations.length > 0) {
            conversations.forEach((conversation) => {
              console.log(`   • ${conversation.id.slice(0, 8)}...`);
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
