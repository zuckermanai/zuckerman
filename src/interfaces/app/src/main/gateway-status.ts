import { WebSocket } from "ws";

/**
 * Check if gateway is running by attempting to connect
 */
export async function isGatewayRunning(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `ws://${host}:${port}`;
    const ws = new WebSocket(url);

    const timeout = setTimeout(() => {
      ws.close();
      resolve(false);
    }, 1000);

    ws.on("open", () => {
      clearTimeout(timeout);
      ws.close();
      resolve(true);
    });

    ws.on("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}
