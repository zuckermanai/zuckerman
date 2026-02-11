import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { join, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  getAgentWorkspaceDir,
  getWorkspaceScreenshotsDir,
  getWorkspaceScreenshotPath,
} from "@server/world/homedir/paths.js";
import { BrowserManager } from "./browser-manager.js";
import { executeAction } from "./actions/index.js";
import { validateActionRequest } from "./utils.js";
import { takeSnapshot } from "./snapshot/snapshot.js";
import {
  getCookies,
  setCookie,
  clearCookies,
  getStorage,
  setStorage,
  clearStorage,
} from "./storage/index.js";
import {
  setOffline,
  setExtraHeaders,
  setHttpCredentials,
  setGeolocation,
  emulateMedia,
  setTimezone,
  setLocale,
  emulateDevice,
} from "./emulation/index.js";
import { setupDebugListeners, getConsoleMessages, getPageErrors, getNetworkRequests } from "./debug/index.js";
import {
  handleFileUpload,
  handleDialog,
  waitForDownload,
  downloadFile,
  getResponseBody,
  highlightElement,
} from "./files/index.js";
import type { ActionRequest, SnapshotOptions } from "./types.js";
import { statSync } from "node:fs";

const browserManager = new BrowserManager();

const browserToolInputSchema = z.object({
  action: z.string().describe("Action: navigate, snapshot, screenshot, tabs, act, cookies, storage, emulation, debug, files, status, start, stop, close"),
  url: z.string().optional().describe("URL to navigate to"),
  tabAction: z.string().optional().describe("Tab action: list, open, focus, close"),
  targetId: z.string().optional().describe("Tab target ID"),
  request: z.any().optional().describe("Action request object (for act action)"),
  format: z.enum(["ai", "aria"]).optional().describe("Snapshot format: ai or aria"),
  selector: z.string().optional().describe("CSS selector"),
  frame: z.string().optional().describe("Frame selector"),
  interactive: z.boolean().optional().describe("Interactive elements only"),
  compact: z.boolean().optional().describe("Compact format"),
  depth: z.number().optional().describe("Max DOM depth"),
  maxChars: z.number().optional().describe("Max characters per element"),
  limit: z.number().optional().describe("Limit nodes (ARIA)"),
  labels: z.boolean().optional().describe("Generate labels overlay"),
  refs: z.enum(["aria", "role"]).optional().describe("Refs mode: aria or role"),
  mode: z.string().optional().describe("Snapshot mode: efficient"),
  fullPage: z.boolean().optional().describe("Full page screenshot"),
  ref: z.string().optional().describe("Element ref for element screenshot"),
  savePath: z.string().optional().describe("Save path"),
  cookie: z.any().optional().describe("Cookie object"),
  storageKind: z.enum(["local", "session"]).optional().describe("Storage kind: local or session"),
  key: z.string().optional().describe("Storage key"),
  value: z.string().optional().describe("Storage value"),
  offline: z.boolean().optional().describe("Offline mode"),
  headers: z.record(z.string(), z.string()).optional().describe("HTTP headers"),
  credentials: z.any().optional().describe("HTTP credentials"),
  geolocation: z.any().optional().describe("Geolocation"),
  media: z.any().optional().describe("Media emulation"),
  timezoneId: z.string().optional().describe("Timezone ID"),
  locale: z.string().optional().describe("Locale"),
  device: z.string().optional().describe("Device name"),
  debugType: z.string().optional().describe("Debug type: console, errors, requests"),
  level: z.string().optional().describe("Console message level"),
  filter: z.string().optional().describe("Network request filter"),
  clear: z.boolean().optional().describe("Clear after get"),
  fileAction: z.string().optional().describe("File action: upload, dialog, download, wait-download, response-body, highlight"),
  paths: z.array(z.string()).optional().describe("File paths for upload"),
  accept: z.boolean().optional().describe("Accept dialog"),
  promptText: z.string().optional().describe("Prompt text"),
  timeoutMs: z.number().optional().describe("Timeout in milliseconds"),
});

type BrowserToolInput = z.infer<typeof browserToolInputSchema>;

export const browserTool = tool<BrowserToolInput, string>({
  description: `Control Chrome/Chromium browser. Navigate, take snapshots, interact with pages, manage tabs, cookies, storage, and more.

Actions:
- navigate: Navigate to URL
- snapshot: Take page snapshot (ai/aria format)
- screenshot: Take screenshot
- tabs: List/open/focus/close tabs
- act: Perform actions (click, type, press, hover, scroll, drag, select, fill, resize, wait, evaluate)
- cookies: Get/set/clear cookies
- storage: Get/set/clear localStorage/sessionStorage
- emulation: Set offline, headers, credentials, geolocation, media, timezone, locale, device
- debug: Get console messages, errors, network requests
- files: Handle uploads, dialogs, downloads
- status: Get browser status
- start/stop: Control browser lifecycle

Snapshots use ref-based element identification (e.g., "e12") for stable element references.`,
  inputSchema: zodSchema(browserToolInputSchema),
  execute: async (params) => {
    try {
      const { action } = params;
      const agentId = "default";

      // Handle browser lifecycle actions first
      if (action === "close") {
        await browserManager.close();
        return JSON.stringify({ success: true, result: { message: "Browser closed successfully" } });
      }

      if (action === "stop") {
        await browserManager.close();
        return JSON.stringify({ success: true, result: { message: "Browser stopped successfully" } });
      }

      if (action === "start" || action === "status") {
        const status = await browserManager.getStatus();
        return JSON.stringify({ success: true, result: status });
      }

      // Get page for other actions
      const page = await browserManager.getPage(params.targetId);

      // Setup debug listeners (idempotent - only sets up once per page)
      setupDebugListeners(page);

      switch (action) {
        case "navigate": {
          if (!params.url) {
            return JSON.stringify({ success: false, error: "url is required for navigate action" });
          }
          await page.goto(params.url, { waitUntil: "domcontentloaded", timeout: 30000 });
          const tab = await browserManager.getTab(params.targetId);
          return JSON.stringify({
            success: true,
            result: { url: page.url(), title: await page.title().catch(() => "") },
          });
        }

        case "snapshot": {
          const format = params.format || "ai";
          const options = {
            format,
            selector: params.selector,
            frame: params.frame,
            interactive: params.interactive,
            compact: params.compact,
            depth: params.depth,
            maxChars: params.maxChars || 200,
            limit: params.limit,
            labels: params.labels,
            refs: params.refs,
            mode: params.mode,
            interactiveOnly: params.interactive === true,
          };

          const { path, result, preview } = await takeSnapshot(page, options, agentId);
          const stats = statSync(path);

          return JSON.stringify({
            success: true,
            result: {
              format: options.format,
              path,
              url: page.url(),
              title: await page.title().catch(() => ""),
              stats: result.stats,
              refs: result.refs,
              fileSize: { bytes: stats.size, kb: (stats.size / 1024).toFixed(2) },
              preview,
              message: `Snapshot saved to: ${path}`,
            },
          });
        }

        case "screenshot": {
          const fullPage = params.fullPage === true;

          let buffer: Buffer;
          if (params.ref) {
            const { resolveElement } = await import("./utils.js");
            const { locator } = await resolveElement(page, params.ref);
            buffer = await locator.screenshot({ type: "png" });
          } else {
            buffer = await page.screenshot({ fullPage, type: "png" });
          }

          const workspaceDir = getAgentWorkspaceDir(agentId);
          const screenshotsDir = getWorkspaceScreenshotsDir(workspaceDir);
          if (!existsSync(screenshotsDir)) {
            mkdirSync(screenshotsDir, { recursive: true });
          }

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const urlSlug = page.url().replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50);
          const filename = `screenshot-${timestamp}-${urlSlug}.png`;
          const finalPath = params.savePath || getWorkspaceScreenshotPath(workspaceDir, filename);

          const dir = dirname(finalPath);
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }

          writeFileSync(finalPath, buffer);

          return JSON.stringify({
            success: true,
            result: { path: finalPath, url: page.url(), fullPage },
          });
        }

        case "tabs": {
          const tabAction = params.tabAction as string | undefined;
          const targetId = params.targetId as string | undefined;
          const url = params.url as string | undefined;

          if (!params.tabAction || params.tabAction === "list") {
            const tabs = await browserManager.listTabs();
            return JSON.stringify({
              success: true,
              result: {
                tabs: tabs.map((t) => ({
                  targetId: t.targetId,
                  url: t.url,
                  title: t.title,
                })),
              },
            });
          }

          if (params.tabAction === "open") {
            if (!params.url) {
              return JSON.stringify({ success: false, error: "url is required to open tab" });
            }
            const tab = await browserManager.createTab(params.url);
            return JSON.stringify({
              success: true,
              result: {
                targetId: tab.targetId,
                url: tab.url,
                title: tab.title,
              },
            });
          }

          if (params.tabAction === "focus") {
            if (!params.targetId) {
              return JSON.stringify({ success: false, error: "targetId is required to focus tab" });
            }
            await browserManager.focusTab(params.targetId);
            return JSON.stringify({ success: true, result: { targetId: params.targetId } });
          }

          if (params.tabAction === "close") {
            if (!params.targetId) {
              return JSON.stringify({ success: false, error: "targetId is required to close tab" });
            }
            await browserManager.closeTab(params.targetId);
            return JSON.stringify({ success: true, result: { targetId: params.targetId } });
          }

          return JSON.stringify({ success: false, error: `Unknown tab action: ${params.tabAction}` });
        }

        case "act": {
          if (!params.request || !(params.request as any).kind) {
            const suggestions: string[] = [];
            if (params.url) {
              suggestions.push("Use action='navigate' with url parameter to navigate to a page");
            }
            if (params.interactive !== undefined) {
              suggestions.push("Use action='snapshot' with interactive parameter to take a page snapshot");
            }
            const suggestionText = suggestions.length > 0 
              ? `\n\nDid you mean to:\n${suggestions.map(s => `- ${s}`).join("\n")}`
              : "";
            return JSON.stringify({ 
              success: false, 
              error: `request object with kind is required for act action. The request must be an object with a 'kind' property (e.g., 'click', 'type', 'press', 'hover', 'scrollIntoView', 'drag', 'select', 'fill', 'resize', 'wait', 'evaluate').${suggestionText}\n\nExample: { action: "act", request: { kind: "click", ref: "e12" } }` 
            });
          }

          const request = params.request as ActionRequest;
          const error = validateActionRequest(request);
          if (error) {
            return JSON.stringify({ success: false, error });
          }

          const actionResult = await executeAction(page, request);
          const tab = await browserManager.getTab(params.targetId);

          return JSON.stringify({
            success: true,
            result: {
              ...(typeof actionResult === "object" && actionResult !== null ? actionResult : { value: actionResult }),
              targetId: tab.targetId,
              url: tab.url,
            },
          });
        }

        case "cookies": {
          if (params.cookie) {
            if ((params.cookie as any).clear) {
              await clearCookies(page);
            } else {
              await setCookie(page, params.cookie as any);
            }
            return JSON.stringify({ success: true, result: { ok: true } });
          }
          const cookies = await getCookies(page);
          return JSON.stringify({ success: true, result: { cookies } });
        }

        case "storage": {
          const kind = params.storageKind || "local";

          if (params.value !== undefined) {
            if (!params.key) {
              return JSON.stringify({ success: false, error: "key is required to set storage" });
            }
            await setStorage(page, kind, params.key, params.value);
            return JSON.stringify({ success: true, result: { ok: true } });
          }

          if (params.key === "clear") {
            await clearStorage(page, kind);
            return JSON.stringify({ success: true, result: { ok: true } });
          }

          const storage = await getStorage(page, kind, params.key);
          return JSON.stringify({ success: true, result: { [kind]: storage } });
        }

        case "emulation": {
          if (params.offline !== undefined) {
            await setOffline(page, params.offline);
          }
          if (params.headers) {
            await setExtraHeaders(page, params.headers as Record<string, string>);
          }
          if (params.credentials) {
            await setHttpCredentials(page, params.credentials as any);
          }
          if (params.geolocation) {
            await setGeolocation(page, params.geolocation as any);
          }
          if (params.media) {
            await emulateMedia(page, params.media as any);
          }
          if (params.timezoneId) {
            await setTimezone(page, params.timezoneId);
          }
          if (params.locale) {
            await setLocale(page, params.locale);
          }
          if (params.device) {
            await emulateDevice(page, params.device);
          }
          return JSON.stringify({ success: true, result: { ok: true } });
        }

        case "debug": {
          const debugType = params.debugType;
          const level = params.level;
          const filter = params.filter;
          const clear = params.clear === true;

          if (debugType === "console" || !debugType) {
            const messages = getConsoleMessages(level);
            return JSON.stringify({ success: true, result: { messages } });
          }

          if (debugType === "errors") {
            const errors = getPageErrors(clear);
            return JSON.stringify({ success: true, result: { errors } });
          }

          if (debugType === "requests") {
            const requests = getNetworkRequests(filter, clear);
            return JSON.stringify({ success: true, result: { requests } });
          }

          return JSON.stringify({ success: false, error: `Unknown debug type: ${debugType}. Use: console, errors, requests` });
        }

        case "files": {
          const fileAction = params.fileAction;

          if (fileAction === "upload" || params.paths) {
            if (!params.paths || params.paths.length === 0) {
              return JSON.stringify({ success: false, error: "paths array required for upload" });
            }
            await handleFileUpload(
              page,
              params.paths,
              params.ref,
              params.selector,
              params.timeoutMs,
            );
            return JSON.stringify({ success: true, result: { ok: true } });
          }

          if (fileAction === "dialog" || params.accept !== undefined) {
            await handleDialog(
              page,
              params.accept ?? false,
              params.promptText,
              params.timeoutMs,
            );
            return JSON.stringify({ success: true, result: { ok: true } });
          }

          if (fileAction === "download") {
            if (!params.ref && !params.selector) {
              return JSON.stringify({ success: false, error: "ref or selector required for download" });
            }
            if (!params.savePath) {
              return JSON.stringify({ success: false, error: "savePath required for download" });
            }
            const result = await downloadFile(
              page,
              params.ref as string | number,
              params.selector!,
              params.savePath,
              params.timeoutMs,
            );
            return JSON.stringify({ success: true, result });
          }

          if (fileAction === "wait-download") {
            const result = await waitForDownload(
              page,
              params.savePath,
              params.timeoutMs,
            );
            return JSON.stringify({ success: true, result });
          }

          if (fileAction === "response-body") {
            if (!params.url) {
              return JSON.stringify({ success: false, error: "url required for response-body" });
            }
            const result = await getResponseBody(
              page,
              params.url,
              params.timeoutMs,
            );
            return JSON.stringify({ success: true, result });
          }

          if (fileAction === "highlight") {
            if (!params.ref && !params.selector) {
              return JSON.stringify({ success: false, error: "ref or selector required for highlight" });
            }
            await highlightElement(
              page,
              params.ref as string | number,
              params.selector,
            );
            return JSON.stringify({ success: true, result: { ok: true } });
          }

          return JSON.stringify({ success: false, error: `Unknown file action: ${fileAction}. Use: upload, dialog, download, wait-download, response-body, highlight` });
        }

        default:
          return JSON.stringify({
            success: false,
            error: `Unknown action: ${action}. Supported: navigate, snapshot, screenshot, tabs, act, cookies, storage, emulation, debug, files, status, start, stop, close`,
          });
      }
    } catch (err) {
      return JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  },
});
