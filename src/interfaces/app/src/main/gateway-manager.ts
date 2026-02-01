import { killPort } from "./kill-port.js";
import { isGatewayRunning } from "./gateway-status.js";
import { startGatewayServer, type GatewayServer } from "@world/communication/gateway/server/index.js";
import { appendFileSync } from "node:fs";

let gatewayServer: GatewayServer | null = null;
let gatewayPort: number = 18789;
let gatewayHost: string = "127.0.0.1";

/**
 * Start the gateway server directly (no process spawning)
 */
export async function startGateway(host: string = "127.0.0.1", port: number = 18789): Promise<{ success: boolean; error?: string }> {
  console.log(`[Gateway] startGateway called with host=${host}, port=${port}`);
  // #region agent log
  try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway-manager.ts:12',message:'startGateway called',data:{host,port},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})+'\n');}catch(e){console.error('[DEBUG] Failed to write log:',e);}
  // #endregion
  
  // Check if already running
  const alreadyRunning = await isGatewayRunning(host, port);
  // #region agent log
  try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway-manager.ts:16',message:'isGatewayRunning check result',data:{alreadyRunning},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})+'\n');}catch(e){}
  // #endregion
  if (alreadyRunning) {
    console.log(`[Gateway] Gateway is already running on ${host}:${port}`);
    return { success: true };
  }

  // If we have a server instance but it's not running, close it first
  if (gatewayServer) {
    try {
      await gatewayServer.close("Restarting");
    } catch (err) {
      console.warn("[Gateway] Error closing existing server:", err);
    }
    gatewayServer = null;
  }

  // Kill any existing process on the port (in case something else is using it)
  try {
    await killPort(port);
  } catch (err) {
    // Ignore errors - port might not be in use
  }

  // Store config
  gatewayHost = host;
  gatewayPort = port;

  try {
    // #region agent log
    try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway-manager.ts:43',message:'Calling startGatewayServer',data:{host,port},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n');}catch(e){}
    // #endregion
    console.log(`[Gateway] Starting gateway server directly...`);
    
    // Import and start the gateway server directly - no process spawning!
    gatewayServer = await startGatewayServer({ host, port });
    
    // #region agent log
    try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway-manager.ts:47',message:'startGatewayServer succeeded',data:{port:gatewayServer.port},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})+'\n');}catch(e){}
    // #endregion
    console.log(`[Gateway] Gateway server started successfully on ws://${host}:${port}`);
    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const errorCode = (err as NodeJS.ErrnoException).code;
    
    // #region agent log
    try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'gateway-manager.ts:52',message:'startGatewayServer failed',data:{error:errorMessage,code:errorCode,stack:err instanceof Error?err.stack:undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})+'\n');}catch(e){console.error('[DEBUG] Failed to write log:',e);}
    // #endregion
    
    // Handle EADDRINUSE error - port is already in use
    if (errorCode === 'EADDRINUSE' || errorMessage.includes('EADDRINUSE')) {
      console.warn(`[Gateway] Port ${port} is already in use. Checking if gateway is actually running...`);
      // Wait a moment and check if gateway is actually running
      await new Promise(resolve => setTimeout(resolve, 500));
      const isRunning = await isGatewayRunning(host, port);
      if (isRunning) {
        console.log(`[Gateway] Gateway is actually running on ${host}:${port}, treating as success`);
        return { success: true };
      } else {
        console.error(`[Gateway] Port ${port} is in use but gateway is not responding. Another process may be using the port.`);
        gatewayServer = null;
        return { success: false, error: `Port ${port} is already in use by another process` };
      }
    }
    
    console.error(`[Gateway] Failed to start gateway:`, err);
    gatewayServer = null;
    return { success: false, error: `Failed to start gateway: ${errorMessage}` };
  }
}

/**
 * Stop the gateway server
 */
export async function stopGateway(host: string = "127.0.0.1", port: number = 18789): Promise<{ success: boolean; error?: string }> {
  try {
    // Close the server instance if we have it
    if (gatewayServer) {
      await gatewayServer.close("Stopped via API");
      gatewayServer = null;
    }

    // Also kill any process on the port (in case it was started externally)
    await killPort(port);

    // Wait a bit and verify it's stopped
    await new Promise((resolve) => setTimeout(resolve, 500));
    const stillRunning = await isGatewayRunning(host, port);
    
    if (stillRunning) {
      return { success: false, error: "Gateway is still running" };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: `Failed to stop gateway: ${errorMessage}` };
  }
}

/**
 * Get gateway status
 */
export async function getGatewayStatus(host: string = "127.0.0.1", port: number = 18789): Promise<{
  running: boolean;
  address?: string;
  error?: string;
}> {
  try {
    const running = await isGatewayRunning(host, port);
    return {
      running,
      address: running ? `ws://${host}:${port}` : undefined,
    };
  } catch (err) {
    return {
      running: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Get gateway logs (empty for direct import - logs go to console)
 */
export function getGatewayLogs(limit?: number): Array<{ timestamp: number; type: "stdout" | "stderr"; message: string }> {
  // With direct import, logs go directly to console
  // Return empty array or implement log capture if needed
  return [];
}

/**
 * Clear gateway logs
 */
export function clearGatewayLogs(): void {
  // No-op for direct import
}

/**
 * Cleanup on app exit
 */
export async function cleanupGateway(): Promise<void> {
  if (gatewayServer) {
    try {
      await gatewayServer.close("App shutting down");
    } catch (err) {
      console.error("[Gateway] Error during cleanup:", err);
    }
    gatewayServer = null;
  }
}
