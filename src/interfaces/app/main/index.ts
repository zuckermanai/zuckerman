import { app, BrowserWindow, Menu } from "electron";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { windowManager } from "./window.js";
import { createApplicationMenu } from "./menu.js";
import { setupIpcHandlers } from "./ipc.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Setup IPC handlers
setupIpcHandlers();

// Create window when app is ready
app.whenReady().then(() => {
  windowManager.createWindow(__dirname);
  Menu.setApplicationMenu(createApplicationMenu());

  app.on("activate", () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createWindow(__dirname);
    } else {
      windowManager.focus();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on("web-contents-created", (_, contents) => {
  contents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
});
