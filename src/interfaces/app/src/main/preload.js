const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getAppPath: (name) => ipcRenderer.invoke("app:get-path", name || "userData"),
  getAppName: () => ipcRenderer.invoke("app:get-name"),
  platform: process.platform,

  // Menu events
  onMenuAction: (callback) => {
    ipcRenderer.on("menu-action", (_, action) => callback(action));
  },

  // Remove listeners
  removeMenuListeners: () => {
    ipcRenderer.removeAllListeners("menu-action");
  },
});

// Expose platform info for safe area detection
contextBridge.exposeInMainWorld("platform", {
  isMac: process.platform === "darwin",
  isWindows: process.platform === "win32",
  isLinux: process.platform === "linux",
});

// Expose traffic light button dimensions for proper padding
contextBridge.exposeInMainWorld("electronTrafficLights", {
  // Traffic lights are positioned at x: 20, y: 12
  // Each button is ~14px wide, with ~6px spacing between them
  // Total width: ~70px (3 buttons + spacing)
  leftPadding: process.platform === "darwin" ? 90 : 0, // 20px offset + 70px width
  topPadding: process.platform === "darwin" ? 30 : 0, // Title bar height
});
