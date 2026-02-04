import { Command } from "commander";
import { rmSync, existsSync } from "node:fs";
import { getBaseDir } from "@server/world/homedir/paths.js";
import { createInterface } from "node:readline";

export function createResetCommand(): Command {
  const cmd = new Command("reset")
    .description("Reset all Zuckerman data (conversations, config, agents, etc.)")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (options: { yes?: boolean }) => {
      const zuckermanDir = getBaseDir();
      
      if (!existsSync(zuckermanDir)) {
        console.log("✓ No data to reset - .zuckerman directory does not exist");
        return;
      }

      // Confirmation prompt unless --yes flag is provided
      if (!options.yes) {
        console.log("⚠️  WARNING: This will delete ALL Zuckerman data:");
        console.log(`   - ${zuckermanDir}`);
        console.log("   This includes:");
        console.log("   - All chat history and conversations");
        console.log("   - Agent configurations");
        console.log("   - Memory and transcripts");
        console.log("   - All other stored data");
        console.log("");
        
        // Interactive confirmation prompt
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question("Are you sure you want to continue? (yes/no): ", resolve);
        });

        rl.close();

        if (answer.toLowerCase().trim() !== "yes") {
          console.log("❌ Reset cancelled");
          process.exit(0);
        }
      }

      try {
        rmSync(zuckermanDir, { recursive: true, force: true });
        console.log(`✓ Successfully deleted ${zuckermanDir}`);
        console.log("✓ All Zuckerman data has been reset");
      } catch (error) {
        console.error("❌ Failed to reset data:", error instanceof Error ? error.message : "Unknown error");
        process.exit(1);
      }
    });

  return cmd;
}
