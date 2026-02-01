import { killPort } from "src/utils/kill-port.js";

export async function runKillPortCommand(port: number): Promise<void> {
  console.log(`Killing processes on port ${port}...`);
  await killPort(port);
  console.log(`✓ Done`);
}
