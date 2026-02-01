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
