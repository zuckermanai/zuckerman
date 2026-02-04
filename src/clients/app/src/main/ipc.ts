import { ipcMain, app } from "electron";
import { startGateway, stopGateway, getGatewayStatus, cleanupGateway, getGatewayLogs, clearGatewayLogs } from "@core/gateway/gateway-manager.js";
import { getApiKeys, saveApiKeys } from "@main/env-manager.js";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync, rmSync } from "node:fs";

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

  ipcMain.handle("api-keys:save", async (_, keys: { anthropic?: string; openai?: string; openrouter?: string }) => {
    return await saveApiKeys(keys);
  });

  // Gateway management handlers
  ipcMain.handle("gateway:start", async (_, host: string, port: number) => {
    return await startGateway(host, port);
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

  // Calendar events handlers
  ipcMain.handle("calendar:get-events", async () => {
    const { getCalendarEventsFile } = await import("@server/world/homedir/paths.js");
    const eventsFile = getCalendarEventsFile();
    
    if (!existsSync(eventsFile)) {
      return { events: [] };
    }

    try {
      const data = readFileSync(eventsFile, "utf-8");
      const events = JSON.parse(data);
      return { events };
    } catch (error) {
      return { events: [], error: error instanceof Error ? error.message : "Failed to load events" };
    }
  });

  // Reset data handler
  ipcMain.handle("reset:all-data", async () => {
    const { getBaseDir } = await import("@server/world/homedir/paths.js");
    const zuckermanDir = getBaseDir();
    
    if (!existsSync(zuckermanDir)) {
      return { success: true, message: "No data to reset" };
    }

    try {
      rmSync(zuckermanDir, { recursive: true, force: true });
      return { success: true, message: "All data reset successfully" };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to reset data" 
      };
    }
  });

  // Cleanup on app quit
  app.on("before-quit", async () => {
    await cleanupGateway();
  });
}
