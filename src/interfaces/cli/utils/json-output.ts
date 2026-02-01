/**
 * Utility functions for JSON output in CLI commands
 */

export interface JsonOutputOptions {
  json?: boolean;
}

/**
 * Output data as JSON or formatted text based on options
 */
export function outputJson<T>(data: T, options: JsonOutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    // For non-JSON output, this function doesn't format - commands handle their own formatting
    // This is just a placeholder that can be extended
  }
}

/**
 * Parse JSON input from stdin or file
 */
export async function parseJsonInput(input?: string): Promise<unknown> {
  if (input) {
    try {
      return JSON.parse(input);
    } catch (err) {
      throw new Error(`Invalid JSON input: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  }

  // Try to read from stdin if available
  if (process.stdin.isTTY) {
    throw new Error("No JSON input provided. Use --input <json> or pipe JSON data.");
  }

  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Invalid JSON from stdin: ${err instanceof Error ? err.message : "Unknown error"}`));
      }
    });
    process.stdin.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Check if output should be JSON based on options or environment
 */
export function shouldOutputJson(options: JsonOutputOptions): boolean {
  return options.json === true || process.env.ZUCKERMAN_JSON === "1";
}
