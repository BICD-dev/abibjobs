import { useEffect, useRef, useState } from "react";

interface AdminCounts {
  waitingTickets: number;
  openDisputes: number;
  ts?: number;
}

/**
 * Connects to the admin SSE stream and returns the latest aggregated
 * counts (waiting live-support tickets + escalated disputes). The server
 * pushes updates in real time, so the client never polls the DB itself.
 */
export function useAdminStream(enabled: boolean) {
  const [counts, setCounts] = useState<AdminCounts>({ waitingTickets: 0, openDisputes: 0 });
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCounts({ waitingTickets: 0, openDisputes: 0 });
      setConnected(false);
      return;
    }

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const connect = () => {
      if (!active) return;
      source = new EventSource("/api/admin/stream");
      sourceRef.current = source;

      source.addEventListener("adminCounts", (event) => {
        const msgEvent = event as MessageEvent;
        try {
          const data = JSON.parse(msgEvent.data);
          setCounts({
            waitingTickets: data.waitingTickets ?? 0,
            openDisputes: data.openDisputes ?? 0,
            ts: data.ts,
          });
        } catch {
          // ignore malformed payloads
        }
      });

      source.addEventListener("connected", () => {
        setConnected(true);
        setError(false);
      });

      source.onopen = () => {
        setConnected(true);
        setError(false);
      };

      source.onerror = () => {
        setConnected(false);
        source?.close();
        if (active && reconnectTimer === null) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 5000);
        }
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
      sourceRef.current = null;
    };
  }, [enabled]);

  return { ...counts, connected, error };
}
