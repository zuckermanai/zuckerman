import { chromium, type Browser, type Page } from "playwright-core";
import type { SecurityContext } from "@world/execution/security/types.js";
import { isToolAllowed } from "@world/execution/security/policy/tool-policy.js";
import type { Tool, ToolDefinition, ToolResult } from "../terminal/index.js";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const BROWSER_DATA_DIR = join(homedir(), ".zuckerman", "browser");

export function createBrowserTool(): Tool {
  return {
    definition: {
      name: "browser",
      description: "Control Chrome/Chromium browser via CDP. Navigate, take snapshots, interact with pages. Use 'navigate_and_screenshot' action to navigate and screenshot in one call (faster). Browser closes after each action.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action to perform: navigate, snapshot, screenshot, navigate_and_screenshot, click, type, evaluate",
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
            description: "File path to save screenshot (for screenshot action). If not provided, saves to land/screenshots/",
          },
          format: {
            type: "string",
            description: "Snapshot format: aria or ai (for snapshot action)",
          },
        },
        required: ["action"],
      },
    },
    handler: async (params, securityContext) => {
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
        const validActions = ["navigate", "snapshot", "navigate_and_screenshot", "screenshot", "click", "type", "evaluate"];
        if (!validActions.includes(action)) {
          return {
            success: false,
            error: `Unknown action: ${action}. Valid actions are: ${validActions.join(", ")}`,
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

        // Ensure browser data directory exists
        if (!existsSync(BROWSER_DATA_DIR)) {
          mkdirSync(BROWSER_DATA_DIR, { recursive: true });
        }

        // Launch browser with timeout (visible, not headless)
        const browser = await chromium.launch({
          headless: false, // Show browser window
          channel: "chrome", // Try Chrome first, falls back to chromium
          timeout: 30000, // 30 second timeout for launch
          args: [
            "--start-maximized", // Start maximized so it's visible
            "--disable-blink-features=AutomationControlled", // Don't show automation banner
          ],
        });

        try {
          const context = await browser.newContext({
            viewport: null, // Use full screen
          });
          const page = await context.newPage();
          
          // Bring browser to front (macOS)
          if (process.platform === "darwin") {
            try {
              const execAsync = promisify(exec);
              // Get the browser process and bring it to front
              await execAsync(`osascript -e 'tell application "System Events" to set frontmost of every process whose name contains "Chrome" to true'`);
            } catch {
              // Ignore if it fails
            }
          }

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
              const format = (typeof params.format === "string" ? params.format : "aria") as "aria" | "ai";
              
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

                return {
                  success: true,
                  result: {
                    format: "aria",
                    elements: snapshot,
                    url: page.url(),
                    title: await page.title(),
                  },
                };
              } else {
                // AI snapshot - simplified DOM structure
                const html = await page.content();
                return {
                  success: true,
                  result: {
                    format: "ai",
                    html: html.substring(0, 50000), // Limit size
                    url: page.url(),
                    title: await page.title(),
                  },
                };
              }
            }

            case "navigate_and_screenshot": {
              // Combined action: navigate then screenshot (faster, browser stays open)
              const url = typeof params.url === "string" ? params.url : undefined;
              if (!url) {
                return { success: false, error: "url is required for navigate_and_screenshot action" };
              }
              
              // Navigate first
              await page.goto(url, { 
                waitUntil: "domcontentloaded", // Faster than networkidle
                timeout: 30000,
              });
              
              // Wait a bit for page to render and ensure it's visible
              await page.waitForTimeout(2000);
              
              // Bring page to front
              await page.bringToFront();
              
              // Take screenshot
              const fullPage = params.fullPage === true;
              const screenshot = await page.screenshot({
                fullPage,
                type: "png",
              });
              
              // Determine save path
              let savePath: string;
              if (typeof params.savePath === "string" && params.savePath) {
                savePath = params.savePath.startsWith("~") 
                  ? params.savePath.replace("~", homedir())
                  : params.savePath;
              } else {
                const landDir = join(homedir(), ".zuckerman", "land");
                const screenshotsDir = join(landDir, "screenshots");
                if (!existsSync(screenshotsDir)) {
                  mkdirSync(screenshotsDir, { recursive: true });
                }
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const urlSlug = url.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50);
                savePath = join(screenshotsDir, `screenshot-${timestamp}-${urlSlug}.png`);
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
                  navigated: true,
                },
              };
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
                savePath = params.savePath.startsWith("~") 
                  ? params.savePath.replace("~", homedir())
                  : params.savePath;
              } else {
                // Default: save to land/screenshots/
                const landDir = join(homedir(), ".zuckerman", "land");
                const screenshotsDir = join(landDir, "screenshots");
                if (!existsSync(screenshotsDir)) {
                  mkdirSync(screenshotsDir, { recursive: true });
                }
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const urlSlug = page.url().replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50);
                savePath = join(screenshotsDir, `screenshot-${timestamp}-${urlSlug}.png`);
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
                error: `Unknown action: ${action}. Supported: navigate, snapshot, screenshot, navigate_and_screenshot, click, type, evaluate`,
              };
          }
        } finally {
          // Keep browser open for a few seconds so user can see it (when not headless)
          // Wait 5 seconds before closing
          await new Promise((resolve) => setTimeout(resolve, 5000));
          await browser.close();
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
