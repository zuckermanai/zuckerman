import { app } from "electron";
import { join } from "node:path";

export const APP_CONFIG = {
  name: "Zuckerman",
  version: app.getVersion(),
  isDev: process.env.NODE_ENV === "development" || !app.isPackaged,
  
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
