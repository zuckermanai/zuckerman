import type { GatewayRequestHandlers } from "../types.js";
import type { ZuckermanConfig } from "@server/world/config/types.js";
import { loadConfig, saveConfig } from "@server/world/config/index.js";
import { EventEmitter } from "node:events";

// Global event emitter for config changes
export const configEvents = new EventEmitter();

/**
 * Validate custom provider configuration
 */
function validateCustomProviderConfig(config: ZuckermanConfig): void {
  if (config.agents?.defaults?.defaultProvider === "custom") {
    const custom = config.llm?.custom;
    const missing: string[] = [];

    if (!custom?.baseUrl || custom.baseUrl.trim() === "") {
      missing.push("baseUrl");
    }
    if (!custom?.defaultModel || custom.defaultModel.trim() === "") {
      missing.push("defaultModel");
    }

    if (missing.length > 0) {
      throw new Error(
        `Custom provider configuration is incomplete. Missing required field(s): ${missing.join(", ")}. Please provide ${missing.length === 1 ? "this field" : "these fields"} in llm.custom configuration.`
      );
    }
  }
}

export function createConfigHandlers(): Partial<GatewayRequestHandlers> {
  return {
    "config.update": async ({ respond, params }) => {
      try {
        const updates = params?.updates as Record<string, unknown> | undefined;
        if (!updates) {
          respond(false, undefined, {
            code: "INVALID_REQUEST",
            message: "Missing updates parameter",
          });
          return;
        }

        const config = await loadConfig();

        // Deep merge updates into config
        const updated = deepMerge(config, updates) as ZuckermanConfig;

        // Validate custom provider configuration
        validateCustomProviderConfig(updated);

        await saveConfig(updated);

        // Emit event to notify listeners that config has been updated
        configEvents.emit("config.updated", updated);

        respond(true, { updated: true });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to update config",
        });
      }
    },

    "config.get": async ({ respond }) => {
      try {
        const config = await loadConfig();
        respond(true, { config });
      } catch (err) {
        respond(false, undefined, {
          code: "ERROR",
          message: err instanceof Error ? err.message : "Failed to load config",
        });
      }
    },
  };
}

function deepMerge(target: any, source: any): any {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === "object" && !Array.isArray(item);
}
