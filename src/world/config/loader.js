import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_PATH = join(process.cwd(), ".zuckerman", "config.json");
const DEFAULT_LAND = join(homedir(), ".zuckerman", "land");
const defaultConfig = {
    gateway: {
        port: 18789,
        host: "127.0.0.1",
        bind: "loopback",
    },
    agents: {
        list: [
            {
                id: "zuckerman",
                default: true,
                land: DEFAULT_LAND,
            },
        ],
        defaults: {
            land: DEFAULT_LAND,
        },
    },
    routing: {
        bindings: [],
    },
};
export async function loadConfig() {
    if (!existsSync(CONFIG_PATH)) {
        await saveConfig(defaultConfig);
        return defaultConfig;
    }
    try {
        const content = await readFile(CONFIG_PATH, "utf-8");
        const config = JSON.parse(content);
        // Ensure required structure exists
        if (!config.agents?.list) {
            config.agents = defaultConfig.agents;
        }
        if (!config.routing) {
            config.routing = defaultConfig.routing;
        }
        return config;
    }
    catch {
        return defaultConfig;
    }
}
export async function saveConfig(config) {
    const { mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(CONFIG_PATH), { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
//# sourceMappingURL=loader.js.map