import { tool, zodSchema } from "@ai-sdk/provider-utils";
import { z } from "zod";
import type { MousePlatform } from "./platform.js";
import { macPlatform } from "./mac.js";
import { windowsPlatform } from "./windows.js";

/**
 * Get platform-specific mouse implementation
 */
function getPlatform(): MousePlatform {
  if (process.platform === "darwin") {
    return macPlatform;
  } else if (process.platform === "win32") {
    return windowsPlatform;
  } else {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

const mouseToolInputSchema = z.object({
  action: z.enum(["move", "click", "scroll", "getPosition", "drag"]).describe("Action to perform: move, click, scroll, getPosition, or drag"),
  x: z.number().optional().describe("X coordinate for move/click actions (absolute screen position)"),
  y: z.number().optional().describe("Y coordinate for move/click actions (absolute screen position)"),
  relativeX: z.number().optional().describe("Relative X movement (positive = right, negative = left)"),
  relativeY: z.number().optional().describe("Relative Y movement (positive = down, negative = up)"),
  button: z.enum(["left", "right", "middle"]).optional().describe("Mouse button: left, right, middle (for click/drag actions). Default: left"),
  clicks: z.number().optional().describe("Number of clicks (1 = single, 2 = double). Default: 1"),
  scrollX: z.number().optional().describe("Horizontal scroll amount (positive = right, negative = left)"),
  scrollY: z.number().optional().describe("Vertical scroll amount (positive = down, negative = up)"),
  duration: z.number().optional().describe("Duration in seconds for drag action (for smooth dragging)"),
});

type MouseToolInput = z.infer<typeof mouseToolInputSchema>;

export const mouseTool = tool<MouseToolInput, string>({
  description: "Control the computer mouse - move cursor, click buttons, scroll, and get current position. Works on macOS and Windows using Python. Can move mouse to absolute coordinates or relative positions, perform clicks (left, right, middle), scroll vertically/horizontally, and detect current mouse position including human movements. Automatically installs required Python packages (pyobjc on macOS) if missing.",
  inputSchema: zodSchema(mouseToolInputSchema),
  execute: async (params) => {
    try {
      const { action } = params;

      // Check platform - support macOS and Windows
      if (process.platform !== "darwin" && process.platform !== "win32") {
        return JSON.stringify({
          success: false,
          error: `Mouse tool is currently only supported on macOS and Windows. Detected platform: ${process.platform}`,
        });
      }

      // Get platform-specific implementation
      const platform = getPlatform();

      switch (action) {
        case "move": {
          const x = typeof params.x === "number" ? params.x : undefined;
          const y = typeof params.y === "number" ? params.y : undefined;
          const relativeX = typeof params.relativeX === "number" ? params.relativeX : undefined;
          const relativeY = typeof params.relativeY === "number" ? params.relativeY : undefined;

          if (params.x !== undefined && params.y !== undefined) {
            // Absolute position
            await platform.moveTo(params.x, params.y);
            return JSON.stringify({
              success: true,
              result: {
                action: "moved",
                x: params.x,
                y: params.y,
                type: "absolute",
              },
            });
          } else if (params.relativeX !== undefined || params.relativeY !== undefined) {
            // Relative movement
            const deltaX = params.relativeX || 0;
            const deltaY = params.relativeY || 0;
            
            // Get current position first
            const currentPos = await platform.getPosition();
            const currentX = currentPos.x;
            const currentY = currentPos.y;
            
            // Move to new position
            const newX = currentX + deltaX;
            const newY = currentY + deltaY;
            await platform.moveTo(newX, newY);
            
            return JSON.stringify({
              success: true,
              result: {
                action: "moved",
                from: { x: currentX, y: currentY },
                to: { x: newX, y: newY },
                delta: { x: deltaX, y: deltaY },
                type: "relative",
              },
            });
          } else {
            return JSON.stringify({
              success: false,
              error: "Either (x, y) for absolute position or (relativeX, relativeY) for relative movement must be provided",
            });
          }
        }

        case "click": {
          const button = params.button || "left";
          const clicks = params.clicks || 1;

          let clickX: number;
          let clickY: number;

          if (params.x !== undefined && params.y !== undefined) {
            clickX = params.x;
            clickY = params.y;
          } else {
            // Get current position
            const currentPos = await platform.getPosition();
            clickX = currentPos.x;
            clickY = currentPos.y;
          }

          await platform.click(clickX, clickY, button, clicks);
          
          return JSON.stringify({
            success: true,
            result: {
              action: "clicked",
              x: clickX,
              y: clickY,
              button,
              clicks,
            },
          });
        }

        case "scroll": {
          const scrollX = params.scrollX || 0;
          const scrollY = params.scrollY || 0;

          if (scrollX === 0 && scrollY === 0) {
            return JSON.stringify({
              success: false,
              error: "At least one of scrollX or scrollY must be provided",
            });
          }

          // Get current mouse position
          const currentPos = await platform.getPosition();
          
          // Perform scroll
          await platform.scroll(scrollX, scrollY);

          return JSON.stringify({
            success: true,
            result: {
              action: "scrolled",
              scrollX,
              scrollY,
              position: { x: currentPos.x, y: currentPos.y },
            },
          });
        }

        case "getPosition": {
          const position = await platform.getPosition();
          
          return JSON.stringify({
            success: true,
            result: {
              action: "getPosition",
              x: position.x,
              y: position.y,
              position: { x: position.x, y: position.y },
            },
          });
        }

        case "drag": {
          if (params.x === undefined || params.y === undefined) {
            return JSON.stringify({
              success: false,
              error: "x and y (start position) are required for drag action",
            });
          }

          if (params.relativeX === undefined && params.relativeY === undefined) {
            return JSON.stringify({
              success: false,
              error: "relativeX and/or relativeY (drag distance) are required for drag action",
            });
          }

          const startX = params.x;
          const startY = params.y;
          const relativeX = params.relativeX || 0;
          const relativeY = params.relativeY || 0;
          const button = params.button || "left";
          const duration = params.duration || 0.1;

          const endX = startX + relativeX;
          const endY = startY + relativeY;

          await platform.drag(startX, startY, endX, endY, button, duration);

          return JSON.stringify({
            success: true,
            result: {
              action: "dragged",
              from: { x: startX, y: startY },
              to: { x: endX, y: endY },
              button,
              duration,
            },
          });
        }

        default:
          return JSON.stringify({
            success: false,
            error: `Unknown action: ${action}`,
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
