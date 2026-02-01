import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app";
import "./styles/globals.css";

const root = document.getElementById("app");
if (!root) {
  throw new Error("App container not found");
}

console.log("Starting React app...");

try {
  const reactRoot = createRoot(root);
  reactRoot.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("React app rendered successfully");
} catch (error) {
  console.error("Failed to render React app:", error);
  root.innerHTML = `
    <div style="padding: 20px; color: red;">
      <h1>Error loading app</h1>
      <pre>${error instanceof Error ? error.message : String(error)}</pre>
    </div>
  `;
}
