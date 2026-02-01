import { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import { join } from "node:path";
import { APP_CONFIG } from "./config.js";

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;

  createWindow(dirname: string): BrowserWindow {
    const options: BrowserWindowConstructorOptions = {
      width: APP_CONFIG.window.width,
      height: APP_CONFIG.window.height,
      minWidth: APP_CONFIG.window.minWidth,
      minHeight: APP_CONFIG.window.minHeight,
      titleBarStyle: "hiddenInset",
      backgroundColor: APP_CONFIG.window.backgroundColor,
      frame: true,
      titleBarOverlay: process.platform === "darwin" ? false : {
        color: APP_CONFIG.window.backgroundColor,
        symbolColor: "#ffffff",
        height: 30,
      },
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: APP_CONFIG.paths.preload(dirname),
        sandbox: false,
      },
      show: false, // Don't show until ready
    };

    this.mainWindow = new BrowserWindow(options);

    // Load content
    this.loadContent(dirname);

    // Show window when ready
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow?.show();
    });

    // Handle window closed
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    // Open DevTools in development
    if (APP_CONFIG.isDev) {
      this.mainWindow.webContents.openDevTools();
    }

    return this.mainWindow;
  }

  private loadContent(dirname: string): void {
    if (!this.mainWindow) return;

    if (APP_CONFIG.isDev) {
      // In development, load from Vite dev server
      this.mainWindow.loadURL(APP_CONFIG.devServer.url);
    } else {
      // In production, load from built files
      const rendererPath = APP_CONFIG.paths.renderer(dirname);
      this.mainWindow.loadFile(rendererPath);
    }
  }

  getWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  send(channel: string, ...args: unknown[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  reload(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.reload();
    }
  }

  focus(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.focus();
    }
  }
}

export const windowManager = new WindowManager();
