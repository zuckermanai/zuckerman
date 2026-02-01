import { Command } from "commander";
import { GatewayClient } from "../gateway-client.js";
import { ensureGatewayRunning, getGatewayServer } from "../gateway-utils.js";
import { runAgentInteraction } from "../agent-command.js";
import { outputJson, shouldOutputJson, parseJsonInput } from "../utils/json-output.js";

export function createAgentsCommand(): Command {
  const cmd = new Command("agents")
    .description("Work with agents (list, interact)")
    .argument("[agent-id]", "Agent ID (shorthand for 'run')")
    .option("-s, --session <session>", "Session ID to use")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .action(async (
      agentId: string | undefined,
      options: {
        session?: string;
        host?: string;
        port?: string;
      },
    ) => {
      // If agent-id provided, run it (shorthand) - but without message option
      // Users should use 'agents run' for single message mode
      if (agentId) {
        await runAgentInteraction({
          agent: agentId,
          session: options.session,
          host: options.host,
          port: options.port ? parseInt(options.port, 10) : undefined,
        });
        return;
      }

      // Otherwise show help
      cmd.help();
    });

  cmd
    .command("list")
    .description("List all available agents")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .action(async (options: { host?: string; port?: string; json?: boolean }) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();
        const response = await client.call({ method: "agents.list" });

        if (!response.ok || !response.result) {
          console.error("Failed to list agents:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as { agents: string[] | Array<{ id: string; name?: string }> };
        // Handle both formats: array of strings or array of objects
        const agentsRaw = result.agents || [];
        const agents = agentsRaw.map((agent) => 
          typeof agent === "string" ? { id: agent } : agent
        );

        if (shouldOutputJson(options)) {
          outputJson({ agents }, options);
        } else {
          if (agents.length === 0) {
            console.log("No agents found.");
          } else {
            console.log("Available agents:");
            agents.forEach((agent) => {
              const name = agent.name || agent.id;
              console.log(`  • ${agent.id}${name !== agent.id ? ` (${name})` : ""}`);
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

  cmd
    .command("run")
    .description("Run an agent (interactive or single message)")
    .argument("<agent-id>", "Agent ID to run")
    .option("-m, --message <message>", "Send a single message (non-interactive)")
    .option("-s, --session <session>", "Session ID to use")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON (only works with --message)")
    .option("--input <json>", "JSON input for message data (or pipe JSON)")
    .action(async (
      agentId: string,
      options: {
        message?: string;
        session?: string;
        host?: string;
        port?: string;
        json?: boolean;
        input?: string;
      },
    ) => {
      // Debug: log options to see what we're getting
      if (process.env.DEBUG_CLI) {
        console.error("DEBUG: options.message =", options.message);
        console.error("DEBUG: options =", JSON.stringify(options, null, 2));
        console.error("DEBUG: options keys =", Object.keys(options));
      }
      
      // Commander.js might pass options differently - check both message and m
      const message = (options as any).message || (options as any).m;
      
      // If message provided, handle it directly (single message mode)
      if (message) {
        const host = options.host ?? "127.0.0.1";
        const port = options.port ? parseInt(options.port, 10) : 18789;

        await ensureGatewayRunning(host, port);

        const client = new GatewayClient({ host, port });
        try {
          await client.connect();

          // Parse JSON input if provided (only if --input is used)
          let messageData: { message?: string; sessionId?: string } = {};
          if (options.input) {
            const input = await parseJsonInput(options.input);
            messageData = input as typeof messageData;
          } else if (!process.stdin.isTTY && options.json) {
            // Only try to read from stdin if JSON mode and stdin is not a TTY
            try {
              const input = await parseJsonInput();
              messageData = input as typeof messageData;
            } catch {
              // Ignore stdin errors if no input provided
            }
          }

          const finalMessage = messageData.message || message;
          const sessionId = messageData.sessionId || options.session;

          if (!finalMessage) {
            console.error("Error: Message is required");
            process.exit(1);
          }

          // Get or create session
          let finalSessionId = sessionId;
          if (!finalSessionId) {
            const sessionResponse = await client.call({
              method: "sessions.create",
              params: {
                label: `cli-${Date.now()}`,
                type: "main",
                agentId,
              },
            });
            if (sessionResponse.ok && sessionResponse.result) {
              const sessionResult = sessionResponse.result as { session: { id: string } };
              finalSessionId = sessionResult.session.id;
            }
          }

          const response = await client.call({
            method: "agent.run",
            params: {
              sessionId: finalSessionId,
              agentId,
              message: finalMessage,
            },
            // No timeout - let requests complete naturally
          });

          if (!response.ok) {
            console.error("Failed to run agent:", response.error?.message);
            process.exit(1);
          }

          // Output result - JSON format if --json flag, otherwise plain text
          if (options.json) {
            outputJson(response.result, options);
          } else {
            const result = response.result as {
              response: string;
              tokensUsed?: number;
            };
            console.log(result.response);
            if (result.tokensUsed) {
              process.stderr.write(`\n[Tokens: ${result.tokensUsed}]\n`);
            }
          }
          
          client.disconnect();
          return;
        } catch (err) {
          client.disconnect();
          console.error("Error:", err instanceof Error ? err.message : "Unknown error");
          process.exit(1);
        }
      }

      // Otherwise use the interactive handler
      await runAgentInteraction({
        agent: agentId,
        message: options.message,
        session: options.session,
        host: options.host,
        port: options.port ? parseInt(options.port, 10) : undefined,
      });
    });

  cmd
    .command("prompts")
    .description("Get prompts for an agent")
    .argument("<agent-id>", "Agent ID")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .action(async (
      agentId: string,
      options: {
        host?: string;
        port?: string;
        json?: boolean;
      },
    ) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();
        const response = await client.call({
          method: "agent.prompts",
          params: { agentId },
        });

        if (!response.ok || !response.result) {
          console.error("Failed to load prompts:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as {
          agentId: string;
          system?: string;
          behavior?: string;
          personality?: string;
          instructions?: string;
          fileCount?: number;
          additionalFiles?: string[];
        };

        if (shouldOutputJson(options)) {
          outputJson(result, options);
        } else {
          console.log(`\nPrompts for agent: ${result.agentId}\n`);
          
          if (result.system) {
            console.log("=== System Prompt ===");
            console.log(result.system);
            console.log();
          }
          
          if (result.behavior) {
            console.log("=== Behavior ===");
            console.log(result.behavior);
            console.log();
          }
          
          if (result.personality) {
            console.log("=== Personality ===");
            console.log(result.personality);
            console.log();
          }
          
          if (result.instructions) {
            console.log("=== Instructions ===");
            console.log(result.instructions);
            console.log();
          }
          
          if (result.additionalFiles && result.additionalFiles.length > 0) {
            console.log(`\n=== Additional Prompt Files ===`);
            result.additionalFiles.forEach((fileName) => {
              console.log(`- ${fileName}`);
            });
          } else if (result.fileCount !== undefined && result.fileCount > 0) {
            console.log(`\n(${result.fileCount} additional prompt file${result.fileCount !== 1 ? "s" : ""})`);
          }
          
          if (!result.system && !result.behavior && !result.personality && !result.instructions && (!result.additionalFiles || result.additionalFiles.length === 0)) {
            console.log("No prompts found for this agent.");
          }
        }

        client.disconnect();
        
        // Cleanup gateway if we started it
        const server = getGatewayServer();
        if (server) {
          await server.close("Prompts command completed");
        }
      } catch (err) {
        client.disconnect();
        
        // Cleanup gateway if we started it
        const server = getGatewayServer();
        if (server) {
          await server.close("Error occurred");
        }
        
        console.error("Error:", err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    });

  return cmd;
}
