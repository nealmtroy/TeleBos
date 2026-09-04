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

    // Event-driven status tracking (REN-03)
    setConnected(ws.connected);
    const handleOpen = () => setConnected(true);
    const handleClose = () => setConnected(false);
    ws.on("open", handleOpen);
    ws.on("close", handleClose);

    // Forward all events to the handler
    const handleEvent = (data: any) => {
      handlerRef.current?.(data);
    };

    ws.on("all", handleEvent);

    return () => {
      ws.off("open", handleOpen);
      ws.off("close", handleClose);
      ws.off("all", handleEvent);
      // Don't disconnect on unmount — keep alive for quick tab re-mount
    };
  }, [accountId]);

  return { connected, setHandler };
}

/**
 * Hook: subscribe to generic job progress (broadcast or invite) via WebSocket.
 */
export function useJobSocket(jobType: "broadcast" | "invite", jobId: string | null) {
  const [connected, setConnected] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [phaseMessage, setPhaseMessage] = useState<string>("");

  useEffect(() => {
    if (!jobId) return;

    const ws = jobType === "broadcast" ? connectBroadcastSocket(jobId) : connectInviteSocket(jobId);

    // Event-driven status tracking (REN-03)
    setConnected(ws.connected);
    const handleOpen = () => setConnected(true);
    const handleClose = () => setConnected(false);
    ws.on("open", handleOpen);
    ws.on("close", handleClose);

    const handleEvent = (data: any) => {
      if (data.type === "progress") {
        setProgress(data);
      } else if (data.type === "log") {
        setLogs((prev) => [...prev, data]);
      } else if (data.type === "completed" || data.type === "error") {
        setProgress(data);
      } else if (data.message) {
        setPhaseMessage(data.message);
      }
    };

    ws.on("all", handleEvent);

    return () => {
      ws.off("open", handleOpen);
      ws.off("close", handleClose);
      ws.off("all", handleEvent);
      disconnectSocket(`${jobType}:${jobId}`);
      setLogs([]);
      setPhaseMessage("");
      setProgress(null);
    };
  }, [jobId, jobType]);

  return { connected, progress, logs, phaseMessage };
}

/**
 * Hook: subscribe to broadcast job progress.
 */
export function useBroadcastSocket(jobId: string | null) {
  const { connected, progress, logs } = useJobSocket("broadcast", jobId);
  return { connected, progress, logs };
}

/**
 * Hook: subscribe to invite job progress via WebSocket.
 */
export function useInviteSocket(jobId: string | null) {
  const { connected, progress, logs, phaseMessage } = useJobSocket("invite", jobId);
  return { connected, progress, logs, phase: "", phaseMessage };
}
