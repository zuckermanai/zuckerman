import { watch } from "chokidar";
import { join } from "node:path";
import { cwd } from "node:process";

export interface ReloadWatcher {
  stop: () => Promise<void>;
}

export function watchForReload(
  paths: string[],
  onReload: (path: string) => void,
): ReloadWatcher {
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

export function getWatchPaths(): string[] {
  const root = cwd();
  return [
    join(root, "world/**/*"),
    join(root, "agents/**/*"),
    join(root, "interfaces/**/*"),
  ];
}
