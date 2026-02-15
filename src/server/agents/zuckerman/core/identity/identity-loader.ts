import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { getSystemContext } from "./dynamic-data.js";

export interface LoadedPrompts {
  files: Map<string, string>;
}

/**
 * Service for loading and managing agent prompts from markdown files
 */
export class IdentityLoader {
  private promptCache: Map<string, LoadedPrompts> = new Map();

  /**
   * Load prompts from agent's core directory
   */
  async loadPrompts(agentDir: string): Promise<LoadedPrompts> {
    // Check cache
    const cached = this.promptCache.get(agentDir);
    if (cached) {
      return cached;
    }

    const coreDir = join(agentDir, "core");
    const identityDir = join(coreDir, "identity");
    const prompts: LoadedPrompts = {
      files: new Map(),
    };

    // Load all markdown files from identity directory
    try {
      if (existsSync(identityDir)) {
        const files = await readdir(identityDir);
        for (const file of files) {
          if (file.endsWith(".md")) {
            const filePath = join(identityDir, file);
            try {
              const content = await readFile(filePath, "utf-8");
              const fileName = file.replace(".md", "");
              prompts.files.set(fileName, content);
            } catch (err) {
              console.warn(`[IdentityLoader] Failed to load ${filePath}:`, err);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[IdentityLoader] Failed to read identity directory:`, err);
    }

    this.promptCache.set(agentDir, prompts);
    return prompts;
  }

  /**
   * Get system prompt by loading prompts from agent directory
   */
  async getSystemPrompt(agentDir: string): Promise<string> {
    const prompts = await this.loadPrompts(agentDir);
    const parts: string[] = [];

    // Include all loaded files
    for (const [fileName, content] of prompts.files.entries()) {
      if (content) {
        const sectionName = fileName.charAt(0).toUpperCase() + fileName.slice(1);
        parts.push(`# ${sectionName}\n\n${content}`);
      }
    }

    // Add dynamic data at the end
    const dynamicData = getSystemContext({
      directories: true,
      systemInfo: true,
      environment: true,
      agentDir,
    });
    parts.push(dynamicData);

    return parts.join("\n\n---\n\n");
  }

  /**
   * Clear cache for a specific agent or all agents
   */
  clearCache(agentDir?: string): void {
    if (agentDir) {
      this.promptCache.delete(agentDir);
    } else {
      this.promptCache.clear();
    }
  }
}
