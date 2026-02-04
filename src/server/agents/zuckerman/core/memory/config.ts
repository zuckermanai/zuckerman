/**
 * Memory search configuration
 * Based on OpenClaw's memory search configuration
 */

import { getAgentMemoryDbPath } from "@server/world/homedir/paths.js";

export type MemorySource = "memory" | "conversations";

export type MemorySearchConfig = {
  enabled?: boolean;
  sources?: Array<MemorySource>;
  extraPaths?: string[];
  provider?: "openai" | "local" | "gemini" | "auto";
  remote?: {
    baseUrl?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    batch?: {
      enabled?: boolean;
      wait?: boolean;
      concurrency?: number;
      pollIntervalMs?: number;
      timeoutMinutes?: number;
    };
  };
  fallback?: "openai" | "gemini" | "local" | "none";
  model?: string;
  local?: {
    modelPath?: string;
    modelCacheDir?: string;
  };
  store?: {
    driver?: "sqlite";
    path?: string;
    vector?: {
      enabled?: boolean;
      extensionPath?: string;
    };
  };
  chunking?: {
    tokens?: number;
    overlap?: number;
  };
  sync?: {
    onConversationStart?: boolean;
    onSearch?: boolean;
    watch?: boolean;
    watchDebounceMs?: number;
    intervalMinutes?: number;
    conversations?: {
      deltaBytes?: number;
      deltaMessages?: number;
    };
  };
  query?: {
    maxResults?: number;
    minScore?: number;
    hybrid?: {
      enabled?: boolean;
      vectorWeight?: number;
      textWeight?: number;
      candidateMultiplier?: number;
    };
  };
  cache?: {
    enabled?: boolean;
    maxEntries?: number;
  };
};

export type ResolvedMemorySearchConfig = {
  enabled: boolean;
  sources: Array<MemorySource>;
  extraPaths: string[];
  provider: "openai" | "local" | "gemini" | "auto";
  remote?: {
    baseUrl?: string;
    apiKey?: string;
    headers?: Record<string, string>;
    batch: {
      enabled: boolean;
      wait: boolean;
      concurrency: number;
      pollIntervalMs: number;
      timeoutMinutes: number;
    };
  };
  fallback: "openai" | "gemini" | "local" | "none";
  model: string;
  local: {
    modelPath?: string;
    modelCacheDir?: string;
  };
  store: {
    driver: "sqlite";
    path: string;
    vector: {
      enabled: boolean;
      extensionPath?: string;
    };
  };
  chunking: {
    tokens: number;
    overlap: number;
  };
  sync: {
    onConversationStart: boolean;
    onSearch: boolean;
    watch: boolean;
    watchDebounceMs: number;
    intervalMinutes: number;
    conversations: {
      deltaBytes: number;
      deltaMessages: number;
    };
  };
  query: {
    maxResults: number;
    minScore: number;
    hybrid: {
      enabled: boolean;
      vectorWeight: number;
      textWeight: number;
      candidateMultiplier: number;
    };
  };
  cache: {
    enabled: boolean;
    maxEntries?: number;
  };
};

const DEFAULT_OPENAI_MODEL = "text-embedding-3-small";
const DEFAULT_GEMINI_MODEL = "gemini-embedding-001";
const DEFAULT_CHUNK_TOKENS = 400;
const DEFAULT_CHUNK_OVERLAP = 80;
const DEFAULT_WATCH_DEBOUNCE_MS = 1500;
const DEFAULT_CONVERSATION_DELTA_BYTES = 100_000;
const DEFAULT_CONVERSATION_DELTA_MESSAGES = 50;
const DEFAULT_MAX_RESULTS = 6;
const DEFAULT_MIN_SCORE = 0.35;
const DEFAULT_HYBRID_ENABLED = true;
const DEFAULT_HYBRID_VECTOR_WEIGHT = 0.7;
const DEFAULT_HYBRID_TEXT_WEIGHT = 0.3;
const DEFAULT_HYBRID_CANDIDATE_MULTIPLIER = 4;
const DEFAULT_CACHE_ENABLED = true;
const DEFAULT_SOURCES: Array<MemorySource> = ["memory"];

function normalizeSources(
  sources: Array<MemorySource> | undefined,
): Array<MemorySource> {
  const normalized = new Set<MemorySource>();
  const input = sources?.length ? sources : DEFAULT_SOURCES;
  for (const source of input) {
    if (source === "memory" || source === "conversations") {
      normalized.add(source);
    }
  }
  if (normalized.size === 0) normalized.add("memory");
  return Array.from(normalized);
}

export function resolveMemorySearchConfig(
  config: MemorySearchConfig,
  workspaceDir: string,
  agentId: string,
): ResolvedMemorySearchConfig | null {
  const enabled = config.enabled ?? true;
  if (!enabled) return null;

  const provider = config.provider ?? "auto";
  const defaultRemote = config.remote;
  const hasRemoteConfig = Boolean(
    defaultRemote?.baseUrl ||
    defaultRemote?.apiKey ||
    defaultRemote?.headers,
  );
  const includeRemote =
    hasRemoteConfig || provider === "openai" || provider === "gemini" || provider === "auto";
  const batch = {
    enabled: defaultRemote?.batch?.enabled ?? true,
    wait: defaultRemote?.batch?.wait ?? true,
    concurrency: Math.max(1, defaultRemote?.batch?.concurrency ?? 2),
    pollIntervalMs: defaultRemote?.batch?.pollIntervalMs ?? 2000,
    timeoutMinutes: defaultRemote?.batch?.timeoutMinutes ?? 60,
  };
  const remote = includeRemote
    ? {
        baseUrl: defaultRemote?.baseUrl,
        apiKey: defaultRemote?.apiKey,
        headers: defaultRemote?.headers,
        batch,
      }
    : undefined;

  const fallback = config.fallback ?? "none";
  const modelDefault =
    provider === "gemini"
      ? DEFAULT_GEMINI_MODEL
      : provider === "openai"
        ? DEFAULT_OPENAI_MODEL
        : undefined;
  const model = config.model ?? modelDefault ?? "";

  const local = {
    modelPath: config.local?.modelPath,
    modelCacheDir: config.local?.modelCacheDir,
  };

  const sources = normalizeSources(config.sources);
  const rawPaths = (config.extraPaths ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const extraPaths = Array.from(new Set(rawPaths));

  const vector = {
    enabled: config.store?.vector?.enabled ?? true,
    extensionPath: config.store?.vector?.extensionPath,
  };
  // Default path: .zuckerman/agents/{agentId}/memory/{agentId}.sqlite
  const storePath = config.store?.path ?? getAgentMemoryDbPath(agentId);
  const store = {
    driver: "sqlite" as const,
    path: storePath,
    vector,
  };

  const chunking = {
    tokens: config.chunking?.tokens ?? DEFAULT_CHUNK_TOKENS,
    overlap: config.chunking?.overlap ?? DEFAULT_CHUNK_OVERLAP,
  };

  const conversationsConfig = config.sync?.conversations;
  const sync = {
    onConversationStart: config.sync?.onConversationStart ?? true,
    onSearch: config.sync?.onSearch ?? true,
    watch: config.sync?.watch ?? true,
    watchDebounceMs: config.sync?.watchDebounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS,
    intervalMinutes: config.sync?.intervalMinutes ?? 0,
    conversations: {
      deltaBytes: conversationsConfig?.deltaBytes ?? DEFAULT_CONVERSATION_DELTA_BYTES,
      deltaMessages: conversationsConfig?.deltaMessages ?? DEFAULT_CONVERSATION_DELTA_MESSAGES,
    },
  };

  const query = {
    maxResults: config.query?.maxResults ?? DEFAULT_MAX_RESULTS,
    minScore: config.query?.minScore ?? DEFAULT_MIN_SCORE,
  };

  const hybrid = {
    enabled: config.query?.hybrid?.enabled ?? DEFAULT_HYBRID_ENABLED,
    vectorWeight: config.query?.hybrid?.vectorWeight ?? DEFAULT_HYBRID_VECTOR_WEIGHT,
    textWeight: config.query?.hybrid?.textWeight ?? DEFAULT_HYBRID_TEXT_WEIGHT,
    candidateMultiplier:
      config.query?.hybrid?.candidateMultiplier ?? DEFAULT_HYBRID_CANDIDATE_MULTIPLIER,
  };

  const cache = {
    enabled: config.cache?.enabled ?? DEFAULT_CACHE_ENABLED,
    maxEntries: config.cache?.maxEntries,
  };

  const overlap = Math.max(0, Math.min(chunking.overlap, chunking.tokens - 1));
  const minScore = Math.max(0, Math.min(query.minScore, 1));
  const vectorWeight = Math.max(0, Math.min(hybrid.vectorWeight, 1));
  const textWeight = Math.max(0, Math.min(hybrid.textWeight, 1));
  const sum = vectorWeight + textWeight;
  const normalizedVectorWeight = sum > 0 ? vectorWeight / sum : DEFAULT_HYBRID_VECTOR_WEIGHT;
  const normalizedTextWeight = sum > 0 ? textWeight / sum : DEFAULT_HYBRID_TEXT_WEIGHT;
  const candidateMultiplier = Math.max(1, Math.min(hybrid.candidateMultiplier, 20));

  return {
    enabled: true,
    sources,
    extraPaths,
    provider,
    remote,
    fallback,
    model,
    local,
    store,
    chunking: { tokens: Math.max(1, chunking.tokens), overlap },
    sync: {
      ...sync,
      conversations: {
        deltaBytes: Math.max(0, sync.conversations.deltaBytes),
        deltaMessages: Math.max(0, sync.conversations.deltaMessages),
      },
    },
    query: {
      ...query,
      minScore,
      hybrid: {
        enabled: Boolean(hybrid.enabled),
        vectorWeight: normalizedVectorWeight,
        textWeight: normalizedTextWeight,
        candidateMultiplier,
      },
    },
    cache: {
      enabled: Boolean(cache.enabled),
      maxEntries:
        typeof cache.maxEntries === "number" && Number.isFinite(cache.maxEntries)
          ? Math.max(1, Math.floor(cache.maxEntries))
          : undefined,
    },
  };
}
