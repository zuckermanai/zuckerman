import { resolve } from "node:path";
import { GitClient } from "./git-client.js";
import { Watcher, type ChangeEvent } from "./watcher.js";
import { SnapshotManager } from "./snapshot-manager.js";
import { RollbackManager } from "./rollback.js";
import { loadConfig, type Config } from "./config.js";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

export class VersioningSystem {
  private config: Config;
  private workTree: string;
  private gitClient: GitClient;
  private watcher: Watcher;
  private snapshotManager: SnapshotManager;
  private rollbackManager: RollbackManager;
  private autoCommitTimer?: NodeJS.Timeout;
  private pendingFiles: Set<string> = new Set();

  constructor(workTree: string = process.cwd()) {
    this.workTree = resolve(workTree);
    this.config = loadConfig(this.workTree);
    
    this.gitClient = new GitClient(this.config, this.workTree);
    this.snapshotManager = new SnapshotManager(this.config, this.workTree);
    this.watcher = new Watcher(this.config, this.workTree);
    this.rollbackManager = new RollbackManager(
      this.config,
      this.workTree,
      this.gitClient,
      this.snapshotManager
    );
  }

  /**
   * Initialize the versioning system
   */
  async initialize(): Promise<void> {
    // Ensure .versioning/ is in .gitignore
    this.ensureGitignore();

    // Initialize git repository
    await this.gitClient.initialize();

    // Initialize snapshots directory
    this.snapshotManager.initialize();

    console.log("Versioning system initialized");
  }

  /**
   * Start watching for changes and auto-committing
   */
  async start(): Promise<void> {
    await this.initialize();

    // Start watching for changes
    await this.watcher.start((events: ChangeEvent[]) => {
      this.handleChanges(events);
    });

    // Set up auto-commit if enabled
    if (this.config.autoCommit) {
      this.setupAutoCommit();
    }

    console.log("Versioning system started");
  }

  /**
   * Stop watching and cleanup
   */
  stop(): void {
    this.watcher.stop();
    
    if (this.autoCommitTimer) {
      clearTimeout(this.autoCommitTimer);
      this.autoCommitTimer = undefined;
    }

    // Commit any pending changes
    if (this.pendingFiles.size > 0) {
      this.commitPendingChanges().catch(console.error);
    }

    console.log("Versioning system stopped");
  }

  /**
   * Handle file changes
   */
  private async handleChanges(events: ChangeEvent[]): Promise<void> {
    for (const event of events) {
      this.pendingFiles.add(event.path);
    }

    // Create snapshots for changed files
    const filesToSnapshot = Array.from(this.pendingFiles);
    await this.snapshotManager.createSnapshots(filesToSnapshot);

    // If auto-commit is disabled, just track changes
    if (!this.config.autoCommit) {
      return;
    }

    // Auto-commit will handle committing
  }

  /**
   * Setup auto-commit timer
   */
  private setupAutoCommit(): void {
    const commitPending = async () => {
      if (this.pendingFiles.size > 0) {
        await this.commitPendingChanges();
      }
      this.autoCommitTimer = setTimeout(commitPending, this.config.autoCommitInterval);
    };

    this.autoCommitTimer = setTimeout(commitPending, this.config.autoCommitInterval);
  }

  /**
   * Commit pending changes
   */
  private async commitPendingChanges(): Promise<void> {
    if (this.pendingFiles.size === 0) {
      return;
    }

    const files = Array.from(this.pendingFiles);
    this.pendingFiles.clear();

    try {
      // Add files to git
      await this.gitClient.addFiles(files);

      // Create commit message
      const timestamp = new Date().toISOString();
      const message = this.config.commitMessageTemplate
        .replace("{timestamp}", timestamp)
        .replace("{files}", files.join(", "))
        .replace("{context}", "Auto-commit from agent changes");

      // Commit
      const commitHash = await this.gitClient.commit(message, {
        timestamp,
        files: files.join(", "),
        context: "Auto-commit from agent changes",
      });

      if (commitHash) {
        console.log(`Committed changes: ${commitHash.substring(0, 7)}`);
      }
    } catch (error) {
      console.error("Failed to commit changes:", error);
      // Re-add files to pending if commit failed
      files.forEach((file) => this.pendingFiles.add(file));
    }
  }

  /**
   * Manually commit current changes
   */
  async commit(message?: string, context?: Record<string, string>): Promise<string | null> {
    const files = Array.from(this.pendingFiles);
    if (files.length === 0) {
      console.log("No changes to commit");
      return null;
    }

    await this.gitClient.addFiles(files);

    const commitMessage =
      message ||
      this.config.commitMessageTemplate
        .replace("{timestamp}", new Date().toISOString())
        .replace("{files}", files.join(", "))
        .replace("{context}", context?.context || "Manual commit");

    const commitHash = await this.gitClient.commit(commitMessage, context);
    this.pendingFiles.clear();

    return commitHash;
  }

  /**
   * Get rollback manager
   */
  getRollbackManager(): RollbackManager {
    return this.rollbackManager;
  }

  /**
   * Get git client
   */
  getGitClient(): GitClient {
    return this.gitClient;
  }

  /**
   * Ensure .versioning/ is in .gitignore
   */
  private ensureGitignore(): void {
    const gitignorePath = join(this.workTree, ".gitignore");
    const versioningPattern = this.config.versioningDir;

    if (!existsSync(gitignorePath)) {
      // Create .gitignore if it doesn't exist
      writeFileSync(gitignorePath, `${versioningPattern}\n`, "utf-8");
      return;
    }

    // Check if .versioning/ is already in .gitignore
    const gitignoreContent = readFileSync(gitignorePath, "utf-8");
    if (!gitignoreContent.includes(versioningPattern)) {
      // Append to .gitignore
      const updatedContent = gitignoreContent.endsWith("\n")
        ? `${gitignoreContent}${versioningPattern}\n`
        : `${gitignoreContent}\n${versioningPattern}\n`;
      writeFileSync(gitignorePath, updatedContent, "utf-8");
    }
  }
}

// Export all types and classes
export { GitClient } from "./git-client.js";
export { Watcher, type ChangeEvent } from "./watcher.js";
export { SnapshotManager, type FileSnapshot } from "./snapshot-manager.js";
export { RollbackManager, type RollbackOptions } from "./rollback.js";
export { loadConfig, type Config } from "./config.js";
