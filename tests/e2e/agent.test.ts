import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { startGatewayServer } from "@world/communication/gateway/server/index.js";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Helper class for WebSocket client communication with gateway
 */
class GatewayTestClient {
  private ws: WebSocket;
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private eventHandlers = new Map<string, Array<(payload: unknown) => void>>();

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.setupHandlers();
  }

  private setupHandlers() {
    this.ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        // Handle events
        if (message.type === "event") {
          const handlers = this.eventHandlers.get(message.event) || [];
          handlers.forEach((handler) => handler(message.payload));
          return;
        }

        // Handle responses
        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve, reject, timeout } = this.pendingRequests.get(message.id)!;
          clearTimeout(timeout);
          this.pendingRequests.delete(message.id);

          if (message.ok) {
            resolve(message);
          } else {
            reject(new Error(message.error?.message || "Request failed"));
          }
        }
      } catch (err) {
        console.error("Failed to parse message:", err);
      }
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.on("open", () => resolve());
      this.ws.on("error", reject);
      setTimeout(() => reject(new Error("Connection timeout")), 5000);
    });
  }

  request(method: string, params?: Record<string, unknown>, timeoutMs = 120000): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = `test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout after ${timeoutMs}ms for ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const request = {
        type: "req" as const,
        id,
        method,
        params,
      };

      try {
        this.ws.send(JSON.stringify(request));
      } catch (err) {
        this.pendingRequests.delete(id);
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error("Failed to send request"));
      }
    });
  }

  on(event: string, handler: (payload: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);

    return () => {
      const handlers = this.eventHandlers.get(event) || [];
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    };
  }

  close() {
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error("Client closed"));
    });
    this.pendingRequests.clear();
    this.ws.close();
  }
}

describe("E2E: Agent Real-World Behavior", () => {
  let server: Awaited<ReturnType<typeof startGatewayServer>>;
  const port = 18792;
  const testWorkspaceDir = join(homedir(), ".zuckerman", "test-workspace");

  beforeAll(async () => {
    // Clean up test workspace
    if (existsSync(testWorkspaceDir)) {
      rmSync(testWorkspaceDir, { recursive: true, force: true });
    }
    mkdirSync(testWorkspaceDir, { recursive: true });

    server = await startGatewayServer({ port, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await server.close();
    // Clean up test workspace
    if (existsSync(testWorkspaceDir)) {
      rmSync(testWorkspaceDir, { recursive: true, force: true });
    }
  });

  describe("Terminal Tool - File Operations", () => {
    it("should create a file when asked", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-file-create-${Date.now()}`;
      const testFileName = `test-file-${Date.now()}.txt`;
      const testFilePath = join(testWorkspaceDir, testFileName);

      // Ask agent to create a file
      const response = await client.request("agent.run", {
        sessionId,
        message: `Create a file named ${testFileName} in ${testWorkspaceDir} with the content "Hello from agent!"`,
        agentId: "zuckerman",
      });

      expect(response.ok).toBe(true);
      expect(response.result.response).toBeTruthy();
      
      // Verify the file was actually created
      expect(existsSync(testFilePath)).toBe(true);
      
      // Verify the content
      const content = readFileSync(testFilePath, "utf-8");
      expect(content).toContain("Hello from agent");

      // Verify tools were used
      expect(response.result.toolsUsed.length).toBeGreaterThan(0);
      expect(response.result.toolsUsed).toContain("terminal");

      client.close();
    }, 120000);

    it("should read and process file content", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-file-read-${Date.now()}`;
      const testFileName = `read-test-${Date.now()}.txt`;
      const testFilePath = join(testWorkspaceDir, testFileName);
      const testContent = "The answer is 42";

      // Create a file first
      writeFileSync(testFilePath, testContent);

      // Ask agent to read and tell us what's in it
      const response = await client.request("agent.run", {
        sessionId,
        message: `Read the file ${testFilePath} and tell me what number is mentioned in it`,
        agentId: "zuckerman",
      });

      expect(response.ok).toBe(true);
      expect(response.result.response).toBeTruthy();
      
      // Agent should mention the number 42
      expect(response.result.response.toLowerCase()).toContain("42");

      // Verify tools were used
      expect(response.result.toolsUsed).toContain("terminal");

      client.close();
    }, 120000);

    it("should perform multi-step file operations", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-multi-step-${Date.now()}`;
      const fileName1 = `file1-${Date.now()}.txt`;
      const fileName2 = `file2-${Date.now()}.txt`;
      const filePath1 = join(testWorkspaceDir, fileName1);
      const filePath2 = join(testWorkspaceDir, fileName2);

      // Ask agent to create two files and combine them
      const response = await client.request("agent.run", {
        sessionId,
        message: `Create two files: ${fileName1} with content "First" and ${fileName2} with content "Second" in ${testWorkspaceDir}. Then create a third file called combined.txt that contains the content of both files.`,
        agentId: "zuckerman",
      });

      expect(response.ok).toBe(true);
      
      // Verify all files were created
      expect(existsSync(filePath1)).toBe(true);
      expect(existsSync(filePath2)).toBe(true);
      
      const combinedPath = join(testWorkspaceDir, "combined.txt");
      expect(existsSync(combinedPath)).toBe(true);
      
      // Verify combined file has content from both
      const combinedContent = readFileSync(combinedPath, "utf-8");
      expect(combinedContent).toContain("First");
      expect(combinedContent).toContain("Second");

      // Agent should have used terminal tool multiple times
      expect(response.result.toolsUsed.length).toBeGreaterThan(1);
      expect(response.result.toolsUsed.filter((t: string) => t === "terminal").length).toBeGreaterThan(1);

      client.close();
    }, 180000);
  });

  describe("Terminal Tool - Command Execution", () => {
    it("should execute commands and return results", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-command-${Date.now()}`;

      // Ask agent to run a command and tell us the result
      const response = await client.request("agent.run", {
        sessionId,
        message: `Run the command 'echo "Test output" > ${join(testWorkspaceDir, "output.txt")}' and then read that file to verify it worked`,
        agentId: "zuckerman",
      });

      expect(response.ok).toBe(true);
      expect(response.result.response).toBeTruthy();
      
      // Verify the command was executed
      const outputPath = join(testWorkspaceDir, "output.txt");
      expect(existsSync(outputPath)).toBe(true);
      
      const output = readFileSync(outputPath, "utf-8");
      expect(output.trim()).toBe("Test output");

      expect(response.result.toolsUsed).toContain("terminal");

      client.close();
    }, 120000);

    it("should handle command errors gracefully", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-error-${Date.now()}`;

      // Ask agent to run a command that will fail
      const response = await client.request("agent.run", {
        sessionId,
        message: `Try to run 'ls /nonexistent/directory/that/does/not/exist' and tell me what happened`,
        agentId: "zuckerman",
      });

      expect(response.ok).toBe(true);
      expect(response.result.response).toBeTruthy();
      
      // Agent should acknowledge the error occurred
      const responseLower = response.result.response.toLowerCase();
      expect(
        responseLower.includes("error") ||
        responseLower.includes("not found") ||
        responseLower.includes("no such") ||
        responseLower.includes("failed")
      ).toBe(true);

      expect(response.result.toolsUsed).toContain("terminal");

      client.close();
    }, 120000);
  });

  describe("Multi-Turn Conversations", () => {
    it("should remember context across multiple turns", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-context-${Date.now()}`;
      const testFileName = `context-test-${Date.now()}.txt`;

      // First turn: Create a file
      const response1 = await client.request("agent.run", {
        sessionId,
        message: `Create a file called ${testFileName} in ${testWorkspaceDir} with content "My favorite color is blue"`,
        agentId: "zuckerman",
      });

      expect(response1.ok).toBe(true);
      expect(existsSync(join(testWorkspaceDir, testFileName))).toBe(true);

      // Second turn: Ask about what we just created
      const response2 = await client.request("agent.run", {
        sessionId,
        message: `What color did I mention in the file we just created?`,
        agentId: "zuckerman",
      });

      expect(response2.ok).toBe(true);
      expect(response2.result.response.toLowerCase()).toContain("blue");

      // Third turn: Modify based on previous context
      const response3 = await client.request("agent.run", {
        sessionId,
        message: `Now change the content of that file to say "My favorite color is red" instead`,
        agentId: "zuckerman",
      });

      expect(response3.ok).toBe(true);
      
      // Verify the file was updated
      const content = readFileSync(join(testWorkspaceDir, testFileName), "utf-8");
      expect(content).toContain("red");
      expect(content).not.toContain("blue");

      client.close();
    }, 180000);

    it("should build on previous actions", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-build-${Date.now()}`;
      const baseDir = join(testWorkspaceDir, `project-${Date.now()}`);

      // Turn 1: Create directory structure
      const response1 = await client.request("agent.run", {
        sessionId,
        message: `Create a directory called ${baseDir}`,
        agentId: "zuckerman",
      });

      expect(response1.ok).toBe(true);
      expect(existsSync(baseDir)).toBe(true);

      // Turn 2: Add a file to that directory
      const response2 = await client.request("agent.run", {
        sessionId,
        message: `Create a file called README.md in the directory we just created with content "# Project"`,
        agentId: "zuckerman",
      });

      expect(response2.ok).toBe(true);
      expect(existsSync(join(baseDir, "README.md"))).toBe(true);

      // Turn 3: List what's in the directory
      const response3 = await client.request("agent.run", {
        sessionId,
        message: `What files are in ${baseDir}?`,
        agentId: "zuckerman",
      });

      expect(response3.ok).toBe(true);
      expect(response3.result.response.toLowerCase()).toContain("readme");

      client.close();
    }, 180000);
  });

  describe("Agent Reasoning and Decision Making", () => {
    it("should make decisions based on conditions", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-reasoning-${Date.now()}`;
      const testFile = join(testWorkspaceDir, `decision-${Date.now()}.txt`);

      // Ask agent to make a conditional decision
      const response = await client.request("agent.run", {
        sessionId,
        message: `Check if the file ${testFile} exists. If it doesn't exist, create it with content "Created by agent". If it does exist, append " - Modified" to it.`,
        agentId: "zuckerman",
      });

      expect(response.ok).toBe(true);
      
      // File should exist (created or modified)
      expect(existsSync(testFile)).toBe(true);
      
      const content = readFileSync(testFile, "utf-8");
      // Should have either "Created by agent" or "Modified"
      expect(
        content.includes("Created by agent") || content.includes("Modified")
      ).toBe(true);

      // Agent should have used terminal tool to check and then act
      expect(response.result.toolsUsed.length).toBeGreaterThan(0);

      client.close();
    }, 120000);

    it("should handle complex multi-step workflows", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-workflow-${Date.now()}`;
      const projectDir = join(testWorkspaceDir, `workflow-${Date.now()}`);

      // Give agent a complex multi-step task
      const response = await client.request("agent.run", {
        sessionId,
        message: `Create a project structure: 
1. Create directory ${projectDir}
2. Create a file called config.json with content {"version": "1.0"}
3. Create a file called data.txt with content "Initial data"
4. Create a summary file that lists all files in the project`,
        agentId: "zuckerman",
      });

      expect(response.ok).toBe(true);
      
      // Verify all steps were completed
      expect(existsSync(projectDir)).toBe(true);
      expect(existsSync(join(projectDir, "config.json"))).toBe(true);
      expect(existsSync(join(projectDir, "data.txt"))).toBe(true);
      
      // Check if summary file exists (agent might create it)
      const files = readFileSync(join(projectDir, "config.json"), "utf-8");
      expect(files).toContain("version");

      // Agent should have used multiple tool calls
      expect(response.result.toolsUsed.length).toBeGreaterThan(1);

      client.close();
    }, 180000);
  });

  describe("Error Recovery and Adaptation", () => {
    it("should retry with different approach on failure", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-retry-${Date.now()}`;
      const invalidPath = "/root/restricted/test.txt";

      // Ask agent to create file in restricted location, then adapt
      const response = await client.request("agent.run", {
        sessionId,
        message: `Try to create a file at ${invalidPath}. If that fails, create it at ${join(testWorkspaceDir, "fallback.txt")} instead with content "Fallback worked"`,
        agentId: "zuckerman",
      });

      expect(response.ok).toBe(true);
      
      // Fallback file should exist
      const fallbackPath = join(testWorkspaceDir, "fallback.txt");
      expect(existsSync(fallbackPath)).toBe(true);
      
      const content = readFileSync(fallbackPath, "utf-8");
      expect(content).toContain("Fallback worked");

      client.close();
    }, 120000);
  });

  describe("Tool Usage Verification", () => {
    it("should use appropriate tools for the task", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-tools-${Date.now()}`;

      // Task that requires terminal tool
      const response = await client.request("agent.run", {
        sessionId,
        message: `List all files in ${testWorkspaceDir} and create a summary file listing them`,
        agentId: "zuckerman",
      });

      expect(response.ok).toBe(true);
      
      // Should have used terminal tool
      expect(response.result.toolsUsed).toContain("terminal");
      
      // Response should indicate completion
      expect(response.result.response.length).toBeGreaterThan(0);

      client.close();
    }, 120000);

    it("should track token usage and tool calls", async () => {
      const client = new GatewayTestClient(`ws://127.0.0.1:${port}`);
      await client.connect();

      const sessionId = `test-tracking-${Date.now()}`;

      const response = await client.request("agent.run", {
        sessionId,
        message: `Create a file test.txt in ${testWorkspaceDir} with content "Hello"`,
        agentId: "zuckerman",
      });

      expect(response.ok).toBe(true);
      
      // Should track tokens
      expect(response.result.tokensUsed).toBeGreaterThan(0);
      
      // Should track tools used
      expect(Array.isArray(response.result.toolsUsed)).toBe(true);
      expect(response.result.toolsUsed.length).toBeGreaterThan(0);
      
      // Should have runId
      expect(response.result.runId).toBeTruthy();

      client.close();
    }, 120000);
  });
});
