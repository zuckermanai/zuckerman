import { ipcMain, app } from "electron";
import { startGateway, stopGateway, getGatewayStatus, cleanupGateway, getGatewayLogs, clearGatewayLogs } from "./gateway-manager.js";
import { getApiKeys, saveApiKeys } from "./env-manager.js";
import { appendFileSync } from "node:fs";

export function setupIpcHandlers(): void {
  // App info handlers
  ipcMain.handle("app:get-version", () => {
    return app.getVersion();
  });

  ipcMain.handle("app:get-path", (_, name: string) => {
    return app.getPath(name as any);
  });

  ipcMain.handle("app:get-name", () => {
    return app.getName();
  });

  // Platform info
  ipcMain.handle("platform:get", () => {
    return process.platform;
  });

  // API Key management handlers
  ipcMain.handle("api-keys:get", () => {
    return getApiKeys();
  });

  ipcMain.handle("api-keys:save", (_, keys: { anthropic?: string; openai?: string; openrouter?: string }) => {
    return saveApiKeys(keys);
  });

  // Gateway management handlers
  ipcMain.handle("gateway:start", async (_, host: string, port: number) => {
    console.log("[IPC] gateway:start handler called", { host, port });
    // #region agent log
    try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'ipc.ts:34',message:'IPC gateway:start handler called',data:{host,port},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})+'\n');}catch(e){console.error('[DEBUG] Failed to write log:',e);}
    // #endregion
    const result = await startGateway(host, port);
    console.log("[IPC] gateway:start handler result", result);
    // #region agent log
    try{appendFileSync('/Users/dvirdaniel/Desktop/zuckerman/.cursor/debug.log',JSON.stringify({location:'ipc.ts:36',message:'IPC gateway:start handler result',data:{success:result.success,error:result.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})+'\n');}catch(e){console.error('[DEBUG] Failed to write log:',e);}
    // #endregion
    return result;
  });

  ipcMain.handle("gateway:stop", async (_, host: string, port: number) => {
    return await stopGateway(host, port);
  });

  ipcMain.handle("gateway:status", async (_, host: string, port: number) => {
    return await getGatewayStatus(host, port);
  });

  ipcMain.handle("gateway:logs", async (_, limit?: number) => {
    return getGatewayLogs(limit);
  });

  ipcMain.handle("gateway:clear-logs", async () => {
    clearGatewayLogs();
    return { success: true };
  });

  // Cleanup on app quit
  app.on("before-quit", async () => {
    await cleanupGateway();
  });
}
