import { ipcMain, app } from "electron";

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
}
