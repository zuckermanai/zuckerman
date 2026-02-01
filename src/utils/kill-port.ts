import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Kill processes listening on a specific port
 */
export async function killPort(port: number): Promise<void> {
  const platform = process.platform;

  try {
    if (platform === "darwin" || platform === "linux") {
      // Find process using the port
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pids = stdout.trim().split("\n").filter(Boolean);

      if (pids.length === 0) {
        return; // No process found
      }

      // Kill all processes
      for (const pid of pids) {
        try {
          await execAsync(`kill -9 ${pid}`);
          console.log(`[Kill Port] Killed process ${pid} on port ${port}`);
        } catch (err) {
          // Process might have already terminated
        }
      }
    } else if (platform === "win32") {
      // Windows: Find and kill process using the port
      const { stdout } = await execAsync(`netstat -ano | findstr :${port}`);
      const lines = stdout.trim().split("\n");

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid)) {
          try {
            await execAsync(`taskkill /PID ${pid} /F`);
            console.log(`[Kill Port] Killed process ${pid} on port ${port}`);
          } catch (err) {
            // Process might have already terminated
          }
        }
      }
    }
  } catch (err) {
    // No process found or other error - that's okay
    // We'll just continue starting the server
  }
}
