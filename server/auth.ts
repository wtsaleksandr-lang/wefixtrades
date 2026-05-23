import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import type { Request, Response, NextFunction } from "express";
import { db } from "./db";
import { adminImpersonations, users } from "@shared/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

/* ─── Type declarations ─── */
declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      role: string;
      name: string | null;
    }
    interface Request {
      /** Populated by impersonationMiddleware when an admin's session has
       *  an active impersonation row. `req.user` itself is swapped to the
       *  TARGET user (so RBAC sees the customer's permissions); this side
       *  channel preserves the original admin identity for the banner +
       *  audit log + stop endpoint. */
      adminImpersonating?: {
        admin_user_id: number;
        impersonation_id: string;
        started_at: Date;
      };
    }
  }
}

/** Hard cap on a single impersonation session, in minutes. After this
 *  the middleware auto-expires the row and reverts req.user to the
 *  admin's own identity. Set deliberately tight — impersonation is a
 *  read-the-page tool, not a working session. */
export const IMPERSONATION_MAX_MINUTES = 60;

/* ─── Password utils ─── */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const verify = pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  const hashBuf = Buffer.from(hash, "hex");
  const verifyBuf = Buffer.from(verify, "hex");
  if (hashBuf.length !== verifyBuf.length) return false;
  return timingSafeEqual(hashBuf, verifyBuf);
}

/* ─── Passport setup ─── */
export function setupPassport() {
  passport.use(
    new LocalStrategy({ usernameField: "email" }, async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email.toLowerCase().trim());
        if (!user) return done(null, false, { message: "Invalid email or password" });
        if (!verifyPassword(password, user.password_hash))
          return done(null, false, { message: "Invalid email or password" });
        return done(null, { id: user.id, email: user.email, role: user.role, name: user.name });
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUserById(id);
      if (!user) return done(null, false);
      done(null, { id: user.id, email: user.email, role: user.role, name: user.name });
    } catch (err) {
      done(err);
    }
  });
}

/* ─── RBAC middleware ─── */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

/**
 * Middleware for client portal routes.
 * Checks session auth with role="client", then resolves client_id
 * from the clients table via clients.user_id = users.id.
 * Attaches req.clientId for downstream route handlers.
 */
export function requireClient(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  if (req.user.role !== "client" && req.user.role !== "admin") return res.status(403).json({ error: "Client portal access required" });
  // client_id resolution happens in the route handler via req.user.id
  next();
}

/**
 * Sprint 8: strict client-only middleware. Refuses admin role outright.
 * Used on portal endpoints that take a write action on behalf of a
 * client (approve / request-changes / reject) where an admin has its
 * own admin-side route and should never act through the portal path.
 */
export function requireClientStrict(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  if (req.user.role !== "client") return res.status(403).json({ error: "Client account required" });
  next();
}

/* ─── Admin impersonation middleware ───
 *
 * Runs after passport's deserialiseUser. If the current session was
 * marked with `impersonationActive` + `impersonationId` (set by the
 * start endpoint), we:
 *   1. Look up the impersonation row.
 *   2. Auto-expire it if older than IMPERSONATION_MAX_MINUTES (sets
 *      ended_at = NOW and falls through with req.user untouched — the
 *      admin's original identity).
 *   3. Otherwise look up the target user, replace req.user with the
 *      target's identity, and stash the admin identity under
 *      req.adminImpersonating.
 *
 * Important: req.user.id is swapped to the target so every downstream
 * RBAC + storage call (orders, services, audit) sees the customer as
 * the actor — matching what the customer would see if they performed
 * the action themselves. The audit-log writer detects
 * req.adminImpersonating and stamps actor_type='admin' with metadata
 * { impersonation_id, target_user_id } so we always know which
 * actions were performed under a "view as" session.
 */
export async function impersonationMiddleware(req: Request, _res: Response, next: NextFunction) {
  const sess = req.session as (typeof req.session & {
    impersonationActive?: boolean;
    impersonationId?: string;
  }) | undefined;
  if (!sess?.impersonationActive || !sess.impersonationId) return next();
  if (!req.user) return next();

  try {
    const rows = await db
      .select()
      .from(adminImpersonations)
      .where(and(eq(adminImpersonations.id, sess.impersonationId), isNull(adminImpersonations.ended_at)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      // Session points at a row that's already been closed (e.g. stop
      // endpoint elsewhere) — clear the flag so we stop trying.
      sess.impersonationActive = false;
      sess.impersonationId = undefined;
      return next();
    }
    const startedAt = row.started_at instanceof Date ? row.started_at : new Date(row.started_at as unknown as string);
    const ageMs = Date.now() - startedAt.getTime();
    if (ageMs > IMPERSONATION_MAX_MINUTES * 60_000) {
      // Hard-cap reached — close the row, drop the flag. The next
      // request from this admin will see their own identity again.
      await db
        .update(adminImpersonations)
        .set({ ended_at: sql`NOW()` })
        .where(eq(adminImpersonations.id, row.id));
      sess.impersonationActive = false;
      sess.impersonationId = undefined;
      return next();
    }

    // Look up the target user and swap req.user. The admin's original
    // identity is preserved via req.adminImpersonating so the banner +
    // audit log can render / stamp it.
    const targetRows = await db.select().from(users).where(eq(users.id, row.target_user_id)).limit(1);
    const target = targetRows[0];
    if (!target) return next();
    req.adminImpersonating = {
      admin_user_id: row.admin_user_id,
      impersonation_id: row.id,
      started_at: startedAt,
    };
    req.user = { id: target.id, email: target.email, role: target.role, name: target.name };
    return next();
  } catch (_err) {
    // On DB error fail closed — leave the admin as themselves. Better
    // to lose the impersonation view than silently serve customer data
    // to the wrong identity.
    return next();
  }
}

/**
 * Block any handler that requires admin role from running under an
 * impersonated session. Use this on admin-only mutate endpoints that
 * should NEVER be reachable while "view as customer" is active —
 * defence in depth on top of requireAdmin (which will already 403
 * because req.user.role is the target's, not 'admin', once swapped).
 */
export function blockWhileImpersonating(req: Request, res: Response, next: NextFunction) {
  if (req.adminImpersonating) {
    return res.status(403).json({ error: "Not available while impersonating a customer" });
  }
  next();
}
