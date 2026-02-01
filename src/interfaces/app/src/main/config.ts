import { app } from "electron";
import { join, resolve } from "node:path";

/**
 * Get the project root directory
 * In development: uses process.cwd() (where the app was launched from)
 * In production: uses app.getAppPath() and navigates to backend folder
 */
function getProjectRoot(): string {
  if (app.isPackaged) {
    const appPath = app.getAppPath();
    if (appPath.includes(".asar")) {
      return join(appPath, "..", "..", "backend");
    }
    return join(appPath, "..", "backend");
  } else {
    // In development, use process.cwd() - the directory where npm run dev was executed
    return resolve(process.cwd());
  }
}

export const APP_CONFIG = {
  name: "Zuckerman",
  version: app.getVersion(),
  isDev: process.env.NODE_ENV === "development" || !app.isPackaged,
  
  // Project root - direct reference, no searching needed
  projectRoot: getProjectRoot(),
  
  window: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#1B1F22",
  },
  
  devServer: {
    url: "http://localhost:3000",
  },
  
  paths: {
    preload: (dirname: string) => join(dirname, "preload.cjs"),
    renderer: (dirname: string) => join(dirname, "..", "dist", "renderer", "index.html"),
  },
} as const;
