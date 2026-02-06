import { chromium, type Browser, type Page, type BrowserContext } from "playwright-core";
import type { SecurityContext } from "@server/world/execution/security/types.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import type { Tool, ToolDefinition, ToolResult } from "../terminal/index.js";
import { join, dirname } from "node:path";
import {
  getBrowserDataDir,
  getAgentWorkspaceDir,
  getWorkspaceScreenshotsDir,
  getWorkspaceScreenshotPath,
} from "@server/world/homedir/paths.js";
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { extractSnapshotCode, type SnapshotResult, type SnapshotError } from "./snapshot.js";

const BROWSER_DATA_DIR = getBrowserDataDir();

// Browser manager to maintain a single browser instance across calls
class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      // Ensure browser data directory exists
      if (!existsSync(BROWSER_DATA_DIR)) {
        mkdirSync(BROWSER_DATA_DIR, { recursive: true });
      }

      this.browser = await chromium.launch({
        headless: false, // Show browser window
        channel: "chrome", // Try Chrome first, falls back to chromium
        timeout: 30000, // 30 second timeout for launch
        args: [
          "--start-maximized", // Start maximized so it's visible
          "--disable-blink-features=AutomationControlled", // Don't show automation banner
        ],
      });

      this.context = await this.browser.newContext({
        viewport: null, // Use full screen
      });

      this.page = await this.context.newPage();

      // Bring browser to front (macOS)
      if (process.platform === "darwin") {
        try {
          const execAsync = promisify(exec);
          await execAsync(`osascript -e 'tell application "System Events" to set frontmost of every process whose name contains "Chrome" to true'`);
        } catch {
          // Ignore if it fails
        }
      }
    }
    return this.browser;
  }

  async getPage(): Promise<Page> {
    await this.getBrowser();
    if (!this.page || this.page.isClosed()) {
      // If context is disconnected, getBrowser() will recreate it
      if (!this.context || !this.context.browser()?.isConnected()) {
        await this.getBrowser();
      }
      // Create new page from existing context
      this.page = await this.context!.newPage();
    }
    return this.page;
  }

  async close(): Promise<void> {
    if (this.page && !this.page.isClosed()) {
      await this.page.close().catch(() => { });
    }
    if (this.context) {
      await this.context.close().catch(() => { });
    }
    if (this.browser && this.browser.isConnected()) {
      await this.browser.close();
    }
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  isOpen(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }
}

const browserManager = new BrowserManager();

export function createBrowserTool(): Tool {
  return {
    definition: {
      name: "browser",
      description: "Control Chrome/Chromium browser via CDP. Navigate, take snapshots, interact with pages. Browser stays open indefinitely until explicitly closed with the 'close' action. Screenshots and snapshots are saved to local file paths (workspace/screenshots/ and workspace/snapshots/). Snapshots extract meaningful content and save to files to prevent context overflow - use terminal/file tools to read/search snapshot files when needed.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action to perform: navigate, snapshot, screenshot, click, type, evaluate, close",
          },
          url: {
            type: "string",
            description: "URL to navigate to (for navigate action)",
          },
          selector: {
            type: "string",
            description: "CSS selector for element (for click, type actions)",
          },
          text: {
            type: "string",
            description: "Text to type (for type action)",
          },
          code: {
            type: "string",
            description: "JavaScript code to evaluate (for evaluate action)",
          },
          fullPage: {
            type: "boolean",
            description: "Take full page screenshot (for screenshot action)",
          },
          savePath: {
            type: "string",
            description: "File path to save screenshot (for screenshot action). If not provided, saves to homedir/screenshots/",
          },
          format: {
            type: "string",
            description: "Snapshot format: aria or ai (for snapshot action). Default: ai",
          },
          snapshotSelector: {
            type: "string",
            description: "CSS selector to scope snapshot to specific element (for snapshot action)",
          },
          interactive: {
            type: "boolean",
            description: "Focus on interactive elements only (for snapshot action)",
          },
          maxChars: {
            type: "number",
            description: "Maximum characters per text element (for snapshot action). Default: 200",
          },
        },
        required: ["action"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      console.log(params);
      try {
        const { action } = params;

        if (typeof action !== "string") {
          return {
            success: false,
            error: "action must be a string",
          };
        }

        // Check tool security
        if (securityContext) {
          const toolAllowed = isToolAllowed("browser", securityContext.toolPolicy);
          if (!toolAllowed) {
            return {
              success: false,
              error: "Browser tool is not allowed by security policy",
            };
          }
        }

        // Validate action before launching browser
        const validActions = ["navigate", "snapshot", "screenshot", "click", "type", "evaluate", "close"];
        if (!validActions.includes(action)) {
          return {
            success: false,
            error: `Unknown action: ${action}. Valid actions are: ${validActions.join(", ")}`,
          };
        }

        // Handle close action early (doesn't need browser)
        if (action === "close") {
          await browserManager.close();
          return {
            success: true,
            result: {
              action: "closed",
              message: "Browser closed successfully",
            },
          };
        }

        // Validate action-specific parameters before launching browser
        if (action === "navigate" && typeof params.url !== "string") {
          return { success: false, error: "url is required for navigate action" };
        }
        if (action === "click" && typeof params.selector !== "string") {
          return { success: false, error: "selector is required for click action" };
        }
        if (action === "type" && (typeof params.selector !== "string" || typeof params.text !== "string")) {
          return { success: false, error: "selector and text are required for type action" };
        }
        if (action === "evaluate" && typeof params.code !== "string") {
          return { success: false, error: "code is required for evaluate action" };
        }

        // Get or create browser instance (reused across calls)
        const page = await browserManager.getPage();

        switch (action) {
          case "navigate": {
            const url = typeof params.url === "string" ? params.url : undefined;
            if (!url) {
              return { success: false, error: "url is required for navigate action" };
            }
            await page.goto(url, {
              waitUntil: "domcontentloaded", // Faster than networkidle
              timeout: 30000, // 30 second timeout
            });
            return {
              success: true,
              result: {
                url: page.url(),
                title: await page.title(),
              },
            };
          }

          case "snapshot": {
            const format = (typeof params.format === "string" ? params.format : "ai") as "aria" | "ai";
            const snapshotSelector = typeof params.snapshotSelector === "string" ? params.snapshotSelector : null;
            const interactiveOnly = params.interactive === true;
            const maxChars = typeof params.maxChars === "number" ? params.maxChars : 200;

            if (format === "aria") {
              // ARIA snapshot - get accessible elements
              const snapshot = await page.evaluate(() => {
                const elements: Array<{
                  role: string;
                  name: string;
                  type?: string;
                  value?: string;
                  checked?: boolean;
                  selected?: boolean;
                }> = [];

                const walker = document.createTreeWalker(
                  document.body,
                  NodeFilter.SHOW_ELEMENT,
                  {
                    acceptNode: (node) => {
                      const el = node as Element;
                      const role = el.getAttribute("role") || el.tagName.toLowerCase();
                      const name = el.textContent?.trim() || el.getAttribute("aria-label") || "";
                      if (name || role !== "div") {
                        return NodeFilter.FILTER_ACCEPT;
                      }
                      return NodeFilter.FILTER_SKIP;
                    },
                  },
                );

                let node;
                while ((node = walker.nextNode())) {
                  const el = node as Element;
                  const role = el.getAttribute("role") || el.tagName.toLowerCase();
                  const name = el.textContent?.trim() || el.getAttribute("aria-label") || "";

                  if (name || ["button", "input", "a", "select"].includes(el.tagName.toLowerCase())) {
                    elements.push({
                      role,
                      name: name.substring(0, 200),
                      type: (el as HTMLInputElement).type,
                      value: (el as HTMLInputElement).value,
                      checked: (el as HTMLInputElement).checked,
                      selected: (el as HTMLSelectElement).selectedIndex !== -1,
                    });
                  }
                }

                return elements;
              });

              // Save ARIA snapshot to file if large (prevents context overflow)
              const snapshotJson = JSON.stringify(snapshot, null, 2);
              const snapshotSize = Buffer.byteLength(snapshotJson, "utf-8");
              const maxSizeInMemory = 10 * 1024; // 10KB threshold

              if (snapshotSize > maxSizeInMemory || snapshot.length > 50) {
                // Save to file
                const workspaceDir = getAgentWorkspaceDir(securityContext!.agentId);
                const snapshotsDir = join(workspaceDir, "snapshots");
                if (!existsSync(snapshotsDir)) {
                  mkdirSync(snapshotsDir, { recursive: true });
                }

                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const urlSlug = page.url().replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50);
                const filename = `snapshot-aria-${timestamp}-${urlSlug}.json`;
                const snapshotPath = join(snapshotsDir, filename);

                const pageTitle = await page.title();
                const viewport = page.viewportSize();
                const snapshotContent = `{
  "format": "aria",
  "url": "${page.url()}",
  "title": "${pageTitle}",
  "timestamp": "${new Date().toISOString()}",
  "viewport": ${viewport ? JSON.stringify(viewport) : "null"},
  "elementCount": ${snapshot.length},
  "fileSize": {
    "bytes": ${snapshotSize},
    "kb": ${(snapshotSize / 1024).toFixed(2)},
    "mb": ${(snapshotSize / (1024 * 1024)).toFixed(4)}
  },
  "elements": ${snapshotJson}
}`;

                writeFileSync(snapshotPath, snapshotContent, "utf-8");

                // Get actual file size after writing
                const stats = statSync(snapshotPath);
                const fileSizeBytes = stats.size;
                const fileSizeKB = (fileSizeBytes / 1024).toFixed(2);
                const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(4);

                return {
                  success: true,
                  result: {
                    format: "aria",
                    path: snapshotPath,
                    url: page.url(),
                    title: pageTitle,
                    elementCount: snapshot.length,
                    interactiveCount: snapshot.filter(e => ["button", "input", "select", "textarea", "a"].includes(e.role)).length,
                    fileSize: {
                      bytes: fileSizeBytes,
                      kb: parseFloat(fileSizeKB),
                      mb: parseFloat(fileSizeMB),
                    },
                    viewport: viewport,
                    preview: snapshot.slice(0, 10),
                    message: `ARIA snapshot saved to file (${snapshot.length} elements, ${fileSizeKB} KB). Use terminal/file tools to read: ${snapshotPath}`,
                  },
                };
              }

              // Return small snapshots directly
              const pageTitle = await page.title();
              const viewport = page.viewportSize();
              const smallSnapshotJson = JSON.stringify(snapshot, null, 2);
              const smallSnapshotSize = Buffer.byteLength(smallSnapshotJson, "utf-8");

              return {
                success: true,
                result: {
                  format: "aria",
                  elements: snapshot,
                  url: page.url(),
                  title: pageTitle,
                  elementCount: snapshot.length,
                  interactiveCount: snapshot.filter(e => ["button", "input", "select", "textarea", "a"].includes(e.role)).length,
                  size: {
                    bytes: smallSnapshotSize,
                    kb: parseFloat((smallSnapshotSize / 1024).toFixed(2)),
                  },
                  viewport: viewport,
                },
              };
            } else {
              // AI snapshot - extract meaningful content (like OpenClaw)
              // Pass function string directly to page.evaluate() with options embedded
              const optionsJson = JSON.stringify({
                selector: snapshotSelector,
                interactiveOnly,
                maxChars,
              });
              const snapshot = await page.evaluate(
                `(${extractSnapshotCode.trim()})(${optionsJson})`
              ) as SnapshotResult | SnapshotError;

              if ("error" in snapshot) {
                return {
                  success: false,
                  error: snapshot.error,
                };
              }

              // Save snapshot to file instead of returning full content (prevents context overflow)
              const workspaceDir = getAgentWorkspaceDir(securityContext!.agentId);
              const snapshotsDir = join(workspaceDir, "snapshots");
              if (!existsSync(snapshotsDir)) {
                mkdirSync(snapshotsDir, { recursive: true });
              }

              const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
              const urlSlug = page.url().replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50);
              const filename = `snapshot-${timestamp}-${urlSlug}.txt`;
              const snapshotPath = join(snapshotsDir, filename);

              // Save full snapshot content to file
              const pageTitle = await page.title();
              const viewport = page.viewportSize();
              const snapshotLines = snapshot.snapshot.split("\n");
              const snapshotCharCount = snapshot.snapshot.length;
              const elementsJson = JSON.stringify(snapshot.elements, null, 2);
              const elementsCharCount = elementsJson.length;
              const totalCharCount = snapshotCharCount + elementsCharCount;

              const snapshotContent = `# Browser Snapshot
URL: ${page.url()}
Title: ${pageTitle}
Timestamp: ${new Date().toISOString()}
Viewport: ${viewport ? `${viewport.width}x${viewport.height}` : "unknown"}

## Statistics
- Total Elements: ${snapshot.stats.total}
- Interactive Elements: ${snapshot.stats.interactive}
- Snapshot Lines: ${snapshotLines.length}
- Snapshot Characters: ${snapshotCharCount.toLocaleString()}
- Elements JSON Characters: ${elementsCharCount.toLocaleString()}
- Total Content Size: ${totalCharCount.toLocaleString()} characters

## Snapshot Content

${snapshot.snapshot}

## Elements Data (JSON)

${elementsJson}
`;

              writeFileSync(snapshotPath, snapshotContent, "utf-8");

              // Get actual file size after writing
              const stats = statSync(snapshotPath);
              const fileSizeBytes = stats.size;
              const fileSizeKB = (fileSizeBytes / 1024).toFixed(2);
              const fileSizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(4);

              // Return file path with summary stats (not full content)
              const previewLines = snapshotLines.slice(0, 10);
              const preview = previewLines.join("\n") + (snapshotLines.length > 10 ? `\n... (${snapshotLines.length - 10} more lines)` : "");

              return {
                success: true,
                result: {
                  format: "ai",
                  path: snapshotPath,
                  url: page.url(),
                  title: pageTitle,
                  stats: {
                    ...snapshot.stats,
                    lines: snapshotLines.length,
                    characters: totalCharCount,
                  },
                  fileSize: {
                    bytes: fileSizeBytes,
                    kb: parseFloat(fileSizeKB),
                    mb: parseFloat(fileSizeMB),
                  },
                  viewport: viewport,
                  preview: preview,
                  message: `Snapshot saved to file (${snapshot.stats.total} elements, ${snapshotLines.length} lines, ${fileSizeKB} KB). Use terminal/file tools to read/search: ${snapshotPath}`,
                },
              };
            }
          }

          case "screenshot": {
            const fullPage = params.fullPage === true;
            const screenshot = await page.screenshot({
              fullPage,
              type: "png",
            });

            // Determine save path
            let savePath: string;
            if (typeof params.savePath === "string" && params.savePath) {
              // Expand ~ in user-provided path
              savePath = params.savePath;
            } else {
              // Default: save to workspace/screenshots/
              const workspaceDir = getAgentWorkspaceDir(securityContext!.agentId);
              const screenshotsDir = getWorkspaceScreenshotsDir(workspaceDir);
              if (!existsSync(screenshotsDir)) {
                mkdirSync(screenshotsDir, { recursive: true });
              }
              const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
              const urlSlug = page.url().replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50);
              const filename = `screenshot-${timestamp}-${urlSlug}.png`;
              savePath = getWorkspaceScreenshotPath(workspaceDir, filename);
            }

            // Ensure directory exists
            const dir = dirname(savePath);
            if (!existsSync(dir)) {
              mkdirSync(dir, { recursive: true });
            }

            // Save screenshot to file
            writeFileSync(savePath, screenshot);

            return {
              success: true,
              result: {
                path: savePath,
                url: page.url(),
                fullPage,
              },
            };
          }

          case "click": {
            const selector = typeof params.selector === "string" ? params.selector : undefined;
            if (!selector) {
              return { success: false, error: "selector is required for click action" };
            }
            await page.click(selector);
            return {
              success: true,
              result: {
                action: "clicked",
                selector,
                url: page.url(),
              },
            };
          }

          case "type": {
            const selector = typeof params.selector === "string" ? params.selector : undefined;
            const text = typeof params.text === "string" ? params.text : undefined;
            if (!selector || !text) {
              return { success: false, error: "selector and text are required for type action" };
            }
            await page.fill(selector, text);
            return {
              success: true,
              result: {
                action: "typed",
                selector,
                text,
                url: page.url(),
              },
            };
          }

          case "evaluate": {
            const code = typeof params.code === "string" ? params.code : undefined;
            if (!code) {
              return { success: false, error: "code is required for evaluate action" };
            }
            const result = await page.evaluate(code);
            return {
              success: true,
              result: {
                value: result,
                url: page.url(),
              },
            };
          }

          default:
            return {
              success: false,
              error: `Unknown action: ${action}. Supported: navigate, snapshot, screenshot, click, type, evaluate, close`,
            };
        }
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    },
  };
}
