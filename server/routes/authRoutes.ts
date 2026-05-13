import type { Express, Request } from "express";
import { randomBytes } from "crypto";
import passport from "passport";
import { requireAuth, requireAdmin, hashPassword, verifyPassword } from "../auth";
import { db } from "../db";
import { eq, and, gt } from "drizzle-orm";
import { users, passwordResetTokens, clients } from "@shared/schema";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";
import { sendPasswordResetEmail } from "../lib/passwordResetEmail";
import { authRateLimiter, passwordResetDedupeLimiter, magicLinkDedupeLimiter } from "../services/rateLimiter";
import { getMemory, linkSessionToUser, extractMemorySignals } from "../services/chatMemory";
import { storage } from "../storage";
import { generateSecret, verifyCode as verifyTotpCode } from "../services/totpService";
import { createLogger } from "../lib/logger";
import { verifyLoginToken, getCheckoutLoginToken, buildLoginToken, MAGIC_LINK_TTL } from "../lib/loginToken";
import { sendLoginLinkEmail } from "../lib/loginLinkEmail";
import { sendSelfServeWelcome } from "../lib/selfServeWelcomeEmail";

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

  /** Email/password login — with optional TOTP 2FA gate */
  app.post("/api/auth/login", async (req, res, next) => {
    const ip = getClientIp(req);
    if (!isTestRateLimitBypass(req) && !(await authRateLimiter.check(`login:${ip}`))) {
      return res.status(429).json({ error: "Too many login attempts. Please wait 15 minutes." });
    }
    passport.authenticate(
      "local",
      async (err: Error | null, user: Express.User | false, info: { message: string } | undefined) => {
        if (err) return next(err);
        if (!user) {
          return res.status(401).json({ error: info?.message || "Invalid credentials" });
        }

        // Check if 2FA is enabled for this user
        try {
          const [fullUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
          if (fullUser?.totp_enabled) {
            // Store pending 2FA user ID in session (do NOT log them in yet)
            const sess = req.session as any;
            sess.pending2faUserId = user.id;
            return req.session.save((saveErr: Error | null) => {
              if (saveErr) return next(saveErr);
              return res.json({ requires2fa: true });
            });
          }
        } catch (e) {
          log.error("Error checking 2FA status during login", { error: String(e) });
        }

        req.logIn(user, (loginErr) => {
          if (loginErr) return next(loginErr);
          return res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name } });
        });
      }
    )(req, res, next);
  });

  /* ─── Self-serve signup ─── */

  /**
   * POST /api/auth/signup
   * Creates a free client account and auto-logs the user in.
   */
  app.post("/api/auth/signup", async (req, res, next) => {
    try {
      const ip = getClientIp(req);
      if (!isTestRateLimitBypass(req) && !(await authRateLimiter.check(`signup:${ip}`))) {
        return res.status(429).json({ error: "Too many signup attempts. Please wait 15 minutes." });
      }

      const { email, password, name, businessName, phone } = req.body;

      // Validate required fields
      if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: "A valid email address is required" });
      }
      if (!password || typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Your name is required" });
      }
      if (!businessName || typeof businessName !== "string" || !businessName.trim()) {
        return res.status(400).json({ error: "Business name is required" });
      }

      const normalised = email.toLowerCase().trim();

      // Check email uniqueness
      const existingUser = await storage.getUserByEmail(normalised);
      if (existingUser) {
        return res.status(409).json({ error: "An account with this email already exists. Please log in instead." });
      }

      // Create user
      const passwordHash = hashPassword(password);
      const user = await storage.createUser({
        email: normalised,
        password_hash: passwordHash,
        name: name.trim(),
        role: "client",
      });

      // Create linked client record
      const client = await storage.createClient({
        business_name: businessName.trim(),
        contact_name: name.trim(),
        contact_email: normalised,
        contact_phone: phone?.trim() || null,
        user_id: user.id,
        status: "lead",
        source: "website",
      });

      log.info("Self-serve signup completed", { userId: user.id, clientId: client.id });

      await storage.logAdminActivity({
        actor_type: "system",
        actor_name: "Self-Serve Signup",
        action: "client.signup",
        entity_type: "client",
        entity_id: client.id,
        summary: `Free account created for "${businessName.trim()}" (${normalised})`,
      });

      // Fire welcome email (non-blocking; signup must succeed even if SMTP down)
      sendSelfServeWelcome({ user, client }).catch((err) =>
        log.warn("[signup] self-serve welcome email failed", { userId: user.id, error: err?.message }),
      );

      // Auto-login
      const sessionUser: Express.User = { id: user.id, email: user.email, role: user.role, name: user.name };
      req.logIn(sessionUser, (loginErr) => {
        if (loginErr) return next(loginErr);
        return res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name } });
      });
    } catch (err) {
      log.error("Signup error", { error: String(err) });
      res.status(500).json({ error: "Failed to create account. Please try again." });
    }
  });

  /* ─── Token-based login (post-checkout auto-login) ─── */

  /**
   * POST /api/auth/token-login
   * Verifies a one-time HMAC-signed login token and logs the user in.
   * Used after Stripe checkout to auto-login customers.
   */
  app.post("/api/auth/token-login", async (req, res, next) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ error: "Login token is required" });
      }

      const payload = verifyLoginToken(token);
      if (!payload) {
        return res.status(401).json({ error: "Invalid or expired login token" });
      }

      const user = await storage.getUserById(payload.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const sessionUser: Express.User = { id: user.id, email: user.email, role: user.role, name: user.name };
      req.logIn(sessionUser, (loginErr) => {
        if (loginErr) return next(loginErr);
        log.info("Token-based login completed", { userId: user.id });
        return res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name } });
      });
    } catch (err) {
      log.error("Token login error", { error: String(err) });
      res.status(500).json({ error: "Login failed" });
    }
  });

  /**
   * POST /api/auth/checkout-login
   * Exchanges a Stripe checkout session_id for an auto-login.
   * The webhook stores a one-time token keyed by session ID after
   * ensuring the portal account; this endpoint retrieves and verifies it.
   */
  app.post("/api/auth/checkout-login", async (req, res, next) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId || typeof sessionId !== "string") {
        return res.status(400).json({ error: "Session ID is required" });
      }

      const token = getCheckoutLoginToken(sessionId);
      if (!token) {
        // Token not found — webhook may not have fired yet, or already consumed
        return res.status(404).json({ error: "No login token found for this session. Please log in manually." });
      }

      const payload = verifyLoginToken(token);
      if (!payload) {
        return res.status(401).json({ error: "Login token expired" });
      }

      const user = await storage.getUserById(payload.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }

      const sessionUser: Express.User = { id: user.id, email: user.email, role: user.role, name: user.name };
      req.logIn(sessionUser, (loginErr) => {
        if (loginErr) return next(loginErr);
        log.info("Checkout auto-login completed", { userId: user.id, sessionId });
        return res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name } });
      });
    } catch (err) {
      log.error("Checkout login error", { error: String(err) });
      res.status(500).json({ error: "Auto-login failed" });
    }
  });

  /** Verify TOTP code after initial login (2FA step 2) */
  app.post("/api/auth/verify-2fa", async (req, res) => {
    try {
      const sess = req.session as any;
      const pendingUserId = sess.pending2faUserId;
      if (!pendingUserId) {
        return res.status(401).json({ error: "No pending 2FA verification. Please log in first." });
      }

      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "Verification code is required" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, pendingUserId)).limit(1);
      if (!user || !user.totp_enabled || !user.totp_secret) {
        delete sess.pending2faUserId;
        return res.status(401).json({ error: "2FA is not configured for this account" });
      }

      if (!verifyTotpCode(user.totp_secret, code)) {
        return res.status(401).json({ error: "Invalid verification code" });
      }

      // Clear pending state and complete login
      delete sess.pending2faUserId;

      const sessionUser: Express.User = { id: user.id, email: user.email, role: user.role, name: user.name };
      req.logIn(sessionUser, (loginErr) => {
        if (loginErr) {
          log.error("Error completing 2FA login", { error: String(loginErr) });
          return res.status(500).json({ error: "Failed to complete login" });
        }
        return res.json({ user: { id: user.id, email: user.email, role: user.role, name: user.name } });
      });
    } catch (err) {
      log.error("2FA verification error", { error: String(err) });
      res.status(500).json({ error: "Failed to verify 2FA code" });
    }
  });

  /** Logout */
  app.post("/api/auth/logout", requireAuth, (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.json({ ok: true });
    });
  });

  /**
   * POST /api/auth/request-link
   * Magic-link sign-in. Generates a 15-minute HMAC-signed login
   * token, emails it, and always returns 200 — never reveals
   * whether the email exists (prevents enumeration). The recipient
   * clicks the link, the front-end posts the token to
   * /api/auth/token-login, and Passport logs them in.
   *
   * Rate-limited the same way as /api/auth/forgot-password to
   * prevent abuse / inbox spam.
   */
  app.post("/api/auth/request-link", async (req, res) => {
    try {
      const ip = getClientIp(req);
      if (!(await authRateLimiter.check(`magic:${ip}`))) {
        return res.status(429).json({ error: "Too many sign-in attempts. Please wait 15 minutes." });
      }

      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }
      const normalised = email.trim().toLowerCase();

      const [user] = await db.select().from(users).where(eq(users.email, normalised)).limit(1);

      /* User exists → mint a token + send. User does NOT exist →
       * still return 200, never indicate whether the address is on
       * file. We log the miss so ops can spot abuse patterns. */
      if (user) {
        // Per-user dedupe: silently suppress duplicate sends within 60s so
        // double-clicks don't land two valid tokens in the inbox.
        if (!(await magicLinkDedupeLimiter.check(`magic-dedupe:${user.id}`))) {
          log.info("magic link send deduped (recent token still valid)", { userId: user.id });
        } else {
          const token = buildLoginToken(user.id, MAGIC_LINK_TTL);
          const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
          const signInUrl = `${baseUrl}/login?token=${encodeURIComponent(token)}`;

          const sent = await sendLoginLinkEmail({
            to: normalised,
            signInUrl,
            recipientName: user.name ?? null,
          });
          if (!sent) {
            /* Email delivery failed for a real user — surface in logs
             * so you can chase deliverability without leaking to the
             * caller. */
            log.warn("magic link generated but email send failed", { userId: user.id });
          }
        }
      } else {
        log.info("magic link requested for unknown email", { email: normalised });
      }

      res.json({ ok: true });
    } catch (err) {
      log.error("Request-link error", { error: String(err) });
      /* Even on internal errors we 200 to preserve the no-
       * enumeration property — error is logged for ops. */
      res.json({ ok: true });
    }
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

      // Per-user dedupe: silently suppress duplicate sends within 60s so
      // double-clicks don't issue two valid reset tokens (existing token
      // is still valid for the rest of its 1h TTL).
      if (!(await passwordResetDedupeLimiter.check(`pwreset-dedupe:${user.id}`))) {
        log.info("password reset send deduped (recent token still valid)", { userId: user.id });
        return res.json({ ok: true });
      }

      // Generate token (32 bytes = 64 hex chars)
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db.insert(passwordResetTokens).values({
        user_id: user.id,
        token,
        expires_at: expiresAt,
      });

      // Send email
      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      const sent = await sendPasswordResetEmail({
        to: normalised,
        resetUrl,
        recipientName: user.name ?? null,
      });
      if (!sent) {
        log.warn("SMTP not configured — password reset email NOT sent", { userId: user.id });
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
        log.error("Settings save error", { error: String(err) });
        return res.status(500).json({ error: "Failed to save settings" });
      }
      res.json({ settings: current });
    });
  });

  /* ─── Two-Factor Authentication (TOTP) ─── */

  /** POST /api/user/2fa/setup — generates TOTP secret */
  app.post("/api/user/2fa/setup", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.totp_enabled) return res.status(400).json({ error: "Two-factor authentication is already enabled" });

      const { secret, otpauthUrl } = generateSecret(user.email);
      await db.update(users).set({ totp_secret: secret }).where(eq(users.id, userId));
      res.json({ otpauthUrl, secret });
    } catch (err) {
      log.error("2FA setup error", { error: String(err) });
      res.status(500).json({ error: "Failed to set up two-factor authentication" });
    }
  });

  /** POST /api/user/2fa/verify-setup — verifies first code, enables 2FA */
  app.post("/api/user/2fa/verify-setup", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { code } = req.body;
      if (!code || typeof code !== "string") return res.status(400).json({ error: "Verification code is required" });

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (user.totp_enabled) return res.status(400).json({ error: "Two-factor authentication is already enabled" });
      if (!user.totp_secret) return res.status(400).json({ error: "No 2FA setup in progress. Please initiate setup first." });

      if (!verifyTotpCode(user.totp_secret, code)) {
        return res.status(401).json({ error: "Invalid verification code. Please try again." });
      }

      await db.update(users).set({ totp_enabled: true }).where(eq(users.id, userId));
      log.info("2FA enabled for user", { userId });
      res.json({ ok: true, message: "Two-factor authentication has been enabled" });
    } catch (err) {
      log.error("2FA verify-setup error", { error: String(err) });
      res.status(500).json({ error: "Failed to enable two-factor authentication" });
    }
  });

  /** POST /api/user/2fa/disable — requires password + TOTP code */
  app.post("/api/user/2fa/disable", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const { password, code } = req.body;
      if (!password || typeof password !== "string") return res.status(400).json({ error: "Current password is required" });
      if (!code || typeof code !== "string") return res.status(400).json({ error: "Verification code is required" });

      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) return res.status(404).json({ error: "User not found" });
      if (!user.totp_enabled || !user.totp_secret) return res.status(400).json({ error: "Two-factor authentication is not enabled" });

      if (!verifyPassword(password, user.password_hash)) return res.status(401).json({ error: "Incorrect password" });
      if (!verifyTotpCode(user.totp_secret, code)) return res.status(401).json({ error: "Invalid verification code" });

      await db.update(users).set({ totp_enabled: false, totp_secret: null }).where(eq(users.id, userId));
      log.info("2FA disabled for user", { userId });
      res.json({ ok: true, message: "Two-factor authentication has been disabled" });
    } catch (err) {
      log.error("2FA disable error", { error: String(err) });
      res.status(500).json({ error: "Failed to disable two-factor authentication" });
    }
  });

  /** GET /api/user/2fa/status — check if 2FA is enabled */
  app.get("/api/user/2fa/status", requireAuth, async (req, res) => {
    try {
      const userId = req.user!.id;
      const [user] = await db.select({ totp_enabled: users.totp_enabled }).from(users).where(eq(users.id, userId)).limit(1);
      res.json({ enabled: !!user?.totp_enabled });
    } catch (err) {
      log.error("2FA status check error", { error: String(err) });
      res.status(500).json({ error: "Failed to check 2FA status" });
    }
  });
}
