import { Command } from "commander";
import { WhatsAppChannel } from "@world/communication/messengers/channels/whatsapp.js";
import { loadConfig, saveConfig } from "@world/config/index.js";
import { outputJson, shouldOutputJson } from "../utils/json-output.js";

export function createChannelsCommand(): Command {
  const cmd = new Command("channels")
    .description("Manage messaging channels");

  cmd
    .command("login")
    .description("Login/pair a messaging channel (e.g., WhatsApp)")
    .option("-c, --channel <channel>", "Channel to login (whatsapp, telegram, etc.)", "whatsapp")
    .action(async (options) => {
      const channel = options.channel.toLowerCase();

      if (channel === "whatsapp") {
        await loginWhatsApp();
      } else {
        console.error(`Channel "${channel}" is not yet supported`);
        process.exit(1);
      }
    });

  cmd
    .command("status")
    .description("Show status of all configured channels")
    .option("--json", "Output as JSON")
    .action(async (options: { json?: boolean }) => {
      const config = await loadConfig();
      
      const status = {
        whatsapp: {
          enabled: config.channels?.whatsapp?.enabled || false,
          dmPolicy: config.channels?.whatsapp?.dmPolicy || "pairing",
        },
        telegram: {
          enabled: config.channels?.telegram?.enabled || false,
        },
        discord: {
          enabled: config.channels?.discord?.enabled || false,
        },
        slack: {
          enabled: config.channels?.slack?.enabled || false,
        },
        signal: {
          enabled: config.channels?.signal?.enabled || false,
        },
        imessage: {
          enabled: config.channels?.imessage?.enabled || false,
        },
      };

      if (shouldOutputJson(options)) {
        outputJson(status, options);
        return;
      }

      console.log("\n📱 Channel Status:\n");

      if (config.channels?.whatsapp) {
        const wa = config.channels.whatsapp;
        console.log(`WhatsApp: ${wa.enabled ? "✅ Enabled" : "❌ Disabled"}`);
        if (wa.enabled) {
          console.log(`  DM Policy: ${wa.dmPolicy || "pairing"}`);
          console.log(`  Allowed From: ${wa.allowFrom?.length || 0} contacts`);
        }
      }

      if (config.channels?.telegram) {
        const tg = config.channels.telegram;
        console.log(`Telegram: ${tg.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      }

      if (config.channels?.discord) {
        const dc = config.channels.discord;
        console.log(`Discord: ${dc.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      }

      if (config.channels?.slack) {
        const sl = config.channels.slack;
        console.log(`Slack: ${sl.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      }

      if (config.channels?.signal) {
        const sig = config.channels.signal;
        console.log(`Signal: ${sig.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      }

      if (config.channels?.imessage) {
        const im = config.channels.imessage;
        console.log(`iMessage: ${im.enabled ? "✅ Enabled" : "❌ Disabled"}`);
      }

      console.log();
    });

  return cmd;
}

async function loginWhatsApp(): Promise<void> {
  console.log("\n📱 WhatsApp Login\n");
  console.log("This will start WhatsApp Web pairing.");
  console.log("Scan the QR code that appears with your WhatsApp app.\n");

  const config = await loadConfig();

  // Ensure WhatsApp config exists
  if (!config.channels) {
    config.channels = {};
  }
  if (!config.channels.whatsapp) {
    config.channels.whatsapp = {
      enabled: false,
      dmPolicy: "pairing",
      allowFrom: [],
    };
  }

  // Temporarily enable for login
  const originalEnabled = config.channels.whatsapp.enabled;
  config.channels.whatsapp.enabled = true;

  const channel = new WhatsAppChannel(config.channels.whatsapp, (qr) => {
    console.log("\n✅ QR Code generated! Scan it with WhatsApp.\n");
  });

  try {
    await channel.start();

    // Wait for connection
    console.log("Waiting for connection...");
    console.log("(Press Ctrl+C to cancel)\n");

    // Poll for connection status
    const checkInterval = setInterval(() => {
      if (channel.isConnected()) {
        clearInterval(checkInterval);
        console.log("\n✅ WhatsApp connected successfully!\n");
        
        // Save config with enabled flag
        config.channels!.whatsapp!.enabled = true;
        saveConfig(config).then(() => {
          console.log("WhatsApp is now enabled in your config.");
          console.log("You can add contacts to 'allowFrom' in .zuckerman/config.json\n");
          process.exit(0);
        }).catch((err) => {
          console.error("Failed to save config:", err);
          process.exit(1);
        });
      }
    }, 1000);

    // Handle Ctrl+C
    process.on("SIGINT", async () => {
      clearInterval(checkInterval);
      await channel.stop();
      config.channels!.whatsapp!.enabled = originalEnabled;
      await saveConfig(config);
      console.log("\n\nLogin cancelled.");
      process.exit(0);
    });
  } catch (error) {
    console.error("\n❌ Failed to start WhatsApp:", error);
    config.channels!.whatsapp!.enabled = originalEnabled;
    await saveConfig(config);
    process.exit(1);
  }
}
