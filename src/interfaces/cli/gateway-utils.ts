import { GatewayClient } from "./gateway-client.js";
import { startGatewayServer } from "@world/communication/gateway/server/index.js";

let gatewayServer: { close: (reason?: string) => Promise<void> } | null = null;
let gatewayLogsSuppressed = false;

/**
 * Check if gateway is running by attempting to connect
 */
export async function isGatewayRunning(host: string, port: number): Promise<boolean> {
  const testClient = new GatewayClient({ host, port });
  try {
    await Promise.race([
      testClient.connect(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1000)),
    ]);
    testClient.disconnect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Suppress gateway console logs when auto-started
 */
function suppressGatewayLogs(): void {
  if (gatewayLogsSuppressed) return;

  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    const msg = String(args[0] || "");
    // Only suppress gateway-specific logs
    if (!msg.includes("[Gateway]")) {
      originalLog(...args);
    }
  };

  console.error = (...args: unknown[]) => {
    const msg = String(args[0] || "");
    if (!msg.includes("[Gateway]")) {
      originalError(...args);
    }
  };

  gatewayLogsSuppressed = true;
}

/**
 * Ensure gateway is running, auto-start if needed
 */
export async function ensureGatewayRunning(host: string, port: number): Promise<void> {
  // Check if already running
  if (await isGatewayRunning(host, port)) {
    return;
  }

  // Check if we already started it in this process
  if (gatewayServer) {
    // Wait a bit for it to be ready
    for (let i = 0; i < 10; i++) {
      if (await isGatewayRunning(host, port)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Start gateway server (suppress logs for cleaner output)
  suppressGatewayLogs();
  process.stderr.write("Starting gateway... ");

  try {
    gatewayServer = await startGatewayServer({ port, host });
    process.stderr.write("✓\n");

    // Cleanup on exit
    const cleanup = async () => {
      if (gatewayServer) {
        await gatewayServer.close("Agent session ended");
        gatewayServer = null;
      }
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("exit", cleanup);

    // Wait for server to be ready (with timeout)
    const maxAttempts = 20;
    for (let i = 0; i < maxAttempts; i++) {
      if (await isGatewayRunning(host, port)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    throw new Error("Gateway server started but not responding after timeout");
  } catch (err) {
    process.stderr.write("✗\n");
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to start gateway: ${errorMessage}`);
  }
}

/**
 * Get the gateway server instance (if auto-started)
 */
export function getGatewayServer(): { close: (reason?: string) => Promise<void> } | null {
  return gatewayServer;
}
