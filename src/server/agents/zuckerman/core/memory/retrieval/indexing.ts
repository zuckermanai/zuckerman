/**
 * Memory Indexing Service
 * Handles indexing memory files into the database for search
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import * as globModule from "glob";
const glob = globModule.glob;
import {
  getWorkspaceMemoryDir,
  getWorkspaceMemoryFilePath,
} from "@server/world/homedir/paths.js";
import type { ResolvedMemorySearchConfig } from "../config.js";
import type { EmbeddingProvider } from "@server/world/providers/embeddings/index.js";
import type { BaseMemory, EpisodicMemory, ProceduralMemory, ProspectiveMemory, EmotionalMemory, SemanticMemory } from "../types.js";

export interface MemoryIndexer {
  sync(params?: {
    reason?: string;
    force?: boolean;
  }): Promise<void>;
}

export class MemoryIndexerImpl implements MemoryIndexer {
  private db: DatabaseSync;
  private config: ResolvedMemorySearchConfig;
  private workspaceDir: string;
  private embeddingProvider: EmbeddingProvider | null;
  private ftsTable: string;

  constructor(
    db: DatabaseSync,
    config: ResolvedMemorySearchConfig,
    workspaceDir: string,
    embeddingProvider: EmbeddingProvider | null,
    ftsTable: string,
  ) {
    this.db = db;
    this.config = config;
    this.workspaceDir = workspaceDir;
    this.embeddingProvider = embeddingProvider;
    this.ftsTable = ftsTable;
  }

  async sync(params?: { reason?: string; force?: boolean }): Promise<void> {
    if (!this.embeddingProvider) {
      console.warn("[Memory] Cannot sync: embedding provider not available");
      return;
    }

    const memoryDir = getWorkspaceMemoryDir(this.workspaceDir);
    if (!existsSync(memoryDir)) {
      return;
    }

    // Sync all JSON memory files
    const memoryFiles = await glob("*.json", { cwd: memoryDir, absolute: false });
    for (const fileName of memoryFiles) {
      const memories = this.loadMemoriesFromFile<BaseMemory>(fileName);
      if (memories.length > 0) {
        await this.syncMemoryFile(fileName, memories, params?.force);
      }
    }

    if (params?.reason) {
      console.log(`[Memory] Indexing sync completed: ${params.reason}`);
    }
  }

  private loadMemoriesFromFile<T extends BaseMemory>(fileName: string): T[] {
    const filePath = getWorkspaceMemoryFilePath(this.workspaceDir, fileName);
    if (!existsSync(filePath)) {
      return [];
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      if (!content.trim()) {
        return [];
      }

      const data: { memories?: T[] } = JSON.parse(content);
      if (!Array.isArray(data.memories)) {
        return [];
      }

      return data.memories.filter(m => m.id && m.type) as T[];
    } catch (error) {
      console.warn(`[Memory] Failed to load memories from ${filePath}:`, error);
      return [];
    }
  }

  private async syncMemoryFile(fileName: string, memories: BaseMemory[], force?: boolean): Promise<void> {
    const relPath = `memory/${fileName}`;
    const absPath = getWorkspaceMemoryFilePath(this.workspaceDir, fileName);

    // Check if file needs updating
    if (!force && existsSync(absPath)) {
      const stats = statSync(absPath);
      const existing = this.db.prepare("SELECT mtime FROM files WHERE path = ?").get(relPath) as { mtime: number } | undefined;
      if (existing?.mtime === stats.mtimeMs) {
        return; // File unchanged
      }
    }

    // Delete old chunks
    this.deleteChunksForPath(relPath);

    // Format memories as text and generate embeddings
    const texts = memories.map(m => this.formatMemoryAsText(m));
    const embeddings = await this.generateEmbeddings(texts);

    // Insert chunks
    this.insertChunks(relPath, memories, texts, embeddings);

    // Update file record
    this.updateFileRecord(relPath, absPath, memories);
  }

  private deleteChunksForPath(path: string): void {
    this.db.prepare("DELETE FROM chunks WHERE path = ?").run(path);
    if (this.config.store.vector.enabled) {
      try {
        this.db.prepare(`DELETE FROM ${this.ftsTable} WHERE path = ?`).run(path);
      } catch {
        // FTS table might not exist
      }
    }
  }

  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.embeddingProvider || texts.length === 0) {
      return [];
    }

    try {
      return await this.embeddingProvider.getEmbeddings(texts);
    } catch (error) {
      console.warn(`[Memory] Failed to generate embeddings:`, error);
      return [];
    }
  }

  private insertChunks(path: string, memories: BaseMemory[], texts: string[], embeddings: number[][]): void {
    const insertChunk = this.db.prepare(`
      INSERT OR REPLACE INTO chunks 
      (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFTS = this.config.store.vector.enabled
      ? this.db.prepare(`
          INSERT INTO ${this.ftsTable} 
          (id, path, source, start_line, end_line, model, text)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
      : null;

    for (let i = 0; i < memories.length; i++) {
      const text = texts[i];
      const memory = memories[i];
      const embedding = embeddings[i] || [];
      const chunkId = `${path}:${memory.id}:${i}`;
      const hash = createHash("sha256").update(text).digest("hex");

      insertChunk.run(
        chunkId,
        path,
        "memory",
        i,
        i,
        hash,
        this.config.model,
        text,
        JSON.stringify(embedding),
        memory.updatedAt
      );

      if (insertFTS) {
        try {
          insertFTS.run(chunkId, path, "memory", i, i, this.config.model, text);
        } catch (error) {
          console.warn("[Memory] FTS insert failed:", error);
        }
      }
    }
  }

  private updateFileRecord(path: string, absPath: string, memories: BaseMemory[]): void {
    const content = JSON.stringify(memories);
    const hash = createHash("sha256").update(content).digest("hex");
    const mtime = existsSync(absPath) ? statSync(absPath).mtimeMs : Date.now();
    const size = content.length;

    this.db.prepare(`
      INSERT OR REPLACE INTO files (path, source, hash, mtime, size)
      VALUES (?, ?, ?, ?, ?)
    `).run(path, "memory", hash, mtime, size);
  }

  /**
   * Format a memory object as searchable text based on its type
   */
  private formatMemoryAsText(memory: BaseMemory): string {
    switch (memory.type) {
      case "semantic": {
        const m = memory as SemanticMemory;
        let text = m.fact;
        if (m.category) {
          text = `${m.category}: ${text}`;
        }
        if (m.source) {
          text += ` (source: ${m.source})`;
        }
        return text;
      }
      case "episodic": {
        const m = memory as EpisodicMemory;
        let text = m.event;
        if (m.context) {
          const parts: string[] = [];
          if (m.context.who) parts.push(`who: ${m.context.who}`);
          if (m.context.what) parts.push(`what: ${m.context.what}`);
          if (m.context.where) parts.push(`where: ${m.context.where}`);
          if (m.context.why) parts.push(`why: ${m.context.why}`);
          if (parts.length > 0) {
            text += ` (${parts.join(", ")})`;
          }
        }
        return text;
      }
      case "procedural": {
        const m = memory as ProceduralMemory;
        let text = `${m.pattern}: ${m.action}`;
        if (m.trigger) {
          text += ` (trigger: ${typeof m.trigger === "string" ? m.trigger : m.trigger.toString()})`;
        }
        if (m.successRate !== undefined) {
          text += ` (success rate: ${(m.successRate * 100).toFixed(0)}%)`;
        }
        return text;
      }
      case "prospective": {
        const m = memory as ProspectiveMemory;
        let text = m.intention;
        if (m.triggerContext) {
          text += ` (trigger: ${m.triggerContext})`;
        }
        if (m.status) {
          text += ` (status: ${m.status})`;
        }
        return text;
      }
      case "emotional": {
        const m = memory as EmotionalMemory;
        return `${m.tag.emotion} (${m.tag.intensity})${m.context ? `: ${m.context}` : ""}`;
      }
      default:
        return JSON.stringify(memory);
    }
  }
}
