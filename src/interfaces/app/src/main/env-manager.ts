import { app } from "electron";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";

/**
 * Get the path to the .env file in the app's user data directory
 */
function getEnvPath(): string {
  const userDataPath = app.getPath("userData");
  return join(userDataPath, ".env");
}

/**
 * Read API keys from .env file
 */
export function getApiKeys(): {
  anthropic?: string;
  openai?: string;
  openrouter?: string;
} {
  const envPath = getEnvPath();
  const keys: { anthropic?: string; openai?: string; openrouter?: string } = {};

  if (!existsSync(envPath)) {
    return keys;
  }

  try {
    const content = readFileSync(envPath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

      if (key === "ANTHROPIC_API_KEY") {
        keys.anthropic = value;
      } else if (key === "OPENAI_API_KEY") {
        keys.openai = value;
      } else if (key === "OPENROUTER_API_KEY") {
        keys.openrouter = value;
      }
    }
  } catch (error) {
    console.error("Error reading .env file:", error);
  }

  return keys;
}

/**
 * Save API keys to .env file
 */
export function saveApiKeys(keys: {
  anthropic?: string;
  openai?: string;
  openrouter?: string;
}): { success: boolean; error?: string } {
  try {
    const envPath = getEnvPath();
    const userDataPath = app.getPath("userData");

    // Ensure user data directory exists
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true });
    }

    // Read existing .env file to preserve other variables
    const existingVars: Record<string, string> = {};
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const [key, ...valueParts] = trimmed.split("=");
        const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

        // Only preserve non-API-key variables
        if (
          key !== "ANTHROPIC_API_KEY" &&
          key !== "OPENAI_API_KEY" &&
          key !== "OPENROUTER_API_KEY"
        ) {
          existingVars[key] = value;
        }
      }
    }

    // Build new .env content
    const lines: string[] = [
      "# Zuckerman API Keys",
      "# This file is automatically managed by the Zuckerman app",
      "",
    ];

    // Add API keys
    if (keys.anthropic) {
      lines.push(`ANTHROPIC_API_KEY=${keys.anthropic}`);
    }
    if (keys.openai) {
      lines.push(`OPENAI_API_KEY=${keys.openai}`);
    }
    if (keys.openrouter) {
      lines.push(`OPENROUTER_API_KEY=${keys.openrouter}`);
    }

    // Add other existing variables
    if (Object.keys(existingVars).length > 0) {
      lines.push("");
      lines.push("# Other environment variables");
      for (const [key, value] of Object.entries(existingVars)) {
        lines.push(`${key}=${value}`);
      }
    }

    writeFileSync(envPath, lines.join("\n") + "\n", "utf-8");
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: `Failed to save API keys: ${errorMessage}` };
  }
}

/**
 * Get the path to the .env file (for passing to gateway process)
 */
export function getEnvFilePath(): string {
  return getEnvPath();
}
