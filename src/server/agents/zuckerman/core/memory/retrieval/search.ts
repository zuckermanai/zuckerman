/**
 * Memory Search Manager
 * Full implementation with SQLite, vector embeddings, and hybrid search
 */

import { DatabaseSync } from "node:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { getWorkspaceFilePath } from "@server/world/homedir/paths.js";
import type { ResolvedMemorySearchConfig } from "../config.js";
import { parseEmbedding, cosineSimilarity } from "./encoding/embeddings.js";
import { getDatabase, initializeDatabase } from "./db.js";
import { createEmbeddingProvider, type EmbeddingProvider } from "@server/world/providers/embeddings/index.js";
import { MemoryIndexerImpl } from "./indexing.js";

export type MemorySearchResult = {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: "memory" | "conversations";
};

export interface MemorySearchManager {
  search(
    query: string,
    opts?: {
      maxResults?: number;
      minScore?: number;
      conversationKey?: string;
    },
  ): Promise<MemorySearchResult[]>;

  readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }>;

  status(): {
    files: number;
    chunks: number;
    workspaceDir: string;
    dbPath: string;
    provider: string;
    model: string;
    sources: Array<"memory" | "conversations">;
    dbInitialized: boolean;
    dbExists: boolean;
    dbError?: string;
  };

  sync(params?: {
    reason?: string;
    force?: boolean;
  }): Promise<void>;

  close(): Promise<void>;
}

const MANAGER_CACHE = new Map<string, MemorySearchManager>();

class MemorySearchManagerImpl implements MemorySearchManager {
  private db: DatabaseSync | null = null;
  private config: ResolvedMemorySearchConfig;
  private workspaceDir: string;
  private embeddingProvider: EmbeddingProvider | null;
  private indexer: MemoryIndexerImpl | null = null;
  private ftsTable = "fts_memory";
  private embeddingCacheTable = "embedding_cache";

  constructor(config: ResolvedMemorySearchConfig, workspaceDir: string) {
    this.config = config;
    this.workspaceDir = workspaceDir;
    this.embeddingProvider = createEmbeddingProvider(config);
  }

  /**
   * Initialize the database connection and schema.
   * Gets database from registry if available, otherwise initializes it.
   * The database is shared across all memory operations for this agent/workspace combination.
   */
  async initialize(agentId: string): Promise<void> {
    if (this.db) return;

    let result = getDatabase(this.workspaceDir, agentId);
    
    if (!result) {
      result = initializeDatabase(
        this.config,
        this.workspaceDir,
        agentId,
        this.embeddingCacheTable,
        this.ftsTable
      );
    }
    
    this.db = result.db;
    
    // Create indexer instance for syncing files to database
    this.indexer = new MemoryIndexerImpl(
      this.db,
      this.config,
      this.workspaceDir,
      this.embeddingProvider,
      this.ftsTable
    );
  }

  async search(
    query: string,
    opts?: {
      maxResults?: number;
      minScore?: number;
      conversationKey?: string;
    },
  ): Promise<MemorySearchResult[]> {
    // Database is initialized when manager is created via getMemorySearchManager()
    if (!this.db) {
      console.warn("[Memory] Database not initialized, search will return empty results");
      return [];
    }

    // Check if database is empty and sync if needed
    try {
      const chunkCount = (this.db.prepare("SELECT COUNT(*) as count FROM chunks").get() as { count: number }).count;
      if (chunkCount === 0 && this.indexer) {
        console.log("[Memory] Database is empty, syncing before search...");
        await this.sync({ reason: "empty_database_before_search" });
      }
    } catch (error) {
      // If chunks table doesn't exist yet, sync will create it
      if (this.indexer) {
        console.log("[Memory] Database schema may be incomplete, syncing before search...");
        await this.sync({ reason: "schema_incomplete_before_search" });
      }
    }

    const maxResults = opts?.maxResults ?? this.config.query.maxResults;
    const minScore = opts?.minScore ?? this.config.query.minScore;

    // Get query embedding if provider available
    let queryEmbedding: number[] | null = null;
    if (this.embeddingProvider) {
      try {
        queryEmbedding = await this.embeddingProvider.getEmbedding(query);
      } catch (error) {
        console.warn("Failed to get query embedding:", error);
      }
    }

    const results: Array<MemorySearchResult & { vectorScore?: number; ftsScore?: number }> = [];

    // Vector search
    if (queryEmbedding && this.config.query.hybrid.enabled) {
      const chunks = this.db.prepare(`
        SELECT id, path, source, start_line, end_line, text, embedding
        FROM chunks
        WHERE source IN (${this.config.sources.map(() => "?").join(",")})
      `).all(...this.config.sources) as Array<{
        id: string;
        path: string;
        source: string;
        start_line: number;
        end_line: number;
        text: string;
        embedding: string;
      }>;

      for (const chunk of chunks) {
        const chunkEmbedding = parseEmbedding(chunk.embedding);
        if (chunkEmbedding.length === 0) continue;

        const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
        if (similarity >= minScore) {
          results.push({
            path: chunk.path,
            startLine: chunk.start_line,
            endLine: chunk.end_line,
            score: similarity,
            snippet: this.extractSnippet(chunk.text, query),
            source: chunk.source as "memory" | "conversations",
            vectorScore: similarity,
          });
        }
      }
    }

    // FTS5 search (if available and hybrid enabled)
    if (this.config.query.hybrid.enabled) {
      try {
        const sanitizedQuery = this.sanitizeFTS5Query(query);
        const ftsResults = this.db.prepare(`
          SELECT id, path, source, start_line, end_line, text,
                 bm25(${this.ftsTable}) as rank
          FROM ${this.ftsTable}
          WHERE ${this.ftsTable} MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(sanitizedQuery, maxResults * this.config.query.hybrid.candidateMultiplier) as Array<{
          id: string;
          path: string;
          source: string;
          start_line: number;
          end_line: number;
          text: string;
          rank: number;
        }>;

        // Normalize FTS scores (lower rank = better, so invert)
        const maxRank = Math.max(...ftsResults.map((r) => Math.abs(r.rank)), 1);
        
        for (const ftsResult of ftsResults) {
          const ftsScore = 1 - Math.abs(ftsResult.rank) / maxRank;
          
          // Find or create result entry
          const existing = results.find(
            (r) => r.path === ftsResult.path &&
                   r.startLine === ftsResult.start_line &&
                   r.endLine === ftsResult.end_line
          );

          if (existing) {
            existing.ftsScore = ftsScore;
            // Combine scores using hybrid weights
            existing.score = 
              (existing.vectorScore ?? 0) * this.config.query.hybrid.vectorWeight +
              ftsScore * this.config.query.hybrid.textWeight;
          } else if (ftsScore >= minScore) {
            results.push({
              path: ftsResult.path,
              startLine: ftsResult.start_line,
              endLine: ftsResult.end_line,
              score: ftsScore * this.config.query.hybrid.textWeight,
              snippet: this.extractSnippet(ftsResult.text, query),
              source: ftsResult.source as "memory" | "conversations",
              ftsScore,
            });
          }
        }
      } catch (error) {
        // FTS5 might not be available, continue with vector-only
        console.warn("FTS5 search failed:", error);
      }
    }

    // Fallback: simple text search if no embeddings
    if (results.length === 0 && !queryEmbedding) {
      const chunks = this.db.prepare(`
        SELECT path, source, start_line, end_line, text
        FROM chunks
        WHERE source IN (${this.config.sources.map(() => "?").join(",")})
          AND text LIKE ?
        LIMIT ?
      `).all(...this.config.sources, `%${query}%`, maxResults * 2) as Array<{
        path: string;
        source: string;
        start_line: number;
        end_line: number;
        text: string;
      }>;

      for (const chunk of chunks) {
        const score = this.textMatchScore(chunk.text, query);
        if (score >= minScore) {
          results.push({
            path: chunk.path,
            startLine: chunk.start_line,
            endLine: chunk.end_line,
            score,
            snippet: this.extractSnippet(chunk.text, query),
            source: chunk.source as "memory" | "conversations",
          });
        }
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults).map(({ vectorScore, ftsScore, ...result }) => result);
  }

  async readFile(params: {
    relPath: string;
    from?: number;
    lines?: number;
  }): Promise<{ text: string; path: string }> {
    const filePath = getWorkspaceFilePath(this.workspaceDir, params.relPath);
    
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${params.relPath}`);
    }

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    
    const startLine = params.from ? Math.max(1, params.from) : 1;
    const endLine = params.lines 
      ? Math.min(lines.length, startLine + params.lines - 1)
      : lines.length;

    const selectedLines = lines.slice(startLine - 1, endLine);
    return {
      text: selectedLines.join("\n"),
      path: params.relPath,
    };
  }

  status(): {
    files: number;
    chunks: number;
    workspaceDir: string;
    dbPath: string;
    provider: string;
    model: string;
    sources: Array<"memory" | "conversations">;
    dbInitialized: boolean;
    dbExists: boolean;
    dbError?: string;
  } {
    const dbPath = this.config.store.path;
    const dbExists = existsSync(dbPath);
    
    if (!this.db) {
      return {
        files: 0,
        chunks: 0,
        workspaceDir: this.workspaceDir,
        dbPath,
        provider: this.config.provider,
        model: this.config.model,
        sources: this.config.sources,
        dbInitialized: false,
        dbExists,
        dbError: dbExists ? "Database file exists but not initialized" : "Database file does not exist",
      };
    }

    try {
      const files = (this.db.prepare("SELECT COUNT(*) as count FROM files").get() as { count: number }).count;
      const chunks = (this.db.prepare("SELECT COUNT(*) as count FROM chunks").get() as { count: number }).count;

      return {
        files,
        chunks,
        workspaceDir: this.workspaceDir,
        dbPath,
        provider: this.config.provider,
        model: this.config.model,
        sources: this.config.sources,
        dbInitialized: true,
        dbExists: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        files: 0,
        chunks: 0,
        workspaceDir: this.workspaceDir,
        dbPath,
        provider: this.config.provider,
        model: this.config.model,
        sources: this.config.sources,
        dbInitialized: false,
        dbExists,
        dbError: `Database query failed: ${message}`,
      };
    }
  }

  async sync(params?: { reason?: string; force?: boolean }): Promise<void> {
    // Database is initialized when manager is created via getMemorySearchManager()
    if (!this.indexer) {
      console.warn("[Memory] Cannot sync: indexer not initialized");
      return;
    }
    
    // Delegate to indexing service
    await this.indexer.sync(params);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private extractSnippet(text: string, query: string, maxLength = 200): string {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    const index = textLower.indexOf(queryLower);

    if (index === -1) {
      return text.slice(0, maxLength) + (text.length > maxLength ? "..." : "");
    }

    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + query.length + 50);
    let snippet = text.slice(start, end);

    if (start > 0) snippet = "..." + snippet;
    if (end < text.length) snippet = snippet + "...";

    return snippet;
  }

  private textMatchScore(text: string, query: string): number {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 0);

    if (queryWords.length === 0) return 0;

    const matches = queryWords.filter((word) => textLower.includes(word)).length;
    return matches / queryWords.length;
  }

  /**
   * Sanitize query string for FTS5 MATCH clause
   * Escapes quotes properly to prevent syntax errors
   * FTS5 requires single quotes to be doubled, and wrapping words/phrases
   * in double quotes treats them as literals, preventing special character issues
   */
  private sanitizeFTS5Query(query: string): string {
    if (!query || query.trim().length === 0) {
      return "";
    }

    // Split query into words to handle multi-word queries better
    const words = query.trim().split(/\s+/).filter(w => w.length > 0);
    
    if (words.length === 0) {
      return "";
    }

    // Sanitize each word: escape quotes and wrap in double quotes
    // This treats each word as a literal, preventing FTS5 operator interpretation
    const sanitizedWords = words.map(word => {
      // Escape double quotes by doubling them
      let sanitized = word.replace(/"/g, '""');
      // Escape single quotes by doubling them (FTS5 requirement)
      sanitized = sanitized.replace(/'/g, "''");
      // Wrap in double quotes to treat as literal
      return `"${sanitized}"`;
    });

    // Join with spaces - FTS5 will match documents containing all words
    return sanitizedWords.join(" ");
  }
}

/**
 * Get or create a MemorySearchManager instance.
 * The manager is cached per agent/workspace/config combination.
 * Database is initialized once when the manager is created and shared across all operations.
 */
export async function getMemorySearchManager(params: {
  config: ResolvedMemorySearchConfig;
  workspaceDir: string;
  agentId: string;
}): Promise<{ manager: MemorySearchManager | null; error?: string }> {
  const { config, workspaceDir, agentId } = params;

  if (!config.enabled) {
    return { manager: null };
  }

  const cacheKey = `${agentId}:${workspaceDir}:${JSON.stringify(config)}`;
  const cached = MANAGER_CACHE.get(cacheKey);
  if (cached) {
    return { manager: cached };
  }

  try {
    const manager = new MemorySearchManagerImpl(config, workspaceDir);
    // Initialize database once at creation time - it will be shared across all operations
    // Database is initialized by MemorySystem, but we ensure it's ready here
    await manager.initialize(agentId);

    // Auto-sync on creation if configured
    if (config.sync.onConversationStart) {
      await manager.sync({ reason: "conversation_start" });
    }

    MANAGER_CACHE.set(cacheKey, manager);
    return { manager };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { manager: null, error: message };
  }
}

export async function createMemorySearchManager(
  config: ResolvedMemorySearchConfig,
  workspaceDir: string,
  agentId: string,
): Promise<MemorySearchManager | null> {
  const result = await getMemorySearchManager({ config, workspaceDir, agentId });
  return result.manager;
}
