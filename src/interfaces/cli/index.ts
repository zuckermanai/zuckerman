#!/usr/bin/env node

// Load environment variables from .env file (before any other imports)
import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env from project root, don't override existing env vars
// Suppress dotenv's console output for cleaner CLI experience
config({ 
  path: resolve(process.cwd(), ".env"), 
  override: false,
  debug: false,
});

import { Command } from "commander";
import { runKillPortCommand } from "./kill-port-command.js";
import { createAgentsCommand } from "./commands/agents.js";
import { createSessionsCommand } from "./commands/sessions.js";
import { createGatewayCommand } from "./commands/gateway.js";
import { createStatusCommand } from "./commands/status.js";
import { createChannelsCommand } from "./commands/channels.js";
import { createConfigCommand } from "./commands/config.js";

const program = new Command();

program
  .name("zuckerman")
  .description("AI Personal Agent - Command Line Interface")
  .version("0.1.0");

// Add entity-based commands
program.addCommand(createAgentsCommand());
program.addCommand(createSessionsCommand());
program.addCommand(createGatewayCommand());
program.addCommand(createStatusCommand());
program.addCommand(createChannelsCommand());
program.addCommand(createConfigCommand());

// Utility command
program
  .command("kill-port")
  .description("Kill processes on a specific port")
  .argument("<port>", "Port number")
  .action(async (port: string) => {
    const portNum = parseInt(port, 10);
    if (isNaN(portNum)) {
      console.error("Invalid port number");
      process.exit(1);
    }
    await runKillPortCommand(portNum);
  });

program.parse();
