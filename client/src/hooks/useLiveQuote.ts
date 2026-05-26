/**
 * useLiveQuote — Wave 29 — SSE subscriber for live-editable quote URLs.
 *
 * Subscribes to /api/quotequick/quote/:token/stream via the native
 * EventSource API (no socket.io — per Wave 29 hard rule). When the owner
 * saves an edit, the server fires a "quote-updated" event; the hook
 * surfaces the timestamp + a `lastUpdate` so the consuming page can
 * re-fetch the snapshot and render "Updated 3 seconds ago".
 *
 * Reconnection is handled natively by EventSource. The hook tears down
 * on unmount.
 *
 * Anti-pattern: don't read raw event payloads beyond the timestamp — the
 * snapshot itself still comes from the GET endpoint with all owner-token
 * redaction.
 */

import { useEffect, useState } from "react";

export interface UseLiveQuoteResult {
  lastUpdate: Date | null;
  connected: boolean;
  /** Increments on every quote-updated tick — easy to depend on in queryKeys. */
  tick: number;
}

export function useLiveQuote(
  token: string | null | undefined,
  enabled: boolean = true,
): UseLiveQuoteResult {
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !token) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }
    const url = `/api/quotequick/quote/${encodeURIComponent(token)}/stream`;
    const es = new EventSource(url, { withCredentials: false });

    es.addEventListener("ready", () => {
      setConnected(true);
    });

    es.addEventListener("quote-updated", (evt) => {
      try {
        const data = JSON.parse((evt as MessageEvent).data ?? "{}");
        setLastUpdate(data?.at ? new Date(data.at) : new Date());
      } catch {
        setLastUpdate(new Date());
      }
      setTick((n) => n + 1);
    });

    es.addEventListener("idle-cutoff", () => {
      setConnected(false);
      es.close();
    });

    es.onerror = () => {
      // EventSource auto-reconnects on most errors. We surface
      // connected=false so the UI can show a stale indicator briefly.
      setConnected(false);
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, [token, enabled]);

  return { lastUpdate, connected, tick };
}
