import { useState, useEffect, useCallback, useRef } from "react";

export interface GatewayStatus {
  running: boolean;
  address?: string;
  error?: string;
}

export interface UseGatewayManagerReturn {
  status: GatewayStatus | null;
  isLoading: boolean;
  isStarting: boolean;
  isStopping: boolean;
  startGateway: (host: string, port: number) => Promise<boolean>;
  stopGateway: (host: string, port: number) => Promise<boolean>;
  checkStatus: (host: string, port: number) => Promise<void>;
  startPolling: (host: string, port: number, interval?: number) => void;
  stopPolling: () => void;
}

/**
 * Hook for managing gateway server lifecycle
 */
export function useGatewayManager(): UseGatewayManagerReturn {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkStatus = useCallback(async (host: string, port: number) => {
    if (!window.electronAPI) {
      setStatus({ running: false, error: "Electron API not available" });
      return;
    }

    setIsLoading(true);
    try {
      const result = await window.electronAPI.gatewayStatus(host, port);
      setStatus(result);
    } catch (error) {
      setStatus({
        running: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startGateway = useCallback(async (host: string, port: number): Promise<boolean> => {
    if (!window.electronAPI) {
      throw new Error("Electron API not available");
    }

    setIsStarting(true);
    try {
      const result = await window.electronAPI.gatewayStart(host, port);
      if (result.success) {
        // Wait a bit and check status
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await checkStatus(host, port);
        return true;
      } else {
        setStatus({
          running: false,
          error: result.error || "Failed to start gateway",
        });
        return false;
      }
    } catch (error) {
      setStatus({
        running: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    } finally {
      setIsStarting(false);
    }
  }, [checkStatus]);

  const stopGateway = useCallback(async (host: string, port: number): Promise<boolean> => {
    if (!window.electronAPI) {
      throw new Error("Electron API not available");
    }

    setIsStopping(true);
    try {
      const result = await window.electronAPI.gatewayStop(host, port);
      if (result.success) {
        // Wait a bit and check status
        await new Promise((resolve) => setTimeout(resolve, 500));
        await checkStatus(host, port);
        return true;
      } else {
        setStatus({
          running: status?.running || false,
          error: result.error || "Failed to stop gateway",
        });
        return false;
      }
    } catch (error) {
      setStatus({
        running: status?.running || false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    } finally {
      setIsStopping(false);
    }
  }, [checkStatus, status]);

  const startPolling = useCallback((host: string, port: number, interval: number = 5000) => {
    // Stop existing polling if any
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Start polling
    pollingIntervalRef.current = setInterval(() => {
      checkStatus(host, port);
    }, interval);
  }, [checkStatus]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    status,
    isLoading,
    isStarting,
    isStopping,
    startGateway,
    stopGateway,
    checkStatus,
    startPolling,
    stopPolling,
  };
}
