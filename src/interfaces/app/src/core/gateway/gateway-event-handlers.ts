/**
 * Gateway event handlers for common events
 * Single Responsibility: Handle gateway events and dispatch to window
 */
export class GatewayEventHandlers {
  /**
   * Create standard event handlers for React state management
   */
  static createStateHandlers(handlers: {
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
  }) {
    return {
      onConnect: handlers.onConnect,
      onDisconnect: handlers.onDisconnect,
      onError: handlers.onError,
      onEvent: (event: any) => {
        // Handle channel events (e.g., WhatsApp QR codes and connection status)
        if (event.event === "channel.whatsapp.qr" && event.payload) {
          const payload = event.payload as { qr: string; channelId: string };
          window.dispatchEvent(new CustomEvent("whatsapp-qr", { detail: payload }));
        } else if (event.event === "channel.whatsapp.connection" && event.payload) {
          const payload = event.payload as { connected: boolean; channelId: string };
          window.dispatchEvent(new CustomEvent("whatsapp-connection", { detail: payload }));
        }
      },
    };
  }
}
