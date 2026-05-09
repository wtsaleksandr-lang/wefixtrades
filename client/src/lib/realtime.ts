/**
 * Singleton Socket.IO client + a small React hook for subscribing.
 *
 * Why a singleton: opening one connection per component would
 * silently churn through ports as users navigate. We open at most
 * one socket per browser tab; multiple subscribers share it.
 *
 * Usage:
 *
 *   useRealtime("admin.activity.new", (activity) => {
 *     queryClient.invalidateQueries({ queryKey: ["/api/admin/crm/activity"] });
 *   });
 *
 * The connection is opened lazily on the first subscription and
 * stays open for the life of the tab. We never disconnect — the
 * server's auth middleware drops anonymous traffic anyway, so an
 * unauthenticated tab just sits with a closed socket.
 *
 * Real-time events are advisory. Always invalidate the relevant
 * query rather than mutating local state directly — that keeps
 * the source of truth on the server and tolerates dropped or
 * out-of-order events.
 */

import { useEffect } from "react";
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (socket) return socket;
  socket = io({
    /* Same-origin cookie auth — no token plumbing. */
    withCredentials: true,
    /* Match the server's transport order. WebSocket first, polling
     * fallback for proxies that don't tunnel the upgrade. */
    transports: ["websocket", "polling"],
    /* Reconnect indefinitely with backoff. The server may be
     * restarting during a deploy; we want the page to recover
     * silently when it comes back. */
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    autoConnect: true,
  });

  if (typeof window !== "undefined") {
    /* Surface lifecycle events on the console in dev only. Prod
     * builds elide these via dead-code elimination. */
    if (import.meta.env.DEV) {
      socket.on("connect", () => console.info("[realtime] connected", socket?.id));
      socket.on("disconnect", (reason) => console.info("[realtime] disconnected:", reason));
      socket.on("connect_error", (err) => console.warn("[realtime] connect error:", err.message));
    }
  }

  return socket;
}

/**
 * Subscribe to a realtime event for the lifetime of the calling
 * component. Handler receives the raw payload — typically an
 * activity row, an alert, or similar.
 */
export function useRealtime<T = unknown>(event: string, handler: (payload: T) => void): void {
  useEffect(() => {
    const s = getSocket();
    /* Wrap so we can detach the EXACT function reference on cleanup
     * — closure-stable handlers are common and we don't want to
     * remove every listener for the event. */
    const wrapped = (payload: T) => handler(payload);
    s.on(event, wrapped);
    return () => {
      s.off(event, wrapped);
    };
    // We intentionally don't include `handler` in deps: most callers
    // pass a fresh function each render, and wrapping the latest
    // one via a ref would add complexity for no behaviour change.
    // If a caller needs the latest handler, they can use a ref
    // themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}

/**
 * Programmatic access for non-component callers (e.g. the global
 * query client invalidator wired in main.tsx). Most consumers
 * should use the hook above.
 */
export function getRealtimeSocket(): Socket {
  return getSocket();
}
