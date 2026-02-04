import { createInterface } from "node:readline";
import { GatewayClient } from "./gateway-client.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getCliConversationFile, getBaseDir } from "@server/world/homedir/paths.js";
import { ensureGatewayRunning, getGatewayServer } from "./gateway-utils.js";

const CONVERSATION_FILE = getCliConversationFile();

interface ConversationData {
  conversationId: string;
  agentId: string;
}

async function loadConversation(): Promise<ConversationData | null> {
  try {
    if (existsSync(CONVERSATION_FILE)) {
      const content = await readFile(CONVERSATION_FILE, "utf-8");
      return JSON.parse(content) as ConversationData;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

async function saveConversation(conversation: ConversationData): Promise<void> {
  try {
    const dir = getBaseDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(CONVERSATION_FILE, JSON.stringify(conversation, null, 2), "utf-8");
  } catch {
    // Ignore errors
  }
}

/**
 * Run agent interaction (used by new CLI commands)
 */
export async function runAgentInteraction(options: {
  message?: string;
  conversation?: string;
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

    // Get or create conversation
    let conversationId = options.conversation;
    if (!conversationId) {
      const saved = await loadConversation();
      if (saved && saved.agentId === (options.agent || "zuckerman")) {
        conversationId = saved.conversationId;
      } else {
        // Create new conversation
        const response = await client.call({
          method: "conversations.create",
          params: {
            label: `cli-${Date.now()}`,
            type: "main",
            agentId: options.agent || "zuckerman",
          },
        });

        if (!response.ok || !response.result) {
          throw new Error(`Failed to create conversation: ${response.error?.message || "Unknown error"}`);
        }

        const conversation = (response.result as { conversation: { id: string } }).conversation;
        conversationId = conversation.id;

        await saveConversation({
          conversationId,
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
          conversationId,
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
        await server.close("Agent conversation ended");
      }
      return;
    }

    // Interactive mode
    console.log(`\n🤖 Zuckerman Agent (conversation: ${conversationId.slice(0, 8)}...)\n`);
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
          await server.close("Agent conversation ended");
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
        const data = payload as { token?: string; conversationId?: string };
        if (data.token && data.conversationId === conversationId) {
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
        const data = payload as { tool?: string; toolArgs?: Record<string, unknown>; conversationId?: string };
        if (data.tool && data.conversationId === conversationId) {
          if (!isStreaming) {
            process.stdout.write(" ".repeat(20) + "\r");
            isStreaming = true;
          }
          process.stdout.write(`\n🔧 Calling tool: ${data.tool}\n`);
        }
      });

      const toolResultUnsub = client.on("agent.stream.tool.result", (payload: unknown) => {
        const data = payload as { tool?: string; toolResult?: unknown; conversationId?: string };
        if (data.tool && data.conversationId === conversationId) {
          const resultStr = data.toolResult 
            ? JSON.stringify(data.toolResult).substring(0, 100)
            : "completed";
          process.stdout.write(`🔧 Tool ${data.tool} result: ${resultStr}\n`);
        }
      });

      const lifecycleUnsub = client.on("agent.stream.lifecycle", (payload: unknown) => {
        const data = payload as { 
          conversationId?: string; 
          phase?: "start" | "end" | "error";
          error?: string;
          tokensUsed?: number;
        };
        if (data.conversationId === conversationId) {
          if (data.phase === "start") {
            // Run started
            isStreaming = false;
          } else if (data.phase === "end") {
            // Run completed
            if (data.tokensUsed) {
              process.stderr.write(`\n[Tokens: ${data.tokensUsed}]\n`);
            }
            isStreaming = false;
          } else if (data.phase === "error") {
            // Run error
            process.stderr.write(`\n❌ Error: ${data.error || "Unknown error"}\n`);
            isStreaming = false;
          }
        }
      });

      const doneUnsub = client.on("agent.stream.done", (payload: unknown) => {
        const data = payload as { conversationId?: string; tokensUsed?: number; toolsUsed?: string[] };
        if (data.conversationId === conversationId) {
          if (data.tokensUsed) {
            process.stderr.write(`\n[Tokens: ${data.tokensUsed}]\n`);
          }
          if (data.toolsUsed && data.toolsUsed.length > 0) {
            process.stderr.write(`[Tools used: ${data.toolsUsed.join(", ")}]\n`);
          }
        }
      });

      streamUnsubscribers.push(tokenUnsub, toolCallUnsub, toolResultUnsub, lifecycleUnsub, doneUnsub);

      try {
        const response = await client.call({
          method: "agent.run",
          params: {
            conversationId,
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
        await server.close("Agent conversation ended");
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
  conversation?: string;
  agent?: string;
  host?: string;
  port?: number;
}): Promise<void> {
  return runAgentInteraction(options);
}
