import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import type { Config } from "./config.js";
import { minimatch } from "minimatch";

export interface FileSnapshot {
  path: string;
  timestamp: number;
  relativePath: string;
}

export class SnapshotManager {
  private snapshotsDir: string;
  private workTree: string;
  private config: Config;

  constructor(config: Config, workTree: string) {
    this.config = config;
    this.workTree = workTree;
    this.snapshotsDir = join(workTree, config.snapshotsDir);
  }

  /**
   * Initialize snapshots directory
   */
  initialize(): void {
    if (!existsSync(this.snapshotsDir)) {
      mkdirSync(this.snapshotsDir, { recursive: true });
    }
  }

  /**
   * Copy changed files to snapshots directory before committing
   */
  async createSnapshots(files: string[]): Promise<FileSnapshot[]> {
    const snapshots: FileSnapshot[] = [];
    const timestamp = Date.now();

    for (const file of files) {
      if (this.shouldIgnore(file)) {
        continue;
      }

      const fullPath = join(this.workTree, file);
      if (!existsSync(fullPath)) {
        continue; // File doesn't exist, skip
      }

      const relativePath = relative(this.workTree, fullPath);
      const snapshotPath = join(this.snapshotsDir, relativePath);
      const snapshotDir = dirname(snapshotPath);

      // Create directory structure if needed
      if (!existsSync(snapshotDir)) {
        mkdirSync(snapshotDir, { recursive: true });
      }

      try {
        copyFileSync(fullPath, snapshotPath);
        snapshots.push({
          path: snapshotPath,
          timestamp,
          relativePath,
        });
      } catch (error) {
        console.warn(`Failed to create snapshot for ${file}:`, error);
      }
    }

    return snapshots;
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): FileSnapshot[] {
    if (!existsSync(this.snapshotsDir)) {
      return [];
    }

    const snapshots: FileSnapshot[] = [];

    const walkDir = (dir: string, basePath: string = ""): void => {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const relativePath = join(basePath, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          walkDir(fullPath, relativePath);
        } else {
          snapshots.push({
            path: fullPath,
            timestamp: stat.mtimeMs,
            relativePath,
          });
        }
      }
    };

    walkDir(this.snapshotsDir);
    return snapshots;
  }

  /**
   * Restore files from snapshots
   */
  async restoreFromSnapshots(snapshots: FileSnapshot[]): Promise<void> {
    for (const snapshot of snapshots) {
      const targetPath = join(this.workTree, snapshot.relativePath);
      const targetDir = dirname(targetPath);

      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      try {
        copyFileSync(snapshot.path, targetPath);
      } catch (error) {
        console.warn(`Failed to restore ${snapshot.relativePath}:`, error);
      }
    }
  }

  /**
   * Check if a file should be ignored
   */
  private shouldIgnore(file: string): boolean {
    for (const pattern of this.config.ignorePatterns) {
      if (minimatch(file, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clean up old snapshots (optional, for maintenance)
   */
  async cleanupOldSnapshots(olderThanDays: number = 30): Promise<number> {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const snapshots = this.getSnapshots();
    let cleaned = 0;

    for (const snapshot of snapshots) {
      if (snapshot.timestamp < cutoffTime) {
        try {
          const fs = await import("node:fs/promises");
          await fs.unlink(snapshot.path);
          cleaned++;
        } catch (error) {
          console.warn(`Failed to clean up ${snapshot.path}:`, error);
        }
      }
    }

    return cleaned;
  }
}
