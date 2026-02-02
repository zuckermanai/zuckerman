import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

export interface LoadedPrompts {
  files: Map<string, string>;
}

/**
 * Service for loading and managing agent prompts from markdown files
 */
export class PromptLoader {
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
    const personalityDir = join(coreDir, "personality");
    const prompts: LoadedPrompts = {
      files: new Map(),
    };

    // Load all markdown files from personality directory
    try {
      if (existsSync(personalityDir)) {
        const files = await readdir(personalityDir);
        for (const file of files) {
          if (file.endsWith(".md")) {
            const filePath = join(personalityDir, file);
            try {
              const content = await readFile(filePath, "utf-8");
              const fileName = file.replace(".md", "");
              prompts.files.set(fileName, content);
            } catch (err) {
              console.warn(`[PromptLoader] Failed to load ${filePath}:`, err);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[PromptLoader] Failed to read personality directory:`, err);
    }

    this.promptCache.set(agentDir, prompts);
    return prompts;
  }

  /**
   * Build system prompt from loaded prompts
   */
  buildSystemPrompt(prompts: LoadedPrompts): string {
    const parts: string[] = [];

    // Include all loaded files
    for (const [fileName, content] of prompts.files.entries()) {
      if (content) {
        const sectionName = fileName.charAt(0).toUpperCase() + fileName.slice(1);
        parts.push(`# ${sectionName}\n\n${content}`);
      }
    }

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
