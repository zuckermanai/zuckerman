/**
 * Type definitions for Electron API exposed via preload script
 */

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
  
  // Gateway management
  gatewayStart: (host: string, port: number) => Promise<{ success: boolean; error?: string }>;
  gatewayStop: (host: string, port: number) => Promise<{ success: boolean; error?: string }>;
  gatewayStatus: (host: string, port: number) => Promise<{ running: boolean; address?: string; error?: string }>;
  gatewayLogs: (limit?: number) => Promise<Array<{ timestamp: number; type: "stdout" | "stderr"; message: string }>>;
  gatewayClearLogs: () => Promise<{ success: boolean }>;
  
  // API Key management
  getApiKeys: () => Promise<{ anthropic?: string; openai?: string; openrouter?: string }>;
  saveApiKeys: (keys: { anthropic?: string; openai?: string; openrouter?: string }) => Promise<{ success: boolean; error?: string }>;
}

export interface PlatformInfo {
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
}

export interface ElectronTrafficLights {
  leftPadding: number;
  topPadding: number;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    platform?: PlatformInfo;
    electronTrafficLights?: ElectronTrafficLights;
  }
}
