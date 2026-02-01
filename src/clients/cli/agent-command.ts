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
        // No timeout - let requests complete naturally
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

    // Set up line handler once (not inside a function)
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

      // Set up streaming event listeners
      let streamedContent = "";
      let isStreaming = false;
      const streamUnsubscribers: Array<() => void> = [];

      const tokenUnsub = client.on("agent.stream.token", (payload: unknown) => {
        const data = payload as { token?: string; sessionId?: string };
        if (data.token && data.sessionId === sessionId) {
          if (!isStreaming) {
            // Clear thinking indicator and start streaming
            process.stdout.write(" ".repeat(20) + "\r");
            isStreaming = true;
          }
          streamedContent += data.token;
          process.stdout.write(data.token);
        }
      });

      const toolCallUnsub = client.on("agent.stream.tool.call", (payload: unknown) => {
        const data = payload as { tool?: string; toolArgs?: Record<string, unknown>; sessionId?: string };
        if (data.tool && data.sessionId === sessionId) {
          if (!isStreaming) {
            process.stdout.write(" ".repeat(20) + "\r");
            isStreaming = true;
          }
          process.stdout.write(`\n🔧 Calling tool: ${data.tool}\n`);
        }
      });

      const toolResultUnsub = client.on("agent.stream.tool.result", (payload: unknown) => {
        const data = payload as { tool?: string; toolResult?: unknown; sessionId?: string };
        if (data.tool && data.sessionId === sessionId) {
          const resultStr = data.toolResult 
            ? JSON.stringify(data.toolResult).substring(0, 100)
            : "completed";
          process.stdout.write(`🔧 Tool ${data.tool} result: ${resultStr}\n`);
        }
      });

      const doneUnsub = client.on("agent.stream.done", (payload: unknown) => {
        const data = payload as { sessionId?: string; tokensUsed?: number; toolsUsed?: string[] };
        if (data.sessionId === sessionId) {
          if (data.tokensUsed) {
            process.stderr.write(`\n[Tokens: ${data.tokensUsed}]\n`);
          }
          if (data.toolsUsed && data.toolsUsed.length > 0) {
            process.stderr.write(`[Tools used: ${data.toolsUsed.join(", ")}]\n`);
          }
        }
      });

      streamUnsubscribers.push(tokenUnsub, toolCallUnsub, toolResultUnsub, doneUnsub);

      try {
        const response = await client.call({
          method: "agent.run",
          params: {
            sessionId,
            message,
            agentId,
          },
          // No timeout - let requests complete naturally
        });

        // Clean up event listeners
        streamUnsubscribers.forEach((unsub) => unsub());

        // Clear thinking indicator if not streaming
        if (!isStreaming) {
          process.stdout.write(" ".repeat(20) + "\r");
        } else {
          // Add newline after streaming
          process.stdout.write("\n");
        }

        if (!response.ok) {
          console.error(`\n❌ Error: ${response.error?.message || "Unknown error"}\n`);
          rl.prompt();
          return;
        }

        // If we didn't stream, show the response normally
        if (!isStreaming) {
          const result = response.result as {
            response: string;
            tokensUsed?: number;
          };

          console.log(`\n${result.response}\n`);
          if (result.tokensUsed) {
            process.stderr.write(`[Tokens: ${result.tokensUsed}]\n`);
          }
        }
      } catch (err) {
        // Clean up event listeners on error
        streamUnsubscribers.forEach((unsub) => unsub());
        process.stdout.write(" ".repeat(20) + "\r");
        console.error(`\n❌ Error: ${err instanceof Error ? err.message : "Unknown error"}\n`);
      }

      rl.prompt();
    });

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

    // Start the prompt
    rl.prompt();
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
