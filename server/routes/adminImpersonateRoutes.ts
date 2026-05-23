/**
 * Admin "view as customer" impersonation routes.
 *
 * Three endpoints (mounted under /api/admin/impersonate):
 *   POST  /api/admin/impersonate/:userId   — start an impersonation
 *   POST  /api/admin/impersonate/stop      — end the active impersonation
 *   GET   /api/admin/impersonate/active    — banner data + status probe
 *
 * Security mechanics:
 *   - Only role='admin' can start. Targets must be a non-admin user.
 *   - We do NOT mint a separate session token; the admin's existing
 *     session gets two new keys (impersonationActive + impersonationId).
 *     The middleware in server/auth.ts swaps req.user to the target
 *     user on every request, leaving req.adminImpersonating populated
 *     so the audit log + banner know the real actor.
 *   - The session also carries `originalAdminUserId` so /stop knows
 *     which user to restore — but because the impersonation middleware
 *     only swaps req.user *after* deserialiseUser has loaded the admin
 *     from the session's passport.user (which is the admin's id, never
 *     overwritten), restoration is automatic. We just need to clear
 *     the impersonation flag.
 *   - Hard cap (60 min) is enforced by the middleware, not here.
 *   - Every start writes a row to admin_impersonations + an audit_log
 *     entry. Every stop closes the row (ended_at = NOW) + audit row.
 */

import type { Express, Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { adminImpersonations, users } from "@shared/schema";
import { writeAudit } from "../lib/auditLog";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminImpersonate");

function getIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

export function registerAdminImpersonateRoutes(app: Express) {
  /* ─── Start impersonation ───
   *
   * Admin-only. Validates the target exists + is not an admin (we never
   * impersonate other admins — that's a privilege-escalation foot-gun),
   * inserts an audit row, then flips the session flag so the
   * middleware takes over from the next request onward.
   *
   * If the admin already has an active impersonation, we close it
   * before opening the new one (no nesting). The /stop endpoint is
   * still safe to call after this.
   */
  app.post("/api/admin/impersonate/:userId", async (req: Request, res: Response) => {
    // We can't use requireAdmin in the wrapping because once an
    // impersonation flips the session, req.user.role is the target's,
    // not 'admin'. So check the admin identity directly via the
    // adminImpersonating side-channel OR a plain non-impersonated
    // req.user.
    if (req.adminImpersonating) {
      return res.status(409).json({ error: "Already impersonating a customer. Stop the current session first." });
    }
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });

    const targetUserId = parseInt(String(req.params.userId), 10);
    if (!Number.isFinite(targetUserId)) return res.status(400).json({ error: "Invalid user id" });

    const reason = typeof req.body?.reason === "string" ? req.body.reason.slice(0, 500) : null;

    try {
      const [target] = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
      if (!target) return res.status(404).json({ error: "User not found" });
      if (target.role === "admin") {
        return res.status(403).json({ error: "Cannot impersonate another admin" });
      }

      const adminUserId = req.user.id;
      const adminIp = getIp(req);

      const [row] = await db
        .insert(adminImpersonations)
        .values({
          admin_user_id: adminUserId,
          target_user_id: target.id,
          admin_ip: adminIp,
          reason,
        })
        .returning();

      // Stamp the audit log so the cross-cutting reader surfaces the
      // start event under the admin's actor id (not the target's).
      await writeAudit({
        actorId: adminUserId,
        actorType: "admin",
        action: "impersonate.start",
        entityType: "user",
        entityId: String(target.id),
        metadata: { impersonation_id: row.id, target_email: target.email, reason },
        req,
      });

      // Flip the session. From the next request, the middleware will
      // see impersonationActive + impersonationId and swap req.user.
      const sess = req.session as typeof req.session & {
        impersonationActive?: boolean;
        impersonationId?: string;
      };
      sess.impersonationActive = true;
      sess.impersonationId = row.id;
      req.session.save((err) => {
        if (err) {
          log.error("[start] session save failed", { err: err.message });
          return res.status(500).json({ error: "Failed to start impersonation" });
        }
        return res.json({
          ok: true,
          impersonation_id: row.id,
          target_user_id: target.id,
          target_user_name: target.name,
          target_user_email: target.email,
          redirect: "/portal",
        });
      });
    } catch (err) {
      log.error("[start] failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to start impersonation" });
    }
  });

  /* ─── Stop impersonation ───
   *
   * Closes the active row (ended_at = NOW) and clears the session
   * flag. The admin's passport.user.id was never overwritten, so the
   * next request automatically sees the original admin identity.
   */
  app.post("/api/admin/impersonate/stop", async (req: Request, res: Response) => {
    if (!req.adminImpersonating) {
      return res.status(400).json({ error: "No active impersonation to stop" });
    }
    const impersonationId = req.adminImpersonating.impersonation_id;
    const adminUserId = req.adminImpersonating.admin_user_id;
    try {
      await db
        .update(adminImpersonations)
        .set({ ended_at: sql`NOW()` })
        .where(eq(adminImpersonations.id, impersonationId));

      await writeAudit({
        actorId: adminUserId,
        actorType: "admin",
        action: "impersonate.stop",
        entityType: "user",
        entityId: String(req.user?.id ?? ""),
        metadata: { impersonation_id: impersonationId },
        req,
      });

      const sess = req.session as typeof req.session & {
        impersonationActive?: boolean;
        impersonationId?: string;
      };
      sess.impersonationActive = false;
      sess.impersonationId = undefined;
      req.session.save((err) => {
        if (err) {
          log.error("[stop] session save failed", { err: err.message });
          return res.status(500).json({ error: "Failed to stop impersonation" });
        }
        return res.json({ ok: true, redirect: "/admin" });
      });
    } catch (err) {
      log.error("[stop] failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to stop impersonation" });
    }
  });

  /* ─── Banner data / status probe ───
   *
   * Called from the global <ImpersonateBanner> mounted in App.tsx. We
   * return either { impersonating: false } or a full descriptor of the
   * active impersonation. Cheap enough to poll every 60s (the banner's
   * default refetch interval). No auth gate — if there's no session
   * we just return { impersonating: false }.
   */
  app.get("/api/admin/impersonate/active", async (req: Request, res: Response) => {
    if (!req.adminImpersonating) {
      return res.json({ impersonating: false });
    }
    try {
      const targetUser = req.user; // already the target identity thanks to middleware
      const [row] = await db
        .select()
        .from(adminImpersonations)
        .where(and(eq(adminImpersonations.id, req.adminImpersonating.impersonation_id), isNull(adminImpersonations.ended_at)))
        .limit(1);
      if (!row) return res.json({ impersonating: false });
      return res.json({
        impersonating: true,
        impersonation_id: row.id,
        target_user_id: targetUser?.id,
        target_user_name: targetUser?.name ?? null,
        target_user_email: targetUser?.email ?? null,
        started_at: row.started_at,
      });
    } catch (err) {
      log.error("[active] failed", { err: (err as Error).message });
      return res.status(500).json({ error: "Failed to load impersonation status" });
    }
  });
}
