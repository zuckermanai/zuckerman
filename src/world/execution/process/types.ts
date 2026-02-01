export interface ProcessOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  securityContext?: {
    executionPolicy?: {
      allowlist?: string[];
      denylist?: string[];
      timeout?: number;
      maxOutput?: number;
      allowedPaths?: string[];
      blockedPaths?: string[];
    };
    sandboxContainerName?: string;
  };
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
