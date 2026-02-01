import type { SecurityContext } from "@world/execution/security/types.js";
import { isToolAllowed } from "@world/execution/security/policy/tool-policy.js";
import type { Tool, ToolDefinition, ToolResult } from "../terminal/index.js";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";

const execAsync = promisify(exec);

export function createDeviceTool(): Tool {
  return {
    definition: {
      name: "device",
      description: "Access device capabilities: camera snap/clip, screen recording, location, notifications, system commands.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "Action: status, camera_snap, camera_clip, screen_record, screen_capture, location_get, notify, run",
          },
          node: {
            type: "string",
            description: "Node identifier (device name/IP, optional for local)",
          },
          facing: {
            type: "string",
            description: "Camera facing: front, back, both (for camera actions)",
          },
          duration: {
            type: "string",
            description: "Duration (e.g., '10s', '5m') for camera_clip or screen_record",
          },
          durationMs: {
            type: "number",
            description: "Duration in milliseconds",
          },
          title: {
            type: "string",
            description: "Notification title (for notify action)",
          },
          body: {
            type: "string",
            description: "Notification body (for notify action)",
          },
          command: {
            type: "array",
            description: "Command array for run action",
            items: {
              type: "string",
            },
          },
          cwd: {
            type: "string",
            description: "Working directory for run action",
          },
          savePath: {
            type: "string",
            description: "File path to save screen capture. If not provided, saves to land/screenshots/",
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
          const toolAllowed = isToolAllowed("device", securityContext.toolPolicy);
          if (!toolAllowed) {
            return {
              success: false,
              error: "Device tool is not allowed by security policy",
            };
          }
        }

        // For now, implement basic local node capabilities
        // Full implementation would require device pairing and Gateway integration

        switch (action) {
          case "status": {
            return {
              success: true,
              result: {
                devices: [
                  {
                    id: "local",
                    name: "Local Machine",
                    platform: process.platform,
                    capabilities: ["notify", "run", "screen_capture"],
                  },
                ],
              },
            };
          }

          case "notify": {
            const title = typeof params.title === "string" ? params.title : "Notification";
            const body = typeof params.body === "string" ? params.body : "";

            // Use native notification based on platform
            if (process.platform === "darwin") {
              // macOS
              await execAsync(`osascript -e 'display notification "${body}" with title "${title}"'`);
            } else if (process.platform === "linux") {
              // Linux
              await execAsync(`notify-send "${title}" "${body}"`);
            } else if (process.platform === "win32") {
              // Windows
              await execAsync(`powershell -Command "New-BurntToastNotification -Text '${title}', '${body}'"`);
            }

            return {
              success: true,
              result: {
                action: "notified",
                title,
                body,
              },
            };
          }

          case "run": {
            const command = Array.isArray(params.command) ? params.command : undefined;
            const cwd = typeof params.cwd === "string" ? params.cwd : undefined;

            if (!command || command.length === 0) {
              return {
                success: false,
                error: "command array is required for run action",
              };
            }

            // Security check - only allow safe commands for now
            const cmd = command[0];
            const allowedCommands = ["echo", "date", "pwd", "whoami", "hostname"];
            if (!allowedCommands.includes(cmd)) {
              return {
                success: false,
                error: `Command '${cmd}' is not allowed. Allowed: ${allowedCommands.join(", ")}`,
              };
            }

            try {
              const { stdout, stderr } = await execAsync(command.join(" "), { cwd });
              return {
                success: true,
                result: {
                  stdout: stdout.trim(),
                  stderr: stderr.trim(),
                  exitCode: 0,
                },
              };
            } catch (error: any) {
              return {
                success: false,
                error: error.message || "Command execution failed",
                result: {
                  stdout: error.stdout?.trim() || "",
                  stderr: error.stderr?.trim() || "",
                  exitCode: error.code || 1,
                },
              };
            }
          }

          case "camera_snap": {
            return {
              success: false,
              error: "camera_snap requires device pairing. Use a paired node device.",
            };
          }

          case "camera_clip": {
            return {
              success: false,
              error: "camera_clip requires device pairing. Use a paired node device.",
            };
          }

          case "screen_capture": {
            // Capture device screen (works on local machine)
            const landDir = join(homedir(), ".zuckerman", "land");
            const screenshotsDir = join(landDir, "screenshots");
            if (!existsSync(screenshotsDir)) {
              mkdirSync(screenshotsDir, { recursive: true });
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            let savePath: string;
            
            if (typeof params.savePath === "string" && params.savePath) {
              savePath = params.savePath.startsWith("~") 
                ? params.savePath.replace("~", homedir())
                : params.savePath;
            } else {
              savePath = join(screenshotsDir, `device-screenshot-${timestamp}.png`);
            }
            
            // Ensure directory exists
            const dir = dirname(savePath);
            if (!existsSync(dir)) {
              mkdirSync(dir, { recursive: true });
            }
            
            // Use platform-specific screen capture
            if (process.platform === "darwin") {
              // macOS: use screencapture command
              await execAsync(`screencapture -x "${savePath}"`);
            } else if (process.platform === "linux") {
              // Linux: use gnome-screenshot or import (ImageMagick)
              try {
                await execAsync(`gnome-screenshot -f "${savePath}"`);
              } catch {
                try {
                  await execAsync(`import -window root "${savePath}"`);
                } catch {
                  return {
                    success: false,
                    error: "Screen capture requires gnome-screenshot or ImageMagick. Install with: sudo apt-get install gnome-screenshot or imagemagick",
                  };
                }
              }
            } else if (process.platform === "win32") {
              // Windows: use PowerShell to capture screen
              const psScript = `
                Add-Type -AssemblyName System.Windows.Forms,System.Drawing
                $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
                $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
                $graphics = [System.Drawing.Graphics]::FromImage($bmp)
                $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
                $bmp.Save("${savePath.replace(/\\/g, "/")}")
                $graphics.Dispose()
                $bmp.Dispose()
              `;
              await execAsync(`powershell -Command "${psScript.replace(/\n/g, "; ")}"`);
            } else {
              return {
                success: false,
                error: `Screen capture not supported on platform: ${process.platform}`,
              };
            }
            
            return {
              success: true,
              result: {
                path: savePath,
                platform: process.platform,
                action: "screen_captured",
              },
            };
          }

          case "screen_record": {
            return {
              success: false,
              error: "screen_record requires device pairing. Use a paired node device.",
            };
          }

          case "location_get": {
            return {
              success: false,
              error: "location_get requires device pairing. Use a paired node device.",
            };
          }

          default:
            return {
              success: false,
              error: `Unknown action: ${action}. Supported: status, camera_snap, camera_clip, screen_record, screen_capture, location_get, notify, run`,
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
