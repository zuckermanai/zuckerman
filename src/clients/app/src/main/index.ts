import { app, BrowserWindow, Menu, nativeImage, shell } from "electron";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { windowManager } from "@main/window.js";
import { createApplicationMenu } from "@main/menu.js";
import { setupIpcHandlers } from "@main/ipc.js";
import { cleanupGateway } from "@core/gateway/gateway-manager.js";
import { APP_CONFIG } from "@main/config.js";

// Handle uncaught exceptions and unhandled promise rejections FIRST
// This must be set up before any other code that might throw errors
process.on("uncaughtException", (error) => {
  // Check if it's an EADDRINUSE error - handle gracefully (don't crash the app)
  const errnoError = error as NodeJS.ErrnoException;
  if (errnoError.code === "EADDRINUSE") {
    const errorMessage = error.message || "";
    // Check if it's related to the gateway port (18789) or any port conflict
    if (errorMessage.includes("18789") || errorMessage.includes("address already in use")) {
      console.warn("[App] Port conflict detected (EADDRINUSE) - gateway may already be running");
      console.warn("[App] This is non-critical - app will connect to existing gateway");
      return; // Don't crash the app
    }
  }
  console.error("[App] Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  // Check if it's an EADDRINUSE error - handle gracefully (don't crash the app)
  if (reason && typeof reason === "object") {
    const errnoReason = reason as NodeJS.ErrnoException;
    if (errnoReason.code === "EADDRINUSE") {
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      if (errorMessage.includes("18789") || errorMessage.includes("address already in use")) {
        console.warn("[App] Port conflict detected (unhandled rejection) - gateway may already be running");
        console.warn("[App] This is non-critical - app will connect to existing gateway");
        return; // Don't crash the app
      }
    }
  }
  console.error("[App] Unhandled Rejection at:", promise, "reason:", reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Setup IPC handlers
setupIpcHandlers();

// Set dock icon immediately when app is ready (before creating window)
app.once("ready", () => {
  if (process.platform === "darwin") {
    try {
      app.dock?.setIcon(nativeImage.createFromPath(APP_CONFIG.paths.asset("assets/logo.png")));
    } catch {}
  }
});

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

// Cleanup gateway on app quit
app.on("before-quit", async () => {
  await cleanupGateway();
});

// Security: Prevent new window creation, but allow external URLs
app.on("web-contents-created", (_, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // Allow external URLs to open in default browser
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" }; // Don't open in Electron window
    }
    // Deny all other window creation attempts
    return { action: "deny" };
  });
});
