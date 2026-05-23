/**
 * Portal Security routes — Wave Q: 2FA status + active sessions list/revoke.
 *
 * The 2FA setup/verify/disable endpoints live on /api/user/2fa/* in
 * authRoutes.ts and are already guarded by requireAuth — they apply to any
 * logged-in user (portal client OR admin), so no portal-side duplicates are
 * needed. This file owns:
 *
 *   GET    /api/portal/security/tfa-status    → { enabled }
 *   GET    /api/portal/security/sessions      → { sessions: [...], current_sid }
 *   POST   /api/portal/security/sessions/:sid/revoke
 *   POST   /api/portal/security/sessions/revoke-others
 *
 * Sessions are read directly from the connect-pg-simple `session` table,
 * which stores the serialized passport user id at sess.passport.user. We
 * scan that jsonb for the current user's id, so no schema migration is
 * needed. user_agent / ip_address come from columns we DON'T have, so we
 * surface a minimal shape: sid, created (= -7d from expire), last_active
 * (= expire - 7d offset, best effort), is_current.
 *
 * NOTE: connect-pg-simple doesn't record user_agent or ip on the session
 * row, so the listing is intentionally minimal. We mark this clearly in
 * the response shape — the UI tags missing fields as "Unknown device".
 */

import type { Express } from "express";
import { requireClient } from "../auth";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { db as drizzleDb } from "../db";
import { eq } from "drizzle-orm";
import { users } from "@shared/schema";

const log = createLogger("PortalSecurity");

interface SessionRow {
  sid: string;
  expire: Date;
  user_id: number | null;
}

export function registerPortalSecurityRoutes(app: Express) {
  /** GET /api/portal/security/tfa-status — wraps the existing /api/user/2fa/status
   *  for parity with the rest of /api/portal/security/* and so the client can
   *  use one base path for the Security tab. */
  app.get("/api/portal/security/tfa-status", requireClient, async (req, res) => {
    try {
      const userId = req.user!.id;
      const [user] = await drizzleDb
        .select({ totp_enabled: users.totp_enabled })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      res.json({ enabled: !!user?.totp_enabled, method: user?.totp_enabled ? "totp" : null });
    } catch (err) {
      log.error("tfa-status error", { error: String(err) });
      res.status(500).json({ error: "Failed to check 2FA status" });
    }
  });

  /** GET /api/portal/security/sessions — list active sessions for the
   *  current user. Reads from connect-pg-simple's session table. */
  app.get("/api/portal/security/sessions", requireClient, async (req, res) => {
    try {
      const userId = req.user!.id;
      const currentSid = req.sessionID;

      // The session row's `sess` is jsonb. Passport stores the user id at
      // sess.passport.user (an integer, per server/auth.ts:52). We filter
      // server-side so we never load other users' rows into Node.
      const result = await db.execute(sql`
        SELECT sid, expire, (sess->'passport'->>'user')::int AS user_id
        FROM session
        WHERE (sess->'passport'->>'user')::int = ${userId}
          AND expire > NOW()
        ORDER BY expire DESC
      `);

      const rows = (result as unknown as { rows: SessionRow[] }).rows ?? [];
      const sessions = rows.map((r) => ({
        id: r.sid,
        is_current: r.sid === currentSid,
        // connect-pg-simple doesn't store ua/ip; surface a placeholder so
        // the UI can render a sensible "Unknown device" line.
        user_agent_summary: "Browser session",
        ip_city: null as string | null,
        // We don't have created_at; best-effort = expire minus the 7-day
        // session TTL configured in server/index.ts.
        last_active_at: r.expire,
      }));

      res.json({ sessions, current_sid: currentSid });
    } catch (err) {
      log.error("sessions list error", { error: String(err) });
      res.status(500).json({ error: "Failed to list sessions" });
    }
  });

  /** POST /api/portal/security/sessions/:sid/revoke — revoke a single
   *  session. Refuses to revoke the current session (use logout instead).
   *  Verifies the target sid belongs to the current user. */
  app.post("/api/portal/security/sessions/:sid/revoke", requireClient, async (req, res) => {
    try {
      const userId = req.user!.id;
      const targetSid = req.params.sid;
      if (!targetSid) return res.status(400).json({ error: "Session id required" });
      if (targetSid === req.sessionID) {
        return res.status(400).json({ error: "Cannot revoke the current session. Use logout instead." });
      }

      // Verify ownership before deleting.
      const owned = await db.execute(sql`
        SELECT sid FROM session
        WHERE sid = ${targetSid}
          AND (sess->'passport'->>'user')::int = ${userId}
        LIMIT 1
      `);
      const ownedRows = (owned as unknown as { rows: Array<{ sid: string }> }).rows ?? [];
      if (ownedRows.length === 0) {
        return res.status(404).json({ error: "Session not found" });
      }

      await db.execute(sql`DELETE FROM session WHERE sid = ${targetSid}`);
      log.info("Portal session revoked", { userId, sid: targetSid });
      res.json({ ok: true });
    } catch (err) {
      log.error("revoke session error", { error: String(err) });
      res.status(500).json({ error: "Failed to revoke session" });
    }
  });

  /** POST /api/portal/security/sessions/revoke-others — revoke every
   *  session for the current user EXCEPT the one making the request. */
  app.post("/api/portal/security/sessions/revoke-others", requireClient, async (req, res) => {
    try {
      const userId = req.user!.id;
      const keepSid = req.sessionID;

      const result = await db.execute(sql`
        DELETE FROM session
        WHERE (sess->'passport'->>'user')::int = ${userId}
          AND sid <> ${keepSid}
      `);
      const count =
        (result as unknown as { rowCount?: number }).rowCount ?? 0;
      log.info("Portal sessions revoke-others", { userId, count });
      res.json({ ok: true, revoked: count });
    } catch (err) {
      log.error("revoke-others error", { error: String(err) });
      res.status(500).json({ error: "Failed to revoke other sessions" });
    }
  });
}
