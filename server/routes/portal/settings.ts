/**
 * Portal Settings routes.
 *
 * Mounted under /api/portal/settings, /api/portal/notification-preferences,
 * and /api/portal/password.
 * Auth: requireClient.
 *
 * Extracted from portalRoutes.ts as wave 15 of the portal sub-registrar
 * refactor. Pure code move — zero behaviour change. The parent registrar
 * (registerPortalRoutes) invokes registerPortalSettingsRoutes(app) so the
 * wiring in routes/index.ts is unchanged.
 *
 * Endpoints
 *   GET   /api/portal/settings                  (client profile + account info)
 *   PATCH /api/portal/settings                  (update contact info)
 *   GET   /api/portal/notification-preferences  (read prefs + defaults)
 *   PUT   /api/portal/notification-preferences  (replace prefs blob)
 *   POST  /api/portal/password                  (change password, IP-rate-limited)
 */

import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { requireClient, hashPassword, verifyPassword } from "../../auth";
import { db } from "../../db";
import {
  clients,
  users,
  passwordResetTokens,
  parseNotificationPreferences,
  notificationPreferencesSchema,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@shared/schema";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  displayPreferencesPatchSchema,
  parseDisplayPreferences,
} from "@shared/userPreferences/displayMode";
import { createLogger } from "../../lib/logger";
import { authRateLimiter } from "../../services/rateLimiter";
import { withClientIdOrPreview } from "../../middleware/adminPreviewSafe";

const log = createLogger("PortalSettings");

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

/** Resolve client_id from the authenticated user's id. Returns null if no client record linked. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/** Middleware-style helper: resolve client_id or return 403.
 *
 * Admin viewing the portal directly (not impersonating a customer) has no
 * `clients` row of their own, so without this branch every GET 403'd and the
 * UI showed "Failed to load settings". We now return null cleanly on read
 * paths so the caller can render an empty/demo response; write paths pass
 * `adminFallback: 'forbid'` to keep the explicit 403.
 */
async function withClientId(
  req: Request,
  res: Response,
  opts: { adminFallback?: 'empty' | 'forbid' } = {},
): Promise<number | null> {
  if (req.user!.role === 'admin' && !req.adminImpersonating) {
    if (opts.adminFallback === 'forbid') {
      res.status(403).json({ error: "Admin must impersonate a customer for this action", code: "admin_no_impersonation" });
      return null;
    }
    return null; // caller returns empty data
  }
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    // Q20a: stable error code so the portal UI can show an admin-friendly
    // empty state instead of a generic "Failed to load" red box.
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return clientId;
}

export function registerPortalSettingsRoutes(app: Express) {
  /**
   * GET /api/portal/settings
   * Client profile and account info.
   */
  app.get("/api/portal/settings", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) {
        // Admin previewing the portal directly: return a stub settings shape
        // (200) so the page renders an empty state. Their account email is
        // still useful context so we fill it from the users row.
        if (req.user!.role === 'admin') {
          const [adminUser] = await db
            .select({ email: users.email, name: users.name })
            .from(users)
            .where(eq(users.id, req.user!.id))
            .limit(1);
          return res.json({
            business_name: "",
            contact_name: adminUser?.name ?? "",
            contact_email: "",
            contact_phone: "",
            website_url: "",
            logo_url: null,
            trade_type: "",
            account_email: adminUser?.email ?? null,
          });
        }
        return;
      }

      const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
      const [user] = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);

      res.json({
        business_name: client.business_name,
        contact_name: client.contact_name,
        contact_email: client.contact_email,
        contact_phone: client.contact_phone,
        website_url: client.website_url,
        logo_url: client.logo_url ?? null,
        trade_type: client.trade_type,
        account_email: user?.email ?? null,
      });
    } catch (err) {
      log.error("Portal settings error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load settings" });
    }
  });

  /**
   * PATCH /api/portal/settings
   * Update client contact info.
   */
  app.patch("/api/portal/settings", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { adminFallback: 'forbid' });
      if (!clientId) return;

      const { contact_name, contact_email, contact_phone, website_url } = req.body;

      const updates: Record<string, string | undefined> = {};
      if (contact_name !== undefined) updates.contact_name = contact_name;
      if (contact_email !== undefined) updates.contact_email = contact_email;
      if (contact_phone !== undefined) updates.contact_phone = contact_phone;
      if (website_url !== undefined) updates.website_url = website_url;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No fields to update" });
      }

      const [updated] = await db
        .update(clients)
        .set({ ...updates, updated_at: new Date() })
        .where(eq(clients.id, clientId))
        .returning();

      res.json({
        business_name: updated.business_name,
        contact_name: updated.contact_name,
        contact_email: updated.contact_email,
        contact_phone: updated.contact_phone,
        website_url: updated.website_url,
        trade_type: updated.trade_type,
      });
    } catch (err) {
      log.error("Portal settings update error:", { error: String(err) });
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  /**
   * GET /api/portal/notification-preferences
   * Returns the client's notification preferences, falling back to
   * sensible defaults if none have been saved yet.
   */
  app.get("/api/portal/notification-preferences", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res);
      if (!clientId) {
        // Admin previewing the portal directly: return defaults so the
        // settings page renders without throwing.
        if (req.user!.role === 'admin') {
          return res.json({
            preferences: DEFAULT_NOTIFICATION_PREFERENCES,
            defaults: DEFAULT_NOTIFICATION_PREFERENCES,
          });
        }
        return;
      }

      const [client] = await db.select({ metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId)).limit(1);
      const prefs = parseNotificationPreferences(client?.metadata);
      res.json({ preferences: prefs, defaults: DEFAULT_NOTIFICATION_PREFERENCES });
    } catch (err) {
      log.error("Portal notification prefs GET error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load preferences" });
    }
  });

  /**
   * PUT /api/portal/notification-preferences
   * Replace the full preferences blob. Body must match the
   * notificationPreferencesSchema; partial updates are not supported
   * because the categories list is short enough that a full PUT is
   * always cheaper than reasoning about merges.
   */
  app.put("/api/portal/notification-preferences", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientId(req, res, { adminFallback: 'forbid' });
      if (!clientId) return;

      const parsed = notificationPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid preferences payload", details: parsed.error.flatten() });
      }

      const [existing] = await db.select({ metadata: clients.metadata }).from(clients).where(eq(clients.id, clientId)).limit(1);
      const prevMetadata = (existing?.metadata ?? {}) as Record<string, unknown>;
      const newMetadata = { ...prevMetadata, notification_preferences: parsed.data };

      const [updated] = await db
        .update(clients)
        .set({ metadata: newMetadata, updated_at: new Date() })
        .where(eq(clients.id, clientId))
        .returning({ metadata: clients.metadata });

      res.json({ preferences: parseNotificationPreferences(updated.metadata) });
    } catch (err) {
      log.error("Portal notification prefs PUT error:", { error: String(err) });
      res.status(500).json({ error: "Failed to update preferences" });
    }
  });

  /**
   * GET /api/portal/settings/display
   * Wave 36 — Tesla Simplification.
   *
   * Returns the current Display preferences (Simple/Advanced mode +
   * per-product visibility toggles). Admins previewing the portal see
   * defaults. Stored at `clients.metadata.display_preferences`.
   */
  app.get("/api/portal/settings/display", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientIdOrPreview(req, res, {
        previewShape: { preferences: DEFAULT_DISPLAY_PREFERENCES, defaults: DEFAULT_DISPLAY_PREFERENCES },
      });
      if (!clientId) return;

      const [client] = await db
        .select({ metadata: clients.metadata })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);
      const md = (client?.metadata ?? {}) as Record<string, unknown>;
      const prefs = parseDisplayPreferences(md.display_preferences);
      res.json({ preferences: prefs, defaults: DEFAULT_DISPLAY_PREFERENCES });
    } catch (err) {
      log.error("Portal display prefs GET error:", { error: String(err) });
      res.status(500).json({ error: "Failed to load display preferences" });
    }
  });

  /**
   * PATCH /api/portal/settings/display
   * Wave 36 — Partial update of Display preferences. Body fields are
   * all optional; only sent fields overwrite. Persisted under
   * `clients.metadata.display_preferences`.
   */
  app.patch("/api/portal/settings/display", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await withClientIdOrPreview(req, res, {
        previewShape: { ok: true, persisted: false, preferences: DEFAULT_DISPLAY_PREFERENCES },
        mode: "write",
        action: "settings.display.patch",
      });
      if (!clientId) return;

      const parsed = displayPreferencesPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid display preferences payload", details: parsed.error.flatten() });
      }

      const [existing] = await db
        .select({ metadata: clients.metadata })
        .from(clients)
        .where(eq(clients.id, clientId))
        .limit(1);
      const prevMetadata = (existing?.metadata ?? {}) as Record<string, unknown>;
      const prevPrefs = parseDisplayPreferences(prevMetadata.display_preferences);
      const merged = { ...prevPrefs, ...parsed.data };
      const newMetadata = { ...prevMetadata, display_preferences: merged };

      const [updated] = await db
        .update(clients)
        .set({ metadata: newMetadata, updated_at: new Date() })
        .where(eq(clients.id, clientId))
        .returning({ metadata: clients.metadata });

      const md = (updated?.metadata ?? {}) as Record<string, unknown>;
      res.json({ preferences: parseDisplayPreferences(md.display_preferences) });
    } catch (err) {
      log.error("Portal display prefs PATCH error:", { error: String(err) });
      res.status(500).json({ error: "Failed to update display preferences" });
    }
  });

  /**
   * POST /api/portal/password
   * Change password for the authenticated client.
   */
  app.post("/api/portal/password", requireClient, async (req: Request, res: Response) => {
    try {
      const ip = getClientIp(req);
      if (!(await authRateLimiter.check(`pw:${ip}`))) {
        return res.status(429).json({ error: "Too many attempts. Please wait before trying again." });
      }

      const { current_password, new_password } = req.body;

      if (!current_password || typeof current_password !== "string") {
        return res.status(400).json({ error: "Current password is required" });
      }
      if (!new_password || typeof new_password !== "string" || new_password.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }

      // Get current user with hash
      const [user] = await db
        .select({ id: users.id, password_hash: users.password_hash })
        .from(users)
        .where(eq(users.id, req.user!.id))
        .limit(1);

      if (!user) return res.status(404).json({ error: "User not found" });

      // Verify current password
      if (!verifyPassword(current_password, user.password_hash)) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Update password
      await db
        .update(users)
        .set({ password_hash: hashPassword(new_password) })
        .where(eq(users.id, req.user!.id));

      // Invalidate any existing reset tokens for this user
      await db
        .update(passwordResetTokens)
        .set({ used: true })
        .where(and(eq(passwordResetTokens.user_id, req.user!.id), eq(passwordResetTokens.used, false)));

      res.json({ ok: true });
    } catch (err) {
      log.error("Portal password change error:", { error: String(err) });
      res.status(500).json({ error: "Failed to change password" });
    }
  });
}
