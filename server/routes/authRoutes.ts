import type { Express, Request } from "express";
import { randomBytes } from "crypto";
import passport from "passport";
import { requireAuth, requireAdmin, hashPassword, verifyPassword } from "../auth";
import { db } from "../db";
import { eq, and, gt } from "drizzle-orm";
import { users, passwordResetTokens, clients } from "@shared/schema";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { authRateLimiter } from "../services/rateLimiter";
import { getMemory, linkSessionToUser, extractMemorySignals } from "../services/chatMemory";
import { storage } from "../storage";
import { createLogger } from "../lib/logger";

const log = createLogger("Auth");

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

/**
 * Sprint 7: NODE_ENV-guarded test bypass for the auth rate limiter.
 *
 * Playwright runs many specs against a single localhost source IP and
 * blew through the 10/15min budget when Sprint 7 was added on top of
 * the existing portal-login load (Sprint 6 + per-test admin contexts).
 *
 * The bypass is INERT in production:
 *   - process.env.NODE_ENV === "production" → header is ignored
 *   - dev/test (or unset NODE_ENV) → presence of `x-test-bypass-rate-limit: 1`
 *     skips the rate-limit check
 *
 * Production rate limits are not weakened. The header is only honored
 * when NODE_ENV is non-production and is opt-in per request.
 */
function isTestRateLimitBypass(req: Request): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return req.headers["x-test-bypass-rate-limit"] === "1";
}

export function registerAuthRoutes(app: Express) {
  /** Current session user (or null) */
  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.user ?? null });
  });

  /** Email/password login */
  app.post("/api/auth/login", async (req, res, next) => {
    const ip = getClientIp(req);
    if (!isTestRateLimitBypass(req) && !(await authRateLimiter.check(`login:${ip}`))) {
      return res.status(429).json({ error: "Too many login attempts. Please wait 15 minutes." });
    }
    passport.authenticate(
      "local",
      (err: Error | null, user: Express.User | false, info: { message: string } | undefined) => {
        if (err) return next(err);
        if (!user) {
          return res.status(401).json({ error: info?.message || "Invalid credentials" });
        }
        req.logIn(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          return res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name } });
        });
      }
    )(req, res, next);
  });

  /** Logout */
  app.post("/api/auth/logout", requireAuth, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  /**
   * POST /api/auth/forgot-password
   * Generates a reset token and emails it.
   * Always returns 200 (never reveals whether email exists).
   */
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (!(await authRateLimiter.check(`forgot:${ip}`))) {
        return res.status(429).json({ error: "Too many requests. Please wait before trying again." });
      }

      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }

      const normalised = email.toLowerCase().trim();

      // Always return success to prevent email enumeration
      const [user] = await db.select().from(users).where(eq(users.email, normalised)).limit(1);
      if (!user) return res.json({ ok: true });

      // Generate token (32 bytes = 64 hex chars)
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(passwordResetTokens).values({
        user_id: user.id,
        token,
        expires_at: expiresAt,
      });

      // Send email
      const transporter = getEmailTransporter();
      if (transporter) {
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
        const resetUrl = `${baseUrl}/reset-password?token=${token}`;

        await transporter.sendMail({
          from: `WeFixTrades <${getFromAddress()}>`,
          to: normalised,
          subject: "Reset your WeFixTrades password",
          html: `
            <div style="font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0B0F14;padding:40px 16px;">
              <div style="max-width:480px;margin:0 auto;">
                <div style="text-align:center;margin-bottom:32px;">
                  <span style="display:inline-block;background:rgba(102,232,250,0.12);color:#66E8FA;font-size:12px;font-weight:800;padding:5px 16px;border-radius:999px;letter-spacing:0.06em;">WeFixTrades</span>
                </div>
                <div style="background:#151A21;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:36px 28px;">
                  <h1 style="font-size:22px;font-weight:700;color:#F0F0F0;margin:0 0 8px;line-height:1.3;">
                    Reset your password
                  </h1>
                  <p style="font-size:14px;color:#CDD1D6;line-height:1.6;margin:0 0 24px;">
                    Use the button below to set a new password. The link works for one hour, then expires.
                  </p>
                  <a href="${resetUrl}" style="display:inline-block;background:#66E8FA;color:#0B0F14;font-size:14px;font-weight:700;padding:13px 24px;border-radius:10px;text-decoration:none;">
                    Set a new password
                  </a>
                  <div style="border-top:1px solid rgba(255,255,255,0.06);margin:28px 0 16px;"></div>
                  <p style="font-size:12px;color:#8B919A;line-height:1.5;margin:0 0 8px;">
                    Didn't request this? You can safely ignore this email — your password stays the same.
                  </p>
                  <p style="font-size:11px;color:#555B63;line-height:1.5;margin:12px 0 0;word-break:break-all;">
                    Trouble with the button? Paste this link into your browser:<br/>
                    <a href="${resetUrl}" style="color:#66E8FA;">${resetUrl}</a>
                  </p>
                </div>
              </div>
            </div>
          `,
        });
      } else {
        log.warn("[auth] SMTP not configured — reset token:", { detail: token });
      }

      res.json({ ok: true });
    } catch (err) {
      log.error("[auth] Forgot password error:", { error: String(err) });
      res.json({ ok: true }); // Don't leak errors
    }
  });

  /**
   * POST /api/auth/reset-password
   * Validates token and sets new password.
   */
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (!(await authRateLimiter.check(`reset:${ip}`))) {
        return res.status(429).json({ error: "Too many attempts. Please wait before trying again." });
      }

      const { token, password } = req.body;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Reset token is required" });
      }
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      // Find valid, unused, non-expired token
      const [resetRow] = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.token, token),
            eq(passwordResetTokens.used, false),
            gt(passwordResetTokens.expires_at, new Date())
          )
        )
        .limit(1);

      if (!resetRow) {
        return res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
      }

      // Update password
      const newHash = hashPassword(password);
      await db.update(users).set({ password_hash: newHash }).where(eq(users.id, resetRow.user_id));

      // Mark token as used
      await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, resetRow.id));

      res.json({ ok: true });
    } catch (err) {
      log.error("[auth] Reset password error:", { error: String(err) });
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  /**
   * POST /api/auth/link-chat-session
   * Links an anonymous website chat session to the authenticated user.
   * Called by the client after login to carry over pre-signup context.
   * Always returns 200 — failures are silent (best-effort linking).
   */
  app.post("/api/auth/link-chat-session", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { chatSessionId } = req.body;

      if (!chatSessionId || typeof chatSessionId !== "string" || chatSessionId.length > 100) {
        return res.json({ linked: false });
      }

      // Load the anonymous session's memory
      const memory = await getMemory(chatSessionId).catch(() => null);
      if (!memory || memory.messages.length === 0) {
        return res.json({ linked: false });
      }

      // Link chatMemory row to this user
      await linkSessionToUser(chatSessionId, userId);

      // Build a short journey summary from the conversation
      const signals = extractMemorySignals(memory.messages);
      const firstUserMsg = memory.messages.find((m) => m.role === "user")?.content;
      const msgCount = memory.messages.filter((m) => m.role === "user").length;
      const topics = signals.previousTopics?.length
        ? signals.previousTopics.join(", ")
        : null;

      const summaryParts: string[] = [];
      if (firstUserMsg) {
        const trimmed = firstUserMsg.length > 120
          ? firstUserMsg.slice(0, 120) + "…"
          : firstUserMsg;
        summaryParts.push(`Initial question: "${trimmed}"`);
      }
      if (topics) summaryParts.push(`Topics discussed: ${topics}`);
      if (signals.interestedInPricing) summaryParts.push("Showed interest in pricing");
      if (signals.interestedInBooking) summaryParts.push("Showed interest in booking a call");
      summaryParts.push(`${msgCount} message${msgCount === 1 ? "" : "s"} exchanged on the website`);

      const journeySummary = summaryParts.join(". ") + ".";

      // Store on client record (if one exists for this user)
      const [client] = await db
        .select({ id: clients.id, journey_summary: clients.journey_summary })
        .from(clients)
        .where(eq(clients.user_id, userId))
        .limit(1);

      if (client && !client.journey_summary) {
        // Only set if not already populated (don't overwrite)
        await db
          .update(clients)
          .set({ journey_summary: journeySummary, updated_at: new Date() })
          .where(eq(clients.id, client.id));
      }

      res.json({ linked: true });
    } catch (err) {
      log.error("[auth] Link chat session error:", { error: String(err) });
      res.json({ linked: false });
    }
  });

  /* ─── Profile update ─── */

  /**
   * PATCH /api/user/profile
   * Updates the current user's name and/or email.
   */
  app.patch("/api/user/profile", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { name, email } = req.body;

      const updates: Record<string, string> = {};
      if (typeof name === "string" && name.trim()) updates.name = name.trim();
      if (typeof email === "string" && email.trim()) {
        const normalised = email.toLowerCase().trim();
        // Check uniqueness
        const existing = await storage.getUserByEmail(normalised);
        if (existing && existing.id !== userId) {
          return res.status(409).json({ error: "Email already in use by another account" });
        }
        updates.email = normalised;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const updated = await storage.updateUser(userId, updates);
      if (!updated) return res.status(404).json({ error: "User not found" });

      // Refresh the session with new user data
      req.login({ id: updated.id, email: updated.email, role: updated.role, name: updated.name }, (err) => {
        if (err) log.error("[auth] Session refresh error:", err);
      });

      res.json({ user: { id: updated.id, email: updated.email, role: updated.role, name: updated.name } });
    } catch (err) {
      log.error("[auth] Profile update error:", { error: String(err) });
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  /* ─── Change password ─── */

  /**
   * POST /api/user/change-password
   * Requires current password verification. Sets a new password.
   */
  app.post("/api/user/change-password", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || typeof currentPassword !== "string") {
        return res.status(400).json({ error: "Current password is required" });
      }
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }

      // Fetch full user record (need password_hash)
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (!verifyPassword(currentPassword, user.password_hash)) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const newHash = hashPassword(newPassword);
      await db.update(users).set({ password_hash: newHash }).where(eq(users.id, userId));

      res.json({ ok: true });
    } catch (err) {
      log.error("[auth] Change password error:", { error: String(err) });
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  /* ─── User settings / preferences ─── */

  /**
   * GET /api/user/settings
   * Returns the current user's preferences stored in session.
   */
  app.get("/api/user/settings", requireAuth, (req, res) => {
    const sess = req.session as any;
    const settings = sess.userSettings || {
      businessName: "",
      contactEmail: req.user!.email,
      timezone: "Europe/London",
      emailNotifications: true,
      weeklyReports: true,
      aiAssistantEnabled: true,
    };
    res.json({ settings });
  });

  /**
   * PATCH /api/user/settings
   * Persists preferences in the session store (backed by connect-pg-simple).
   */
  app.patch("/api/user/settings", requireAuth, (req, res) => {
    const sess = req.session as any;
    const current = sess.userSettings || {
      businessName: "",
      contactEmail: req.user!.email,
      timezone: "Europe/London",
      emailNotifications: true,
      weeklyReports: true,
      aiAssistantEnabled: true,
    };

    const { businessName, contactEmail, timezone, emailNotifications, weeklyReports, aiAssistantEnabled } = req.body;

    if (typeof businessName === "string") current.businessName = businessName.trim();
    if (typeof contactEmail === "string") current.contactEmail = contactEmail.trim();
    if (typeof timezone === "string") current.timezone = timezone.trim();
    if (typeof emailNotifications === "boolean") current.emailNotifications = emailNotifications;
    if (typeof weeklyReports === "boolean") current.weeklyReports = weeklyReports;
    if (typeof aiAssistantEnabled === "boolean") current.aiAssistantEnabled = aiAssistantEnabled;

    sess.userSettings = current;
    req.session.save((err: Error | null) => {
      if (err) {
        log.error("[auth] Settings save error:", { error: String(err) });
        return res.status(500).json({ error: "Failed to save settings" });
      }
      res.json({ settings: current });
    });
  });
}
