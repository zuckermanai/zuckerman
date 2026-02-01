import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface Config {
  versioningDir: string;
  snapshotsDir: string;
  gitDir: string;
  watchPaths: string[];
  ignorePatterns: string[];
  commitMessageTemplate: string;
  autoCommit: boolean;
  autoCommitInterval: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function loadConfig(workTree?: string): Config {
  const configPath = workTree
    ? join(workTree, "versioning", "config.json")
    : join(__dirname, "config.json");

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configContent = readFileSync(configPath, "utf-8");
  return JSON.parse(configContent) as Config;
}
