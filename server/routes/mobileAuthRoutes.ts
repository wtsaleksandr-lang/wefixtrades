/**
 * Mobile auth endpoints — used by the React Native softphone app.
 *
 *   POST /api/auth/mobile/token       email+password → { accessToken, refreshToken, user }
 *   POST /api/auth/mobile/refresh     { refreshToken } → rotated pair + user
 *   POST /api/auth/mobile/logout      { refreshToken } → revokes that token
 *   POST /api/auth/mobile/logout-all  Bearer auth → revokes every active token for the user
 *   GET  /api/auth/mobile/me          Bearer auth → echoes current user payload
 *
 * Rate-limited via the same authRateLimiter the web login uses.
 */

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { verifyPassword } from "../auth";
import {
  issueAccessToken,
  issueRefreshToken,
  validateRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  requireSessionOrBearer,
  touchRefreshRow,
  ACCESS_TOKEN_TTL_SEC,
} from "../lib/mobileAuth";
import { authRateLimiter } from "../services/rateLimiter";
import { createLogger } from "../lib/logger";

const log = createLogger("MobileAuthRoutes");

function getIp(req: Request): string | null {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
}

export function registerMobileAuthRoutes(app: Express) {
  const tokenBody = z.object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(200),
    deviceLabel: z.string().max(200).optional(),
  });

  app.post(
    "/api/auth/mobile/token",
    async (req: Request, res: Response) => {
      try {
        const ip = getIp(req) ?? "unknown";
        if (!(await authRateLimiter.check(`mobile-token:${ip}`))) {
          return res.status(429).json({ error: "Too many requests — try again later" });
        }

        const parsed = tokenBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

        const user = await storage.getUserByEmail(parsed.data.email.toLowerCase().trim());
        if (!user) return res.status(401).json({ error: "Invalid email or password" });
        if (!verifyPassword(parsed.data.password, user.password_hash)) {
          return res.status(401).json({ error: "Invalid email or password" });
        }

        const accessToken = issueAccessToken({
          sub: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
        });
        const refresh = await issueRefreshToken({
          userId: user.id,
          deviceLabel: parsed.data.deviceLabel ?? (req.headers["user-agent"] as string | undefined) ?? null,
          ip: getIp(req),
        });

        return res.json({
          accessToken,
          refreshToken: refresh.token,
          expiresIn: ACCESS_TOKEN_TTL_SEC,
          refreshExpiresAt: refresh.expiresAt.toISOString(),
          user: { id: user.id, email: user.email, role: user.role, name: user.name },
        });
      } catch (err) {
        log.error("token issue failed", { err: (err as Error).message });
        res.status(500).json({ error: "Token issue failed" });
      }
    },
  );

  const refreshBody = z.object({ refreshToken: z.string().min(20).max(200) });

  app.post(
    "/api/auth/mobile/refresh",
    async (req: Request, res: Response) => {
      try {
        const ip = getIp(req) ?? "unknown";
        if (!(await authRateLimiter.check(`mobile-refresh:${ip}`))) {
          return res.status(429).json({ error: "Too many requests — try again later" });
        }

        const parsed = refreshBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

        const validated = await validateRefreshToken(parsed.data.refreshToken);
        if (!validated) return res.status(401).json({ error: "Invalid or expired refresh token" });

        // Touch (last_used_at) — useful for "log out idle devices" UI later.
        await touchRefreshRow(validated.rowId);

        // Rotate: revoke old, issue new in one txn.
        const rotated = await rotateRefreshToken({
          oldRowId: validated.rowId,
          userId: validated.userId,
          deviceLabel: (req.headers["user-agent"] as string | undefined) ?? null,
          ip: getIp(req),
        });

        const accessToken = issueAccessToken({
          sub: validated.userId,
          email: validated.email,
          role: validated.role,
          name: validated.name,
        });

        return res.json({
          accessToken,
          refreshToken: rotated.token,
          expiresIn: ACCESS_TOKEN_TTL_SEC,
          refreshExpiresAt: rotated.expiresAt.toISOString(),
          user: {
            id: validated.userId,
            email: validated.email,
            role: validated.role,
            name: validated.name,
          },
        });
      } catch (err) {
        log.error("refresh failed", { err: (err as Error).message });
        res.status(500).json({ error: "Refresh failed" });
      }
    },
  );

  const logoutBody = z.object({ refreshToken: z.string().min(20).max(200) });

  app.post(
    "/api/auth/mobile/logout",
    async (req: Request, res: Response) => {
      try {
        const parsed = logoutBody.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
        await revokeRefreshToken(parsed.data.refreshToken);
        return res.json({ ok: true });
      } catch (err) {
        log.error("logout failed", { err: (err as Error).message });
        res.status(500).json({ error: "Logout failed" });
      }
    },
  );

  app.post(
    "/api/auth/mobile/logout-all",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      try {
        const userId = (req.user as any)?.id;
        if (!userId) return res.status(401).json({ error: "Authentication required" });
        const revoked = await revokeAllForUser(userId);
        return res.json({ ok: true, revoked });
      } catch (err) {
        log.error("logout-all failed", { err: (err as Error).message });
        res.status(500).json({ error: "Logout-all failed" });
      }
    },
  );

  app.get(
    "/api/auth/mobile/me",
    requireSessionOrBearer,
    async (req: Request, res: Response) => {
      const u = req.user as any;
      return res.json({ id: u.id, email: u.email, role: u.role, name: u.name });
    },
  );

  log.info("Mobile auth routes registered");
}
