import { getStorageItem, setStorageItem } from "./local-storage";

export interface GatewaySettings {
  host: string;
  port: number;
  autoStart?: boolean;
}

export interface AppSettings {
  gateway: GatewaySettings;
  appearance?: {
    theme: "light" | "dark" | "system";
    fontSize?: string;
  };
  advanced?: {
    autoReconnect?: boolean;
    reconnectAttempts?: number;
  };
}

const SETTINGS_KEY = "zuckerman:settings";

const DEFAULT_SETTINGS: AppSettings = {
  gateway: {
    host: "127.0.0.1",
    port: 18789,
  },
};

export function getSettings(): AppSettings {
  return getStorageItem<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);
}

export function setSettings(settings: AppSettings): void {
  setStorageItem(SETTINGS_KEY, settings);
}

export function getGatewaySettings(): GatewaySettings {
  const settings = getSettings();
  return settings.gateway || DEFAULT_SETTINGS.gateway;
}

export function setGatewaySettings(gateway: GatewaySettings): void {
  const settings = getSettings();
  setSettings({ ...settings, gateway });
}
