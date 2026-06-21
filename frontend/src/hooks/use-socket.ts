"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  connectChatSocket,
  connectBroadcastSocket,
  connectInviteSocket,
  disconnectSocket,
} from "@/lib/socket";

/**
 * Hook: subscribe to real-time chat events for an account via native WebSocket.
 */
export function useChatSocket(accountId: string | null) {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef<((data: any) => void) | null>(null);

  const setHandler = useCallback((fn: (data: any) => void) => {
    handlerRef.current = fn;
  }, []);

  useEffect(() => {
    if (!accountId) return;

    const key = `chats:${accountId}`;
    const ws = connectChatSocket(accountId);

    // Poll until connected
    const checkInterval = setInterval(() => {
      setConnected(ws.connected);
    }, 500);

    // Forward all events to the handler
    const handleEvent = (data: any) => {
      handlerRef.current?.(data);
    };

    ws.on("all", handleEvent);

    // Initial status
    setConnected(ws.connected);

    return () => {
      clearInterval(checkInterval);
      ws.off("all", handleEvent);
      // Don't disconnect on unmount — keep alive for quick tab re-mount
    };
  }, [accountId]);

  return { connected, setHandler };
}

/**
 * Hook: subscribe to broadcast job progress.
 */
export function useBroadcastSocket(jobId: string | null) {
  const [connected, setConnected] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    if (!jobId) return;

    const key = `broadcast:${jobId}`;
    const ws = connectBroadcastSocket(jobId);

    const checkInterval = setInterval(() => {
      setConnected(ws.connected);
    }, 500);

    const handleEvent = (data: any) => {
      if (data.type === "progress") {
        setProgress(data);
      } else if (data.type === "log") {
        setLogs((prev) => [...prev, data]);
      } else if (data.type === "completed" || data.type === "error") {
        setProgress(data);
      }
    };

    ws.on("all", handleEvent);

    return () => {
      clearInterval(checkInterval);
      ws.off("all", handleEvent);
      setLogs([]);
    };
  }, [jobId]);

  return { connected, progress, logs };
}

/**
 * Hook: subscribe to invite job progress via WebSocket.
 */
export function useInviteSocket(jobId: string | null) {
  const [connected, setConnected] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [phase, setPhase] = useState<string>("");
  const [phaseMessage, setPhaseMessage] = useState<string>("");

  useEffect(() => {
    if (!jobId) return;

    const ws = connectInviteSocket(jobId);

    const checkInterval = setInterval(() => {
      setConnected(ws.connected);
    }, 500);

    const handleEvent = (data: any) => {
      if (data.type === "progress") {
        setProgress(data);
      } else if (data.type === "log") {
        setLogs((prev) => [...prev, data]);
      } else if (data.type === "phase") {
        setPhase(data.phase || "");
        setPhaseMessage(data.message || "");
      } else if (data.type === "scrape_progress") {
        setPhaseMessage(data.message || "");
      } else if (data.type === "completed" || data.type === "error") {
        setProgress(data);
      } else if (data.type === "flood_wait" || data.type === "peer_flood" || data.type === "batch_delay") {
        setPhaseMessage(data.message || "");
      }
    };

    ws.on("all", handleEvent);

    return () => {
      clearInterval(checkInterval);
      ws.off("all", handleEvent);
      setLogs([]);
      setPhase("");
      setPhaseMessage("");
    };
  }, [jobId]);

  return { connected, progress, logs, phase, phaseMessage };
}
