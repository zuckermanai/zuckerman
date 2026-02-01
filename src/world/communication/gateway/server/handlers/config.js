import { loadConfig, saveConfig } from "@world/config/index.js";
export function createConfigHandlers() {
    return {
        "config.update": async ({ respond, params }) => {
            try {
                const updates = params?.updates;
                if (!updates) {
                    respond(false, undefined, {
                        code: "INVALID_REQUEST",
                        message: "Missing updates parameter",
                    });
                    return;
                }
                const config = await loadConfig();
                // Deep merge updates into config
                const updated = deepMerge(config, updates);
                await saveConfig(updated);
                respond(true, { updated: true });
            }
            catch (err) {
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
            }
            catch (err) {
                respond(false, undefined, {
                    code: "ERROR",
                    message: err instanceof Error ? err.message : "Failed to load config",
                });
            }
        },
    };
}
function deepMerge(target, source) {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach((key) => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                }
                else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            }
            else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}
function isObject(item) {
    return item && typeof item === "object" && !Array.isArray(item);
}
//# sourceMappingURL=config.js.map