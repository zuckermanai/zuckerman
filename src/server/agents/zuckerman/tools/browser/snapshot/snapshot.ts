import type { Page } from "playwright-core";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { getAgentWorkspaceDir } from "@server/world/homedir/paths.js";
import type { SnapshotOptions } from "./extractor.js";
import { extractSnapshotCode, type SnapshotResult, type SnapshotError } from "./extractor.js";

export async function takeSnapshot(
  page: Page,
  options: {
    format: "ai" | "aria";
    selector?: string;
    frame?: string;
    interactive?: boolean;
    interactiveOnly: boolean;
    compact?: boolean;
    maxChars: number;
    depth?: number;
  },
  agentId: string,
): Promise<{ path: string; result: SnapshotResult; preview: string }> {
  const { format, selector, frame, interactiveOnly, compact, maxChars, depth } = options;

  if (format === "aria") {
    return await takeAriaSnapshot(page, { selector, interactiveOnly, maxChars }, agentId);
  }

  // AI snapshot
  const optionsJson = JSON.stringify({
    selector: selector || null,
    frame: frame || null,
    interactiveOnly: interactiveOnly || false,
    compact: compact || false,
    maxChars: maxChars || 200,
    depth: depth || undefined,
  });

  const snapshot = (await page.evaluate(
    `(${extractSnapshotCode.trim()})(${optionsJson})`,
  )) as SnapshotResult | SnapshotError;

  if ("error" in snapshot) {
    throw new Error(snapshot.error);
  }

  // Save snapshot to file
  const workspaceDir = getAgentWorkspaceDir(agentId);
  const snapshotsDir = join(workspaceDir, "snapshots");
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const urlSlug = page.url().replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50);
  const filename = `snapshot-${timestamp}-${urlSlug}.txt`;
  const snapshotPath = join(snapshotsDir, filename);

  const pageTitle = await page.title().catch(() => "");
  const viewport = page.viewportSize();
  const snapshotLines = snapshot.snapshot.split("\n");
  const snapshotCharCount = snapshot.snapshot.length;
  const elementsJson = JSON.stringify(snapshot.elements, null, 2);
  const refsJson = JSON.stringify(snapshot.refs, null, 2);
  const totalCharCount = snapshotCharCount + elementsJson.length + refsJson.length;

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
- Elements JSON Characters: ${elementsJson.length.toLocaleString()}
- Refs JSON Characters: ${refsJson.length.toLocaleString()}
- Total Content Size: ${totalCharCount.toLocaleString()} characters

## Snapshot Content

${snapshot.snapshot}

## Elements Data (JSON)

${elementsJson}

## Refs Map (JSON)

${refsJson}
`;

  writeFileSync(snapshotPath, snapshotContent, "utf-8");

  const stats = statSync(snapshotPath);
  const fileSizeKB = (stats.size / 1024).toFixed(2);
  const previewLines = snapshotLines.slice(0, 10);
  const preview =
    previewLines.join("\n") + (snapshotLines.length > 10 ? `\n... (${snapshotLines.length - 10} more lines)` : "");

  return {
    path: snapshotPath,
    result: snapshot,
    preview,
  };
}

async function takeAriaSnapshot(
  page: Page,
  options: { selector?: string | null; interactiveOnly: boolean; maxChars: number },
  agentId: string,
): Promise<{ path: string; result: SnapshotResult; preview: string }> {
  const { selector, interactiveOnly, maxChars } = options;

  const snapshot = await page.evaluate(({ selector }) => {
    const elements: Array<{
      role: string;
      name: string;
      type?: string;
      value?: string;
      checked?: boolean;
      selected?: boolean;
    }> = [];

    const root = selector ? document.querySelector(selector) : document.body;
    if (!root) {
      return { error: `Selector "${selector}" not found` };
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const el = node as Element;
        const role = el.getAttribute("role") || el.tagName.toLowerCase();
        const name = el.textContent?.trim() || el.getAttribute("aria-label") || "";
        if (name || role !== "div") {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });

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
  }, { selector: selector ?? null });

  if ("error" in snapshot) {
    throw new Error(snapshot.error);
  }

  // Convert to SnapshotResult format
  const result: SnapshotResult = {
    snapshot: snapshot.map((el, idx) => `[${idx}] ${el.role}: ${el.name}`).join("\n"),
    elements: snapshot.map((el, idx) => ({
      ref: idx,
      role: el.role,
      tag: el.role,
      text: el.name,
      type: el.type,
      value: el.value,
      checked: el.checked,
      selected: el.selected,
      visible: true,
    })),
    refs: {},
    stats: {
      total: snapshot.length,
      interactive: snapshot.filter((e) =>
        ["button", "input", "select", "textarea", "a"].includes(e.role),
      ).length,
    },
  };

  // Save to file
  const workspaceDir = getAgentWorkspaceDir(agentId);
  const snapshotsDir = join(workspaceDir, "snapshots");
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const urlSlug = page.url().replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50);
  const filename = `snapshot-aria-${timestamp}-${urlSlug}.json`;
  const snapshotPath = join(snapshotsDir, filename);

  const snapshotJson = JSON.stringify(result, null, 2);
  writeFileSync(snapshotPath, snapshotJson, "utf-8");

  const stats = statSync(snapshotPath);
  const preview = snapshot.slice(0, 10);

  return {
    path: snapshotPath,
    result,
    preview: JSON.stringify(preview, null, 2),
  };
}
