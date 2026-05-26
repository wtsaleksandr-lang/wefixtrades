/**
 * QuoteQuick Live Quote Stream — Wave 29.
 *
 * GET /api/quotequick/quote/:token/stream
 *
 * Server-Sent Events endpoint that pushes a "quote-updated" event whenever
 * the owner saves edits to a quote snapshot. The customer-facing /q/:slug
 * page subscribes via EventSource and re-fetches the snapshot on each
 * tick.
 *
 * Implementation notes:
 *   - In-process pub/sub (Map<token, Set<Response>>) keeps this dead simple.
 *     Survives across the SSE connection lifetime; restart drops all
 *     subscribers (acceptable — clients auto-reconnect via EventSource).
 *   - 25s heartbeat comments keep proxies from idling the socket.
 *   - 30 min hard idle cutoff to avoid forgotten tabs holding sockets
 *     forever.
 *   - The PATCH /api/q/:slug route emits via publishQuoteUpdate(token).
 *
 * This route deliberately ships outside requireClient — anyone with the
 * stable shareable URL token can subscribe, the same way they can GET the
 * snapshot. We only leak that an edit happened; the new payload still
 * goes through the existing GET endpoint with all owner-token redaction.
 */

import type { Express, Request, Response } from "express";
import { createLogger } from "../../../lib/logger";

const log = createLogger("PortalQuotequickLiveStream");

const HEARTBEAT_MS = 25_000;
const HARD_IDLE_MS = 30 * 60_000;

/** Token → set of subscribers. */
const subscribers = new Map<string, Set<Response>>();

/**
 * Public helper: call this from PATCH /api/q/:slug after a successful
 * edit. Fans out a "quote-updated" event to all subscribers of `token`.
 *
 * No-op when there are zero subscribers (the common case).
 */
export function publishQuoteUpdate(token: string): void {
  const subs = subscribers.get(token);
  if (!subs || subs.size === 0) return;
  const payload = JSON.stringify({
    type: "quote-updated",
    token,
    at: new Date().toISOString(),
  });
  for (const res of subs) {
    try {
      res.write(`event: quote-updated\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (err: any) {
      log.warn("publishQuoteUpdate: write failed", {
        token,
        error: err?.message,
      });
    }
  }
}

function attachSubscriber(token: string, res: Response): () => void {
  let set = subscribers.get(token);
  if (!set) {
    set = new Set<Response>();
    subscribers.set(token, set);
  }
  set.add(res);
  return () => {
    const s = subscribers.get(token);
    if (!s) return;
    s.delete(res);
    if (s.size === 0) subscribers.delete(token);
  };
}

export function registerPortalQuotequickLiveStreamRoutes(app: Express) {
  app.get(
    "/api/quotequick/quote/:token/stream",
    (req: Request, res: Response) => {
      const token = String(req.params.token ?? "");
      if (!/^[a-z0-9-]{4,64}$/i.test(token)) {
        return res.status(400).json({ error: "Invalid token" });
      }

      // SSE headers.
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
      res.flushHeaders?.();

      // Send the connect ack so the client knows the socket is open.
      res.write(`event: ready\n`);
      res.write(`data: ${JSON.stringify({ token })}\n\n`);

      const detach = attachSubscriber(token, res);

      const heartbeat = setInterval(() => {
        try {
          res.write(`: heartbeat ${Date.now()}\n\n`);
        } catch {
          // Swallow — the cleanup below will fire on the next close event.
        }
      }, HEARTBEAT_MS);

      const idleCutoff = setTimeout(() => {
        try {
          res.write(`event: idle-cutoff\n`);
          res.write(`data: ${JSON.stringify({ reason: "max-idle" })}\n\n`);
          res.end();
        } catch {
          /* noop */
        }
      }, HARD_IDLE_MS);

      const cleanup = () => {
        clearInterval(heartbeat);
        clearTimeout(idleCutoff);
        detach();
      };

      req.on("close", cleanup);
      req.on("error", cleanup);

      log.info("quotequick.live-stream.connected", { token });
    },
  );
}
