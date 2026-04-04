import { pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { storage } from "./storage";
import type { Request, Response, NextFunction } from "express";

/* ─── Type declarations ─── */
declare global {
  namespace Express {
    interface User {
      id: number;
      email: string;
      role: string;
      name: string | null;
    }
  }
}

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
  if (req.user.role !== "client") return res.status(403).json({ error: "Client portal access required" });
  // client_id resolution happens in the route handler via req.user.id
  next();
}
