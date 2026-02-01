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
    onReload(path);
  });

  watcher.on("add", (path) => {
    onReload(path);
  });

  watcher.on("unlink", (path) => {
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
    join(root, "src/server/**/*"),
    join(root, "src/clients/**/*"),
    join(root, "src/shared/**/*"),
  ];
}
