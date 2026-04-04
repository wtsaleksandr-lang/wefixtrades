import type { Express } from "express";
import { randomBytes } from "crypto";
import passport from "passport";
import { requireAuth, hashPassword, verifyPassword } from "../auth";
import { db } from "../db";
import { eq, and, gt } from "drizzle-orm";
import { users, passwordResetTokens } from "@shared/schema";
import { getEmailTransporter, getFromAddress } from "../lib/emailTransport";

export function registerAuthRoutes(app: Express) {
  /** Current session user (or null) */
  app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.user ?? null });
  });

  /** Email/password login */
  app.post("/api/auth/login", (req, res, next) => {
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
          from: getFromAddress(),
          to: normalised,
          subject: "Reset your WeFixTrades password",
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
              <h2 style="color: #1a1a1a; font-size: 18px;">Reset your password</h2>
              <p style="color: #555; font-size: 14px; line-height: 1.6;">
                Click the link below to set a new password. This link expires in 1 hour.
              </p>
              <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #2D6A4F; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 500; margin: 16px 0;">
                Reset Password
              </a>
              <p style="color: #999; font-size: 12px; margin-top: 24px;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </div>
          `,
        });
      } else {
        console.warn("[auth] SMTP not configured — reset token:", token);
      }

      res.json({ ok: true });
    } catch (err) {
      console.error("[auth] Forgot password error:", err);
      res.json({ ok: true }); // Don't leak errors
    }
  });

  /**
   * POST /api/auth/reset-password
   * Validates token and sets new password.
   */
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
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
      console.error("[auth] Reset password error:", err);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
}
