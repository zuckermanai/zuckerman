import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, unlink, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getSecretsDir, getSecretsKeyFile, getSecretFile } from "@server/world/homedir/paths.js";
import type { SecretConfig } from "../types.js";

const scryptAsync = promisify(scrypt);
const SECRETS_DIR = getSecretsDir();
const KEY_FILE = getSecretsKeyFile();

/**
 * Generate encryption key
 */
async function generateKey(): Promise<Buffer> {
  return scryptAsync(randomBytes(32), "zuckerman-salt", 32) as Promise<Buffer>;
}

/**
 * Load or generate encryption key
 */
async function getEncryptionKey(): Promise<Buffer> {
  if (existsSync(KEY_FILE)) {
    const keyData = await readFile(KEY_FILE);
    return Buffer.from(keyData);
  }

  // Generate new key
  const key = await generateKey();
  await mkdir(SECRETS_DIR, { recursive: true });
  await writeFile(KEY_FILE, key, { mode: 0o600 });
  return key;
}

/**
 * Encrypt a value
 */
async function encrypt(value: string, key: Buffer): Promise<string> {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  return `${iv.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a value
 */
async function decrypt(encrypted: string, key: Buffer): Promise<string> {
  const [ivHex, data] = encrypted.split(":");
  if (!ivHex || !data) {
    throw new Error("Invalid encrypted format");
  }
  
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

/**
 * Secret manager for encrypted storage
 */
export class SecretManager {
  private config: SecretConfig;
  private key: Buffer | null = null;
  private cache = new Map<string, string>();

  constructor(config: SecretConfig = {}) {
    this.config = config;
  }

  /**
   * Initialize encryption key
   */
  async initialize(): Promise<void> {
    if (this.config.encryption?.enabled) {
      this.key = await getEncryptionKey();
    }
  }

  /**
   * Store a secret
   */
  async storeSecret(key: string, value: string): Promise<void> {
    if (!this.config.encryption?.enabled || !this.key) {
      // Store in plain text if encryption disabled
      this.cache.set(key, value);
      return;
    }

    const encrypted = await encrypt(value, this.key);
    const secretFile = getSecretFile(key);
    
    await mkdir(SECRETS_DIR, { recursive: true });
    await writeFile(secretFile, encrypted, { mode: 0o600 });
    this.cache.set(key, value);
  }

  /**
   * Retrieve a secret
   */
  async getSecret(key: string): Promise<string | null> {
    // Check cache first
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    if (!this.config.encryption?.enabled || !this.key) {
      return null;
    }

    const secretFile = getSecretFile(key);
    if (!existsSync(secretFile)) {
      return null;
    }

    try {
      const encrypted = await readFile(secretFile, "utf-8");
      const decrypted = await decrypt(encrypted, this.key);
      this.cache.set(key, decrypted);
      return decrypted;
    } catch {
      return null;
    }
  }

  /**
   * Delete a secret
   */
  async deleteSecret(key: string): Promise<void> {
    this.cache.delete(key);
    const secretFile = getSecretFile(key);
    if (existsSync(secretFile)) {
      await unlink(secretFile);
    }
  }

  /**
   * List all secret keys
   */
  async listSecrets(): Promise<string[]> {
    if (!existsSync(SECRETS_DIR)) {
      return [];
    }

    const files = await readdir(SECRETS_DIR);
    return files
      .filter((f) => f.endsWith(".enc"))
      .map((f) => f.slice(0, -4));
  }
}

/**
 * Create secret manager from config
 */
export function createSecretManager(config?: SecretConfig): SecretManager {
  return new SecretManager(config);
}
