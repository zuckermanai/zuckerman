import type { GatewayAuthConfig } from "../types.js";
import { randomBytes, createHash } from "node:crypto";

export interface AuthResult {
  authenticated: boolean;
  clientId?: string;
  reason?: string;
}

export interface RateLimitState {
  requests: number;
  resetAt: number;
}

/**
 * Gateway authentication manager
 */
export class GatewayAuthManager {
  private config: GatewayAuthConfig;
  private tokens: Set<string>;
  private apiKeys: Set<string>;
  private rateLimitMap = new Map<string, RateLimitState>();

  constructor(config: GatewayAuthConfig = {}) {
    this.config = config;
    this.tokens = new Set(config.tokens ?? []);
    this.apiKeys = new Set(config.apiKeys ?? []);
  }

  /**
   * Authenticate a client
   */
  authenticate(authHeader?: string, apiKey?: string): AuthResult {
    if (!this.config.enabled) {
      return { authenticated: true };
    }

    // Check API key
    if (apiKey && this.apiKeys.has(apiKey)) {
      return { authenticated: true };
    }

    // Check token from Authorization header
    if (authHeader) {
      const token = this.extractToken(authHeader);
      if (token && this.tokens.has(token)) {
        return { authenticated: true };
      }
    }

    return {
      authenticated: false,
      reason: "Authentication required. Provide a valid token or API key.",
    };
  }

  /**
   * Check rate limit
   */
  checkRateLimit(clientId: string): { allowed: boolean; resetAt?: number } {
    if (!this.config.rateLimit?.requestsPerMinute) {
      return { allowed: true };
    }

    const limit = this.config.rateLimit.requestsPerMinute;
    const now = Date.now();
    const state = this.rateLimitMap.get(clientId);

    if (!state || now >= state.resetAt) {
      // Reset or initialize
      this.rateLimitMap.set(clientId, {
        requests: 1,
        resetAt: now + 60000, // 1 minute
      });
      return { allowed: true };
    }

    if (state.requests >= limit) {
      return {
        allowed: false,
        resetAt: state.resetAt,
      };
    }

    state.requests++;
    return { allowed: true };
  }

  /**
   * Add a token
   */
  addToken(token: string): void {
    this.tokens.add(token);
  }

  /**
   * Remove a token
   */
  removeToken(token: string): void {
    this.tokens.delete(token);
  }

  /**
   * Add an API key
   */
  addApiKey(apiKey: string): void {
    this.apiKeys.add(apiKey);
  }

  /**
   * Remove an API key
   */
  removeApiKey(apiKey: string): void {
    this.apiKeys.delete(apiKey);
  }

  /**
   * Generate a new token
   */
  generateToken(): string {
    const token = `zk_${randomBytes(32).toString("base64url")}`;
    this.tokens.add(token);
    return token;
  }

  /**
   * Extract token from Authorization header
   */
  private extractToken(header: string): string | null {
    const parts = header.trim().split(/\s+/);
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      return null;
    }
    return parts[1];
  }

  /**
   * Cleanup old rate limit entries
   */
  cleanupRateLimits(): void {
    const now = Date.now();
    for (const [clientId, state] of this.rateLimitMap.entries()) {
      if (now >= state.resetAt) {
        this.rateLimitMap.delete(clientId);
      }
    }
  }
}

/**
 * Create auth manager from config
 */
export function createAuthManager(config?: GatewayAuthConfig): GatewayAuthManager {
  return new GatewayAuthManager(config);
}
