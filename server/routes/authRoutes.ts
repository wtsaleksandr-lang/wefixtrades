import type { Express } from "express";
import passport from "passport";
import { requireAuth } from "../auth";

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
}
