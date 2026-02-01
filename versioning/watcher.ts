import { watch, FSWatcher } from "node:fs";
import { join, relative } from "node:path";
import type { Config } from "./config.js";
import { minimatch } from "minimatch";

export interface ChangeEvent {
  type: "change" | "add" | "unlink";
  path: string;
  timestamp: number;
}

export type ChangeCallback = (events: ChangeEvent[]) => void;

export class Watcher {
  private watchers: Map<string, FSWatcher> = new Map();
  private workTree: string;
  private config: Config;
  private changeCallback?: ChangeCallback;
  private pendingChanges: Map<string, ChangeEvent> = new Map();
  private debounceTimer?: NodeJS.Timeout;
  private debounceDelay: number = 1000;

  constructor(config: Config, workTree: string) {
    this.config = config;
    this.workTree = workTree;
  }

  /**
   * Start watching for agent changes
   */
  async start(callback: ChangeCallback): Promise<void> {
    this.changeCallback = callback;

    for (const watchPath of this.config.watchPaths) {
      await this.watchPattern(watchPath);
    }
  }

  /**
   * Stop watching
   */
  stop(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    
    this.pendingChanges.clear();
    this.changeCallback = undefined;
  }

  /**
   * Watch a specific pattern
   */
  private async watchPattern(pattern: string): Promise<void> {
    const { glob } = await import("glob");
    const fullPattern = join(this.workTree, pattern);

    // Find all matching files/directories
    glob(fullPattern, { ignore: this.config.ignorePatterns })
      .then((matches) => {
        for (const match of matches) {
          this.watchPath(match);
        }
      })
      .catch((error) => {
        console.warn(`Failed to watch pattern ${pattern}:`, error);
      });
  }

  /**
   * Watch a specific path
   */
  private watchPath(path: string): void {
    if (this.watchers.has(path)) {
      return; // Already watching
    }

    if (this.shouldIgnore(path)) {
      return;
    }

    try {
      const watcher = watch(
        path,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return;

          const fullPath = join(path, filename);
          const relativePath = relative(this.workTree, fullPath);

          if (this.shouldIgnore(relativePath)) {
            return;
          }

          const changeEvent: ChangeEvent = {
            type: this.mapEventType(eventType),
            path: relativePath,
            timestamp: Date.now(),
          };

          this.handleChange(changeEvent);
        }
      );

      this.watchers.set(path, watcher);
    } catch (error) {
      console.warn(`Failed to watch ${path}:`, error);
    }
  }

  /**
   * Handle file change with debouncing
   */
  private handleChange(event: ChangeEvent): void {
    // Update or add to pending changes
    this.pendingChanges.set(event.path, event);

    // Debounce: wait for a period of inactivity before emitting
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      if (this.changeCallback && this.pendingChanges.size > 0) {
        const events = Array.from(this.pendingChanges.values());
        this.pendingChanges.clear();
        this.changeCallback(events);
      }
      this.debounceTimer = undefined;
    }, this.debounceDelay);
  }

  /**
   * Map Node.js event types to our event types
   */
  private mapEventType(eventType: string): "change" | "add" | "unlink" {
    if (eventType === "rename") {
      // We can't distinguish add vs unlink from rename alone
      // Assume it's a change for now
      return "change";
    }
    return eventType as "change" | "add" | "unlink";
  }

  /**
   * Check if a path should be ignored
   */
  private shouldIgnore(path: string): boolean {
    const relativePath = relative(this.workTree, path);
    
    for (const pattern of this.config.ignorePatterns) {
      if (minimatch(relativePath, pattern) || minimatch(path, pattern)) {
        return true;
      }
    }
    return false;
  }
}
