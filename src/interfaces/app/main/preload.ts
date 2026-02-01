import { contextBridge, ipcRenderer } from "electron";

// Types for exposed API
export interface ElectronAPI {
  // App info
  getVersion: () => Promise<string>;
  getAppPath: (name?: string) => Promise<string>;
  getAppName: () => Promise<string>;
  
  // Platform info
  platform: string;
  
  // Menu actions
  onMenuAction: (callback: (action: string) => void) => void;
  removeMenuListeners: () => void;
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  getAppPath: (name?: string) => ipcRenderer.invoke("app:get-path", name || "userData"),
  getAppName: () => ipcRenderer.invoke("app:get-name"),
  
  // Platform info
  platform: process.platform,
  
  // Menu events
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on("menu-action", (_, action: string) => callback(action));
  },
  
  removeMenuListeners: () => {
    ipcRenderer.removeAllListeners("menu-action");
  },
} as ElectronAPI);

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
