/**
 * Real-time push channel via Socket.IO.
 *
 * One server-side Socket.IO instance, attached to the same HTTP
 * server Express runs on (no separate port). Connections share the
 * Express session cookie, so Socket.IO clients are authenticated
 * the same way as HTTP requests — no custom JWT or token plumbing.
 *
 * Rooms:
 *   admin           — every authenticated admin user
 *   client:<id>     — a single portal client. Multiple browser
 *                     tabs / devices for the same client all join
 *                     the same room, so a single broadcast hits
 *                     every device.
 *
 * Public surface:
 *   initRealtime(httpServer, sessionMiddleware) — call once at boot
 *   broadcastToAdmins(event, payload)
 *   broadcastToClient(clientId, event, payload)
 *   getRealtime() — returns the Socket.IO instance (for tests)
 *
 * Events (server → client):
 *   admin.activity.new     — { activity }
 *   admin.alert.new        — { alert }
 *   client.payment.updated — { payment }
 *   client.task.updated    — { task }
 *   ... extend as needed
 *
 * NOTE: Real-time events are advisory only. Every consumer must
 * still tolerate missing / out-of-order events — invalidate the
 * relevant TanStack Query cache when an event arrives, don't try
 * to mutate local state directly.
 */

import type { Server as HTTPServer } from "http";
import type { RequestHandler } from "express";
import { Server as IOServer, type Socket } from "socket.io";
import { createLogger } from "../lib/logger";

const log = createLogger("Realtime");

let io: IOServer | null = null;

/* The Socket.IO + Express type marriage isn't perfect; we cast
 * sparingly inside helpers below. */
interface SessionRequest {
  session?: {
    passport?: {
      user?: number;
    };
  };
  user?: { id: number; role: string };
}

export function initRealtime(httpServer: HTTPServer, sessionMiddleware: RequestHandler): IOServer {
  if (io) {
    log.warn("initRealtime called twice — ignoring second init");
    return io;
  }

  io = new IOServer(httpServer, {
    /* Same origin only — cookies don't survive cross-origin
     * connections in production browsers anyway. */
    cors: { origin: false, credentials: true },
    /* Long-poll fallback is on by default; we keep it on so behind-
     * proxy deployments that don't proxy WS still degrade gracefully. */
    transports: ["websocket", "polling"],
    /* Aggressive ping so dead connections close fast in dev — for
     * production, the default 25s/20s is fine. */
    pingInterval: 25_000,
    pingTimeout: 20_000,
  });

  /* Engine-level middleware: lets express-session deserialise the
   * session cookie before the Socket.IO connect handler runs.
   * Without this, socket.request.session is undefined. */
  io.engine.use((req: any, res: any, next: any) => sessionMiddleware(req, res, next));

  /* Connection-level middleware: gates auth. Anonymous traffic gets
   * dropped before joining any room. */
  io.use((socket, next) => {
    const req = socket.request as unknown as SessionRequest;
    const userId = req.session?.passport?.user;
    if (typeof userId !== "number") {
      log.info("rejected anonymous socket connection");
      return next(new Error("unauthenticated"));
    }
    /* Stash the user id on the socket for later — we look it up
     * once per connection rather than on every message. */
    (socket.data as any).userId = userId;
    next();
  });

  io.on("connection", async (socket: Socket) => {
    const userId = (socket.data as any).userId as number;

    /* Resolve the user's role + linked client so we know which rooms
     * to join. We do this lazily in the handler (rather than the
     * middleware above) because it requires a DB lookup; rejecting
     * unauthed sockets in middleware is cheaper. */
    try {
      const { db } = await import("../db");
      const { users, clients } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        log.warn("connected socket has no matching user", { userId });
        socket.disconnect(true);
        return;
      }

      if (user.role === "admin") {
        socket.join("admin");
        log.info("admin socket connected", { userId, socketId: socket.id });
      } else if (user.role === "client") {
        const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.user_id, userId)).limit(1);
        if (client) {
          socket.join(`client:${client.id}`);
          log.info("portal client socket connected", { userId, clientId: client.id, socketId: socket.id });
        } else {
          log.warn("client user has no linked client row", { userId });
        }
      } else {
        log.warn("unknown user role", { userId, role: user.role });
      }
    } catch (err) {
      log.error("connection handler failed", { error: String(err) });
      socket.disconnect(true);
      return;
    }

    socket.on("disconnect", (reason) => {
      log.info("socket disconnected", { socketId: socket.id, reason });
    });
  });

  log.info("Realtime initialised");
  return io;
}

export function getRealtime(): IOServer | null {
  return io;
}

/* ─── Broadcast helpers ─────────────────────────────────────────────
   Safe-fail. If realtime isn't initialised (e.g. running in a
   script context, or initRealtime threw), broadcasts are silently
   dropped — they're advisory anyway. */

export function broadcastToAdmins(event: string, payload: unknown): void {
  if (!io) return;
  try {
    io.to("admin").emit(event, payload);
  } catch (err) {
    log.error("broadcastToAdmins failed", { event, error: String(err) });
  }
}

export function broadcastToClient(clientId: number, event: string, payload: unknown): void {
  if (!io) return;
  try {
    io.to(`client:${clientId}`).emit(event, payload);
  } catch (err) {
    log.error("broadcastToClient failed", { clientId, event, error: String(err) });
  }
}
