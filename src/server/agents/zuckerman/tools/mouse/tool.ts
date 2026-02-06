import type { SecurityContext } from "@server/world/execution/security/types.js";
import { isToolAllowed } from "@server/world/execution/security/policy/tool-policy.js";
import type { Tool, ToolResult, ToolExecutionContext } from "../terminal/index.js";
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

/**
 * Mouse control tool for macOS and Windows
 * Allows the agent to control mouse movements, clicks, and detect position
 */
export function createMouseTool(): Tool {
  return {
    definition: {
      name: "mouse",
      description: "Control the computer mouse - move cursor, click buttons, scroll, and get current position. Works on macOS and Windows using Python. Can move mouse to absolute coordinates or relative positions, perform clicks (left, right, middle), scroll vertically/horizontally, and detect current mouse position including human movements. Automatically installs required Python packages (pyobjc on macOS) if missing.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action to perform: move, click, scroll, getPosition, or drag",
          },
          x: {
            type: "number",
            description: "X coordinate for move/click actions (absolute screen position)",
          },
          y: {
            type: "number",
            description: "Y coordinate for move/click actions (absolute screen position)",
          },
          relativeX: {
            type: "number",
            description: "Relative X movement (positive = right, negative = left)",
          },
          relativeY: {
            type: "number",
            description: "Relative Y movement (positive = down, negative = up)",
          },
          button: {
            type: "string",
            description: "Mouse button: left, right, middle (for click/drag actions). Default: left",
            enum: ["left", "right", "middle"],
          },
          clicks: {
            type: "number",
            description: "Number of clicks (1 = single, 2 = double). Default: 1",
          },
          scrollX: {
            type: "number",
            description: "Horizontal scroll amount (positive = right, negative = left)",
          },
          scrollY: {
            type: "number",
            description: "Vertical scroll amount (positive = down, negative = up)",
          },
          duration: {
            type: "number",
            description: "Duration in seconds for drag action (for smooth dragging)",
          },
        },
        required: ["action"],
      },
    },
    handler: async (params, securityContext, executionContext) => {
      try {
        const { action } = params;

        if (typeof action !== "string") {
          return {
            success: false,
            error: "action must be a string",
          };
        }

        // Check platform - support macOS and Windows
        if (process.platform !== "darwin" && process.platform !== "win32") {
          return {
            success: false,
            error: `Mouse tool is currently only supported on macOS and Windows. Detected platform: ${process.platform}`,
          };
        }

        // Check tool security
        if (securityContext) {
          const toolAllowed = isToolAllowed("mouse", securityContext.toolPolicy);
          if (!toolAllowed) {
            return {
              success: false,
              error: "Mouse tool is not allowed by security policy",
            };
          }
        }

        // Validate action
        const validActions = ["move", "click", "scroll", "getPosition", "drag"];
        if (!validActions.includes(action)) {
          return {
            success: false,
            error: `Unknown action: ${action}. Valid actions are: ${validActions.join(", ")}`,
          };
        }

        // Get platform-specific implementation
        const platform = getPlatform();

        switch (action) {
          case "move": {
            const x = typeof params.x === "number" ? params.x : undefined;
            const y = typeof params.y === "number" ? params.y : undefined;
            const relativeX = typeof params.relativeX === "number" ? params.relativeX : undefined;
            const relativeY = typeof params.relativeY === "number" ? params.relativeY : undefined;

            if (x !== undefined && y !== undefined) {
              // Absolute position
              await platform.moveTo(x, y);
              return {
                success: true,
                result: {
                  action: "moved",
                  x,
                  y,
                  type: "absolute",
                },
              };
            } else if (relativeX !== undefined || relativeY !== undefined) {
              // Relative movement
              const deltaX = relativeX || 0;
              const deltaY = relativeY || 0;
              
              // Get current position first
              const currentPos = await platform.getPosition();
              const currentX = currentPos.x;
              const currentY = currentPos.y;
              
              // Move to new position
              const newX = currentX + deltaX;
              const newY = currentY + deltaY;
              await platform.moveTo(newX, newY);
              
              return {
                success: true,
                result: {
                  action: "moved",
                  from: { x: currentX, y: currentY },
                  to: { x: newX, y: newY },
                  delta: { x: deltaX, y: deltaY },
                  type: "relative",
                },
              };
            } else {
              return {
                success: false,
                error: "Either (x, y) for absolute position or (relativeX, relativeY) for relative movement must be provided",
              };
            }
          }

          case "click": {
            const x = typeof params.x === "number" ? params.x : undefined;
            const y = typeof params.y === "number" ? params.y : undefined;
            const button = (typeof params.button === "string" ? params.button : "left") as "left" | "right" | "middle";
            const clicks = typeof params.clicks === "number" ? params.clicks : 1;

            let clickX: number;
            let clickY: number;

            if (x !== undefined && y !== undefined) {
              clickX = x;
              clickY = y;
            } else {
              // Get current position
              const currentPos = await platform.getPosition();
              clickX = currentPos.x;
              clickY = currentPos.y;
            }

            await platform.click(clickX, clickY, button, clicks);
            
            return {
              success: true,
              result: {
                action: "clicked",
                x: clickX,
                y: clickY,
                button,
                clicks,
              },
            };
          }

          case "scroll": {
            const scrollX = typeof params.scrollX === "number" ? params.scrollX : 0;
            const scrollY = typeof params.scrollY === "number" ? params.scrollY : 0;

            if (scrollX === 0 && scrollY === 0) {
              return {
                success: false,
                error: "At least one of scrollX or scrollY must be provided",
              };
            }

            // Get current mouse position
            const currentPos = await platform.getPosition();
            
            // Perform scroll
            await platform.scroll(scrollX, scrollY);

            return {
              success: true,
              result: {
                action: "scrolled",
                scrollX,
                scrollY,
                position: { x: currentPos.x, y: currentPos.y },
              },
            };
          }

          case "getPosition": {
            const position = await platform.getPosition();
            
            return {
              success: true,
              result: {
                action: "getPosition",
                x: position.x,
                y: position.y,
                position: { x: position.x, y: position.y },
              },
            };
          }

          case "drag": {
            const startX = typeof params.x === "number" ? params.x : undefined;
            const startY = typeof params.y === "number" ? params.y : undefined;
            const relativeX = typeof params.relativeX === "number" ? params.relativeX : undefined;
            const relativeY = typeof params.relativeY === "number" ? params.relativeY : undefined;
            const button = (typeof params.button === "string" ? params.button : "left") as "left" | "right" | "middle";
            const duration = typeof params.duration === "number" ? params.duration : 0.1;

            if (!startX || !startY) {
              return {
                success: false,
                error: "x and y (start position) are required for drag action",
              };
            }

            if (relativeX === undefined && relativeY === undefined) {
              return {
                success: false,
                error: "relativeX and/or relativeY (drag distance) are required for drag action",
              };
            }

            const endX = startX + (relativeX || 0);
            const endY = startY + (relativeY || 0);

            await platform.drag(startX, startY, endX, endY, button, duration);

            return {
              success: true,
              result: {
                action: "dragged",
                from: { x: startX, y: startY },
                to: { x: endX, y: endY },
                button,
                duration,
              },
            };
          }

          default:
            return {
              success: false,
              error: `Unknown action: ${action}`,
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
