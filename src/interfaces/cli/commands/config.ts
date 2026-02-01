import { Command } from "commander";
import { loadConfig, saveConfig } from "@world/config/index.js";
import { outputJson, shouldOutputJson, parseJsonInput } from "../utils/json-output.js";

export function createConfigCommand(): Command {
  const cmd = new Command("config")
    .description("Manage configuration");

  cmd
    .command("get")
    .description("Get current configuration")
    .option("--json", "Output as JSON")
    .option("--key <key>", "Get specific config key (e.g., 'agents.defaults.land')")
    .action(async (options: { json?: boolean; key?: string }) => {
      const config = await loadConfig();

      if (options.key) {
        // Get nested key value
        const keys = options.key.split(".");
        let value: unknown = config;
        for (const key of keys) {
          if (value && typeof value === "object" && key in value) {
            value = (value as Record<string, unknown>)[key];
          } else {
            console.error(`Config key "${options.key}" not found`);
            process.exit(1);
          }
        }
        if (shouldOutputJson(options)) {
          outputJson({ key: options.key, value }, options);
        } else {
          console.log(JSON.stringify(value, null, 2));
        }
      } else {
        if (shouldOutputJson(options)) {
          outputJson(config, options);
        } else {
          console.log(JSON.stringify(config, null, 2));
        }
      }
    });

  cmd
    .command("set")
    .description("Set configuration value")
    .option("--key <key>", "Config key to set (e.g., 'agents.defaults.land')")
    .option("--value <value>", "Value to set (JSON string)")
    .option("--input <json>", "JSON input for full config update (or pipe JSON)")
    .action(async (options: { key?: string; value?: string; input?: string }) => {
      const config = await loadConfig();

      if (options.input || !process.stdin.isTTY) {
        // Full config update from JSON
        const input = await parseJsonInput(options.input);
        await saveConfig(input as typeof config as any);
        console.log("Configuration updated successfully.");
      } else if (options.key && options.value) {
        // Set specific key
        try {
          const value = JSON.parse(options.value);
          const keys = options.key.split(".");
          const lastKey = keys.pop()!;
          let target: Record<string, unknown> = config as any;
          
          for (const key of keys) {
            if (!(key in target) || typeof target[key] !== "object") {
              target[key] = {};
            }
            target = target[key] as Record<string, unknown>;
          }
          
          target[lastKey] = value;
          await saveConfig(config as any);
          console.log(`Configuration key "${options.key}" updated successfully.`);
        } catch (err) {
          console.error("Failed to update config:", err instanceof Error ? err.message : "Unknown error");
          process.exit(1);
        }
      } else {
        console.error("Either --input or both --key and --value must be provided");
        process.exit(1);
      }
    });

  return cmd;
}
