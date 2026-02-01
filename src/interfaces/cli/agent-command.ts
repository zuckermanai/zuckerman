import { createInterface } from "node:readline";
import { GatewayClient } from "./gateway-client.js";
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { ensureGatewayRunning, getGatewayServer } from "./gateway-utils.js";

const SESSION_FILE = join(process.cwd(), ".zuckerman", "cli-session.json");

interface SessionData {
  sessionId: string;
  agentId: string;
}

async function loadSession(): Promise<SessionData | null> {
  try {
    if (existsSync(SESSION_FILE)) {
      const content = await readFile(SESSION_FILE, "utf-8");
      return JSON.parse(content) as SessionData;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function saveSession(session: SessionData): Promise<void> {
  try {
    const dir = join(process.cwd(), ".zuckerman");
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(SESSION_FILE, JSON.stringify(session, null, 2), "utf-8");
  } catch {
    // Ignore errors
  }
}

/**
 * Run agent interaction (used by new CLI commands)
 */
export async function runAgentInteraction(options: {
  message?: string;
  session?: string;
  agent?: string;
  host?: string;
  port?: number;
}): Promise<void> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 18789;

  // Ensure gateway is running
  await ensureGatewayRunning(host, port);

  const client = new GatewayClient({
    host,
    port,
  });

  try {
    // Connect to gateway
    process.stderr.write("Connecting to gateway... ");
    await client.connect();
    process.stderr.write("✓\n");

    // Get or create session
    let sessionId = options.session;
    if (!sessionId) {
      const saved = await loadSession();
      if (saved && saved.agentId === (options.agent || "zuckerman")) {
        sessionId = saved.sessionId;
      } else {
        // Create new session
        const response = await client.call({
          method: "sessions.create",
          params: {
            label: `cli-${Date.now()}`,
            type: "main",
            agentId: options.agent || "zuckerman",
          },
        });

        if (!response.ok || !response.result) {
          throw new Error(`Failed to create session: ${response.error?.message || "Unknown error"}`);
        }

        const session = (response.result as { session: { id: string } }).session;
        sessionId = session.id;

        await saveSession({
          sessionId,
          agentId: options.agent || "zuckerman",
        });
      }
    }

    const agentId = options.agent || "zuckerman";

    // Single message mode
    if (options.message) {
      const response = await client.call({
        method: "agent.run",
        params: {
          sessionId,
          message: options.message,
          agentId,
        },
        timeout: 60000, // 60 second timeout for LLM calls
      });

      if (!response.ok) {
        throw new Error(response.error?.message || "Agent execution failed");
      }

      const result = response.result as {
        response: string;
        tokensUsed?: number;
      };

      // Print response with proper formatting
      console.log("\n" + result.response);
      if (result.tokensUsed) {
        process.stderr.write(`\n[Tokens: ${result.tokensUsed}]\n`);
      }

      client.disconnect();
      // Cleanup gateway if we started it
      const server = getGatewayServer();
      if (server) {
        await server.close("Agent session ended");
      }
      return;
    }

    // Interactive mode
    console.log(`\n🤖 Zuckerman Agent (session: ${sessionId.slice(0, 8)}...)\n`);
    console.log("Type your message and press Enter. Type 'exit' or 'quit' to end.\n");

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "> ",
    });

    // Handle reload events
    client.on("reload", () => {
      console.log("\n[Reload] Agent configuration reloaded\n");
      rl.prompt();
    });

    const askQuestion = (): void => {
      rl.prompt();

      rl.on("line", async (input: string) => {
        const message = input.trim();

        if (!message) {
          rl.prompt();
          return;
        }

        if (message === "exit" || message === "quit") {
          rl.close();
          client.disconnect();
          // Cleanup gateway if we started it
          const server = getGatewayServer();
          if (server) {
            await server.close("Agent session ended");
          }
          console.log("\nGoodbye!");
          return;
        }

        // Show thinking indicator
        process.stdout.write("🤔 Thinking...\r");

        try {
          const response = await client.call({
            method: "agent.run",
            params: {
              sessionId,
              message,
              agentId,
            },
            timeout: 60000,
          });

          // Clear thinking indicator
          process.stdout.write(" ".repeat(20) + "\r");

          if (!response.ok) {
            console.error(`\n❌ Error: ${response.error?.message || "Unknown error"}\n`);
            rl.prompt();
            return;
          }

          const result = response.result as {
            response: string;
            tokensUsed?: number;
          };

          console.log(`\n${result.response}\n`);
          if (result.tokensUsed) {
            process.stderr.write(`[Tokens: ${result.tokensUsed}]\n`);
          }
        } catch (err) {
          process.stdout.write(" ".repeat(20) + "\r");
          console.error(`\n❌ Error: ${err instanceof Error ? err.message : "Unknown error"}\n`);
        }

        rl.prompt();
      });
    };

    // Handle Ctrl+C gracefully
    rl.on("SIGINT", async () => {
      console.log("\n\nGoodbye!");
      rl.close();
      client.disconnect();
      // Cleanup gateway if we started it
      const server = getGatewayServer();
      if (server) {
        await server.close("Agent session ended");
      }
      process.exit(0);
    });

    askQuestion();
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
}

/**
 * Legacy export for backward compatibility
 */
export async function runAgentCommand(options: {
  message?: string;
  session?: string;
  agent?: string;
  host?: string;
  port?: number;
}): Promise<void> {
  return runAgentInteraction(options);
}
