import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.js";

export class GitClient {
  private gitDir: string;
  private workTree: string;
  private config: Config;

  constructor(config: Config, workTree: string) {
    this.config = config;
    this.gitDir = join(workTree, config.gitDir);
    this.workTree = workTree;
  }

  /**
   * Initialize .versioning/.git/ repository if it doesn't exist
   */
  async initialize(): Promise<void> {
    if (!existsSync(this.gitDir)) {
      mkdirSync(this.gitDir, { recursive: true });
      this.runGitCommand(["init", "--bare"], { cwd: this.gitDir });
      
      // Configure git for this repository
      this.runGitCommand(["config", "user.name", "Agent Versioning"], { cwd: this.gitDir });
      this.runGitCommand(["config", "user.email", "agent@versioning.local"], { cwd: this.gitDir });
    }
  }

  /**
   * Add files to the staging area
   */
  async addFiles(files: string[]): Promise<void> {
    if (files.length === 0) return;
    
    const gitEnv = {
      ...process.env,
      GIT_DIR: this.gitDir,
      GIT_WORK_TREE: this.workTree,
    };

    for (const file of files) {
      try {
        this.runGitCommand(["add", "--force", file], { 
          cwd: this.workTree,
          env: gitEnv 
        });
      } catch (error) {
        console.warn(`Failed to add ${file}:`, error);
      }
    }
  }

  /**
   * Commit changes with agent context
   */
  async commit(message: string, context?: Record<string, string>): Promise<string | null> {
    const gitEnv = {
      ...process.env,
      GIT_DIR: this.gitDir,
      GIT_WORK_TREE: this.workTree,
    };

    try {
      // Check if there are any changes to commit
      const status = this.runGitCommand(["status", "--porcelain"], {
        cwd: this.workTree,
        env: gitEnv,
      });

      if (!status.trim()) {
        return null; // No changes to commit
      }

      // Create commit with message
      const commitMessage = this.formatCommitMessage(message, context);
      const commitHash = this.runGitCommand(
        ["commit", "-m", commitMessage],
        {
          cwd: this.workTree,
          env: gitEnv,
        }
      );

      return commitHash.trim();
    } catch (error) {
      console.error("Failed to commit:", error);
      throw error;
    }
  }

  /**
   * Get commit history
   */
  async getHistory(limit: number = 10): Promise<string[]> {
    const gitEnv = {
      ...process.env,
      GIT_DIR: this.gitDir,
      GIT_WORK_TREE: this.workTree,
    };

    try {
      const log = this.runGitCommand(
        ["log", "--oneline", `-${limit}`],
        {
          cwd: this.workTree,
          env: gitEnv,
        }
      );
      return log.trim().split("\n").filter(Boolean);
    } catch (error) {
      console.error("Failed to get history:", error);
      return [];
    }
  }

  /**
   * Get diff for a specific commit
   */
  async getDiff(commitHash: string): Promise<string> {
    const gitEnv = {
      ...process.env,
      GIT_DIR: this.gitDir,
      GIT_WORK_TREE: this.workTree,
    };

    try {
      return this.runGitCommand(["show", commitHash], {
        cwd: this.workTree,
        env: gitEnv,
      });
    } catch (error) {
      console.error("Failed to get diff:", error);
      throw error;
    }
  }

  /**
   * Checkout a specific commit
   */
  async checkout(commitHash: string): Promise<void> {
    const gitEnv = {
      ...process.env,
      GIT_DIR: this.gitDir,
      GIT_WORK_TREE: this.workTree,
    };

    try {
      this.runGitCommand(["checkout", commitHash, "--", "."], {
        cwd: this.workTree,
        env: gitEnv,
      });
    } catch (error) {
      console.error("Failed to checkout:", error);
      throw error;
    }
  }

  /**
   * Get current HEAD commit hash
   */
  async getHead(): Promise<string | null> {
    const gitEnv = {
      ...process.env,
      GIT_DIR: this.gitDir,
      GIT_WORK_TREE: this.workTree,
    };

    try {
      const hash = this.runGitCommand(["rev-parse", "HEAD"], {
        cwd: this.workTree,
        env: gitEnv,
      });
      return hash.trim() || null;
    } catch (error) {
      return null;
    }
  }

  private formatCommitMessage(message: string, context?: Record<string, string>): string {
    if (!context) return message;

    let formatted = message;
    for (const [key, value] of Object.entries(context)) {
      formatted = formatted.replace(`{${key}}`, value);
    }
    return formatted;
  }

  private runGitCommand(args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): string {
    try {
      return execSync(`git ${args.join(" ")}`, {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error: any) {
      if (error.stderr) {
        throw new Error(`Git command failed: ${error.stderr.toString()}`);
      }
      throw error;
    }
  }
}
