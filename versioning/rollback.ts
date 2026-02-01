import { GitClient } from "./git-client.js";
import { SnapshotManager } from "./snapshot-manager.js";
import type { Config } from "./config.js";

export interface RollbackOptions {
  commitHash?: string;
  dryRun?: boolean;
}

export class RollbackManager {
  private gitClient: GitClient;
  private snapshotManager: SnapshotManager;
  private config: Config;
  private workTree: string;

  constructor(
    config: Config,
    workTree: string,
    gitClient: GitClient,
    snapshotManager: SnapshotManager
  ) {
    this.config = config;
    this.workTree = workTree;
    this.gitClient = gitClient;
    this.snapshotManager = snapshotManager;
  }

  /**
   * Rollback to a specific commit
   */
  async rollback(options: RollbackOptions = {}): Promise<void> {
    const { commitHash, dryRun = false } = options;

    if (!commitHash) {
      throw new Error("Commit hash is required for rollback");
    }

    if (dryRun) {
      const diff = await this.gitClient.getDiff(commitHash);
      console.log("Rollback preview (diff):");
      console.log(diff);
      return;
    }

    try {
      // Get the diff to see what will change
      const diff = await this.gitClient.getDiff(commitHash);
      console.log("Rolling back to commit:", commitHash);
      console.log("Changes:", diff);

      // Checkout the specific commit
      await this.gitClient.checkout(commitHash);
      console.log("Rollback completed successfully");
    } catch (error) {
      console.error("Rollback failed:", error);
      throw error;
    }
  }

  /**
   * Rollback to the previous commit
   */
  async rollbackToPrevious(): Promise<void> {
    const history = await this.gitClient.getHistory(2);
    
    if (history.length < 2) {
      throw new Error("No previous commit to rollback to");
    }

    // history[0] is HEAD, history[1] is the previous commit
    const previousCommitHash = history[1].split(" ")[0];
    await this.rollback({ commitHash: previousCommitHash });
  }

  /**
   * List available commits for rollback
   */
  async listCommits(limit: number = 20): Promise<string[]> {
    return await this.gitClient.getHistory(limit);
  }

  /**
   * Get details about a specific commit
   */
  async getCommitDetails(commitHash: string): Promise<{
    hash: string;
    message: string;
    diff: string;
  }> {
    const diff = await this.gitClient.getDiff(commitHash);
    const history = await this.gitClient.getHistory(100);
    
    const commit = history.find((line) => line.startsWith(commitHash));
    const message = commit ? commit.substring(commitHash.length + 1) : "Unknown";

    return {
      hash: commitHash,
      message,
      diff,
    };
  }

  /**
   * Restore files from snapshots instead of git commits
   */
  async restoreFromSnapshots(snapshotPaths: string[]): Promise<void> {
    const snapshots = this.snapshotManager.getSnapshots();
    const filteredSnapshots = snapshots.filter((snapshot) =>
      snapshotPaths.includes(snapshot.relativePath)
    );

    if (filteredSnapshots.length === 0) {
      throw new Error("No matching snapshots found");
    }

    await this.snapshotManager.restoreFromSnapshots(filteredSnapshots);
    console.log(`Restored ${filteredSnapshots.length} file(s) from snapshots`);
  }
}
