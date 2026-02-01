import { watch } from "chokidar";
import { join } from "node:path";
import { cwd } from "node:process";
export function watchForReload(paths, onReload) {
    const watcher = watch(paths, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        ignoreInitial: true,
    });
    watcher.on("change", (path) => {
        console.log(`[Reload] File changed: ${path}`);
        onReload(path);
    });
    watcher.on("add", (path) => {
        console.log(`[Reload] File added: ${path}`);
        onReload(path);
    });
    watcher.on("unlink", (path) => {
        console.log(`[Reload] File removed: ${path}`);
        onReload(path);
    });
    return {
        stop: async () => {
            await watcher.close();
        },
    };
}
export function getWatchPaths() {
    const root = cwd();
    return [
        join(root, "world/**/*"),
        join(root, "agents/**/*"),
        join(root, "interfaces/**/*"),
    ];
}
//# sourceMappingURL=reload.js.map