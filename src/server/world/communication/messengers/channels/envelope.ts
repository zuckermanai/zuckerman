import type { ChannelMessage } from "./types.js";

/**
 * Format channel name for display (capitalize first letter)
 */
function formatChannelName(channelId: string): string {
  if (!channelId) return "Channel";
  return channelId.charAt(0).toUpperCase() + channelId.slice(1).toLowerCase();
}

/**
 * Format message with channel source prefix, similar to openclaw's formatInboundEnvelope
 * 
 * Examples:
 * - "[Telegram] hello" (direct message)
 * - "[WhatsApp] hi there" (direct message)
 * - "[Discord] Alice: hello" (group message with sender)
 */
export function formatMessageWithChannelSource(
  message: ChannelMessage,
  options?: {
    includeSender?: boolean;
  }
): string {
  const channelName = formatChannelName(message.channelId);
  const isGroup = message.metadata?.isGroup === true;
  const includeSender = options?.includeSender !== false && isGroup;
  
  // Extract sender information from metadata
  let senderLabel: string | undefined;
  if (includeSender) {
    const fromUsername = message.metadata?.fromUsername as string | undefined;
    const fromId = message.metadata?.fromId as string | undefined;
    const senderName = message.metadata?.senderName as string | undefined;
    
    // Prefer username, then sender name, then fromId
    senderLabel = fromUsername || senderName || fromId;
  }
  
  // Build envelope prefix
  const parts: string[] = [channelName];
  
  // Add sender label for group messages
  if (senderLabel) {
    parts.push(senderLabel);
  }
  
  const prefix = `[${parts.join(" ")}]`;
  
  // For group messages with sender, add colon after sender
  if (senderLabel) {
    return `${prefix}: ${message.content}`;
  }
  
  return `${prefix} ${message.content}`;
}
