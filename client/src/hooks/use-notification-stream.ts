import { useEffect, useRef, useState } from "react";

interface NotificationCounts {
  userUnread: number;
  adminUnread: number;
  ts?: number;
}

/**
 * Connects to the notifications SSE stream which pushes the user's own unread
 * count and (for admin/owner sessions) the admin unread count in real time.
 * The client never polls the database itself.
 */
export function useNotificationStream(enabled: boolean) {
  const [counts, setCounts] = useState<NotificationCounts>({ userUnread: 0, adminUnread: 0 });
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) {
      setCounts({ userUnread: 0, adminUnread: 0 });
      setConnected(false);
      return;
    }

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let active = true;

    const connect = () => {
      if (!active) return;
      source = new EventSource("/api/notifications/stream");
      sourceRef.current = source;

      source.addEventListener("notificationCounts", (event) => {
        const msgEvent = event as MessageEvent;
        try {
          const data = JSON.parse(msgEvent.data);
          setCounts({
            userUnread: data.userUnread ?? 0,
            adminUnread: data.adminUnread ?? 0,
            ts: data.ts,
          });
        } catch {
          // ignore malformed payloads
        }
      });

      source.onopen = () => setConnected(true);

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

  return { ...counts, connected };
}
