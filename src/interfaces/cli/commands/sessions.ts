import { Command } from "commander";
import { GatewayClient } from "../gateway-client.js";
import { ensureGatewayRunning } from "../gateway-utils.js";
import { outputJson, shouldOutputJson, parseJsonInput } from "../utils/json-output.js";

export function createSessionsCommand(): Command {
  const cmd = new Command("sessions")
    .description("Manage sessions (conversation state)");

  cmd
    .command("list")
    .description("List all sessions")
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
        const response = await client.call({ method: "sessions.list" });

        if (!response.ok || !response.result) {
          console.error("Failed to list sessions:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as {
          sessions: Array<{
            id: string;
            label: string;
            type: string;
            agentId?: string;
            createdAt: number;
            lastActivity: number;
          }>;
        };
        const sessions = result.sessions || [];

        if (shouldOutputJson(options)) {
          outputJson({ sessions }, options);
        } else {
          if (sessions.length === 0) {
            console.log("No sessions found.");
          } else {
            console.log("Sessions:");
            sessions.forEach((session) => {
              const created = new Date(session.createdAt).toLocaleString();
              const lastActivity = new Date(session.lastActivity).toLocaleString();
              console.log(`  ${session.id.slice(0, 8)}...`);
              console.log(`    Label: ${session.label}`);
              console.log(`    Type: ${session.type}`);
              if (session.agentId) {
                console.log(`    Agent: ${session.agentId}`);
              }
              console.log(`    Created: ${created}`);
              console.log(`    Last Activity: ${lastActivity}`);
              console.log();
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
    .command("get")
    .description("Get session details")
    .argument("<session-id>", "Session ID")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .action(async (sessionId: string, options: { host?: string; port?: string; json?: boolean }) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();
        const response = await client.call({
          method: "sessions.get",
          params: { id: sessionId },
        });

        if (!response.ok || !response.result) {
          console.error("Failed to get session:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as {
          session: {
            session: {
              id: string;
              label: string;
              type: string;
              agentId?: string;
              createdAt: number;
              lastActivity: number;
            };
            messages: Array<{
              role: string;
              content: string;
              timestamp: number;
            }>;
          };
        };

        const { session, messages } = result.session;

        if (shouldOutputJson(options)) {
          outputJson({ session, messages }, options);
        } else {
          console.log(`Session: ${session.id}`);
          console.log(`Label: ${session.label}`);
          console.log(`Type: ${session.type}`);
          if (session.agentId) {
            console.log(`Agent: ${session.agentId}`);
          }
          console.log(`Created: ${new Date(session.createdAt).toLocaleString()}`);
          console.log(`Last Activity: ${new Date(session.lastActivity).toLocaleString()}`);
          console.log(`Messages: ${messages.length}`);
          console.log();

          if (messages.length > 0) {
            console.log("Message History:");
            messages.forEach((msg, idx) => {
              const time = new Date(msg.timestamp).toLocaleTimeString();
              console.log(`\n[${idx + 1}] ${msg.role.toUpperCase()} (${time})`);
              console.log(msg.content);
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
    .command("create")
    .description("Create a new session")
    .option("--type <type>", "Session type (main, group, channel)", "main")
    .option("--agent-id <agent-id>", "Agent ID")
    .option("--label <label>", "Session label")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .option("--input <json>", "JSON input for session data (or pipe JSON)")
    .action(async (options: {
      type?: string;
      agentId?: string;
      label?: string;
      host?: string;
      port?: string;
      json?: boolean;
      input?: string;
    }) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();

        // Parse JSON input if provided (only if --input is used)
        let sessionData: { type?: string; agentId?: string; label?: string } = {};
        if (options.input) {
          const input = await parseJsonInput(options.input);
          sessionData = input as typeof sessionData;
        }

        const params = {
          type: sessionData.type || options.type || "main",
          agentId: sessionData.agentId || options.agentId,
          label: sessionData.label || options.label || `session-${Date.now()}`,
        };

        const response = await client.call({
          method: "sessions.create",
          params,
        });

        if (!response.ok || !response.result) {
          console.error("Failed to create session:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as { session: { id: string; label: string; type: string; agentId?: string } };

        if (shouldOutputJson(options)) {
          outputJson(result, options);
        } else {
          console.log(`Session created: ${result.session.id}`);
          console.log(`Label: ${result.session.label}`);
          console.log(`Type: ${result.session.type}`);
          if (result.session.agentId) {
            console.log(`Agent: ${result.session.agentId}`);
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
    .command("delete")
    .description("Delete a session")
    .argument("<session-id>", "Session ID")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .action(async (sessionId: string, options: { host?: string; port?: string; json?: boolean }) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();
        const response = await client.call({
          method: "sessions.delete",
          params: { id: sessionId },
        });

        if (!response.ok) {
          console.error("Failed to delete session:", response.error?.message);
          process.exit(1);
        }

        if (shouldOutputJson(options)) {
          outputJson({ deleted: true, sessionId }, options);
        } else {
          console.log(`Session ${sessionId} deleted.`);
        }
        client.disconnect();
      } catch (err) {
        client.disconnect();
        console.error("Error:", err instanceof Error ? err.message : "Unknown error");
        process.exit(1);
      }
    });

  cmd
    .command("send")
    .description("Send a message to a session")
    .argument("<session-id>", "Session ID")
    .option("-m, --message <message>", "Message to send")
    .option("-a, --agent <agent-id>", "Agent ID (required if session doesn't have one)")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .option("--input <json>", "JSON input for message data (or pipe JSON)")
    .action(async (
      sessionId: string,
      options: {
        message?: string;
        agent?: string;
        host?: string;
        port?: string;
        json?: boolean;
        input?: string;
      },
    ) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();

        // Parse JSON input if provided (only if --input is used)
        let messageData: { message?: string; agentId?: string } = {};
        if (options.input) {
          const input = await parseJsonInput(options.input);
          messageData = input as typeof messageData;
        }

        const message = messageData.message || options.message;
        if (!message) {
          console.error("Error: Message is required. Use --message <text> or --input <json>");
          process.exit(1);
        }

        // Get session to find agentId if not provided
        let agentId = messageData.agentId || options.agent;
        if (!agentId) {
          const sessionResponse = await client.call({
            method: "sessions.get",
            params: { id: sessionId },
          });
          if (sessionResponse.ok && sessionResponse.result) {
            const sessionResult = sessionResponse.result as {
              session: { session?: { agentId?: string } };
            };
            agentId = sessionResult.session?.session?.agentId;
          }
        }

        if (!agentId) {
          console.error("Error: Agent ID is required. Use --agent <agent-id> or ensure session has an agentId");
          process.exit(1);
        }

        const response = await client.call({
          method: "agent.run",
          params: {
            sessionId,
            agentId,
            message,
          },
          timeout: 60000, // 60 second timeout for LLM calls
        });

        if (!response.ok) {
          console.error("Failed to send message:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as {
          response: string;
          runId: string;
          tokensUsed?: number;
          toolsUsed?: string[];
        };

        if (shouldOutputJson(options)) {
          outputJson(result, options);
        } else {
          console.log(result.response);
          if (result.tokensUsed) {
            process.stderr.write(`\n[Tokens: ${result.tokensUsed}]\n`);
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
    .command("messages")
    .description("List messages in a session")
    .argument("<session-id>", "Session ID")
    .option("--host <host>", "Gateway host", "127.0.0.1")
    .option("--port <port>", "Gateway port", "18789")
    .option("--json", "Output as JSON")
    .option("--limit <number>", "Limit number of messages to show", "100")
    .action(async (
      sessionId: string,
      options: {
        host?: string;
        port?: string;
        json?: boolean;
        limit?: string;
      },
    ) => {
      const host = options.host ?? "127.0.0.1";
      const port = options.port ? parseInt(options.port, 10) : 18789;
      const limit = options.limit ? parseInt(options.limit, 10) : 100;

      await ensureGatewayRunning(host, port);

      const client = new GatewayClient({ host, port });
      try {
        await client.connect();
        const response = await client.call({
          method: "sessions.get",
          params: { id: sessionId },
        });

        if (!response.ok || !response.result) {
          console.error("Failed to get session:", response.error?.message);
          process.exit(1);
        }

        const result = response.result as {
          session: {
            session?: {
              id: string;
              label?: string;
              type?: string;
              agentId?: string;
              createdAt?: number;
              lastActivity?: number;
            };
            messages?: Array<{
              role: string;
              content: string;
              timestamp?: number;
              toolCallId?: string;
              toolCalls?: unknown[];
            }>;
          };
        };

        const { session: sessionInfo, messages } = result.session;
        const messageList = (messages || []).slice(-limit);

        if (shouldOutputJson(options)) {
          outputJson({ session: sessionInfo, messages: messageList }, options);
        } else {
          if (sessionInfo) {
            console.log(`Session: ${sessionInfo.id}`);
            if (sessionInfo.label) console.log(`Label: ${sessionInfo.label}`);
            if (sessionInfo.type) console.log(`Type: ${sessionInfo.type}`);
            if (sessionInfo.agentId) console.log(`Agent: ${sessionInfo.agentId}`);
            if (sessionInfo.createdAt) {
              console.log(`Created: ${new Date(sessionInfo.createdAt).toLocaleString()}`);
            }
            if (sessionInfo.lastActivity) {
              console.log(`Last Activity: ${new Date(sessionInfo.lastActivity).toLocaleString()}`);
            }
            console.log(`Messages: ${messageList.length}${messages && messages.length > limit ? ` (showing last ${limit} of ${messages.length})` : ""}`);
            console.log();
          }

          if (messageList.length > 0) {
            console.log("Message History:");
            messageList.forEach((msg, idx) => {
              const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : "unknown";
              console.log(`\n[${idx + 1}] ${msg.role.toUpperCase()} (${time})`);
              console.log(msg.content);
            });
          } else {
            console.log("No messages in this session.");
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
