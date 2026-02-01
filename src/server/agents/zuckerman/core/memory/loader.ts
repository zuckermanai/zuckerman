import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

export interface LoadedPrompts {
  system: string;
  behavior: string;
  personality: string;
  instructions: string;
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
    const prompts: LoadedPrompts = {
      system: "",
      behavior: "",
      personality: "",
      instructions: "",
      files: new Map(),
    };

    // Load core prompt files from bootstrap directory
    const bootstrapDir = join(coreDir, "memory", "bootstrap");
    const coreFiles = [
      { path: join(bootstrapDir, "system.md"), key: "system" as const },
      { path: join(bootstrapDir, "behavior.md"), key: "behavior" as const },
      { path: join(bootstrapDir, "personality.md"), key: "personality" as const },
      { path: join(bootstrapDir, "README.md"), key: "instructions" as const },
    ];

    for (const file of coreFiles) {
      if (existsSync(file.path)) {
        try {
          const content = await readFile(file.path, "utf-8");
          prompts[file.key] = content;
          prompts.files.set(file.path, content);
        } catch (err) {
          console.warn(`[PromptLoader] Failed to load ${file.path}:`, err);
        }
      } else {
        console.warn(`[PromptLoader] File not found: ${file.path} (agentDir: ${agentDir}, bootstrapDir: ${bootstrapDir})`);
      }
    }

    // Load all markdown files from bootstrap directory
    try {
      if (existsSync(bootstrapDir)) {
        const files = await readdir(bootstrapDir);
        for (const file of files) {
          if (file.endsWith(".md")) {
            const filePath = join(bootstrapDir, file);
            const content = await readFile(filePath, "utf-8");
            prompts.files.set(filePath, content);
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to load bootstrap directory files:`, err);
    }

    this.promptCache.set(agentDir, prompts);
    return prompts;
  }

  /**
   * Build system prompt from loaded prompts
   */
  buildSystemPrompt(prompts: LoadedPrompts): string {
    const parts: string[] = [];

    if (prompts.system) {
      parts.push(`# System\n\n${prompts.system}`);
    }

    // Collect all personality files from bootstrap directory
    const personalityFiles: Array<{ path: string; content: string }> = [];
    const personalityFileNames = ["personality.md", "traits.md", "motivations.md", "values.md", "fear.md", "joy.md"];
    for (const [filePath, content] of prompts.files.entries()) {
      const fileName = filePath.split("/").pop() || "";
      if (personalityFileNames.includes(fileName)) {
        personalityFiles.push({ path: filePath, content });
      }
    }

    // Sort: personality.md first, then others alphabetically
    personalityFiles.sort((a, b) => {
      const aIsMain = a.path.endsWith("/personality.md");
      const bIsMain = b.path.endsWith("/personality.md");
      if (aIsMain && !bIsMain) return -1;
      if (!aIsMain && bIsMain) return 1;
      return a.path.localeCompare(b.path);
    });

    if (personalityFiles.length > 0) {
      const personalityContent = personalityFiles
        .map((file) => file.content)
        .join("\n\n---\n\n");
      parts.push(`# Personality\n\n${personalityContent}`);
    } else if (prompts.personality) {
      // Fallback to main personality if no files found
      parts.push(`# Personality\n\n${prompts.personality}`);
    }

    if (prompts.behavior) {
      parts.push(`# Behavior\n\n${prompts.behavior}`);
    }

    if (prompts.instructions) {
      parts.push(`# Instructions\n\n${prompts.instructions}`);
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
