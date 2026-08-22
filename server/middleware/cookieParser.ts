/**
 * Cookie parsing middleware.
 *
 * Express does NOT populate `req.cookies` on its own, and this repo does not
 * ship `cookie-parser` (node_modules here is a shared junction we must not
 * mutate). Several request handlers READ `req.cookies` — most importantly the
 * referral/affiliate attribution layer (server/affiliate/attribution.ts reads
 * the `wft_ref` cookie on every signup) and the SEO-integration OAuth
 * state-cookie check (server/routes/adminSeoIntegrationsRoutes.ts). Without a
 * parser mounted, `req.cookies` is always `undefined`, so the `wft_ref` cookie
 * is written by `res.cookie(...)` but never read back — every referral silently
 * fails to attribute.
 *
 * This is a tiny, dependency-free RFC-6265 header splitter (equivalent to
 * `cookie-parser` for the read paths this app uses). It is exported as a
 * standalone pure function so it can be unit-tested without booting Express.
 */
import type { Request, Response, NextFunction } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      cookies?: Record<string, string>;
    }
  }
}

/**
 * Parse a raw `Cookie:` request-header value into a `{ name: value }` map.
 * First occurrence of a name wins (matches browser + cookie-parser behaviour).
 * Never throws — malformed percent-encoding keeps the raw value.
 */
export function parseCookieHeader(header: string | undefined | null): Record<string, string> {
  const jar: Record<string, string> = {};
  if (!header) return jar;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue; // no name, or empty name — skip
    const key = part.slice(0, eq).trim();
    if (!key || Object.prototype.hasOwnProperty.call(jar, key)) continue;
    let val = part.slice(eq + 1).trim();
    // Strip a single pair of surrounding double quotes (quoted-string form).
    if (val.length >= 2 && val.charCodeAt(0) === 34 && val.charCodeAt(val.length - 1) === 34) {
      val = val.slice(1, -1);
    }
    let decoded = val;
    try {
      decoded = decodeURIComponent(val);
    } catch {
      decoded = val; // malformed %-encoding — keep the raw cookie value
    }
    jar[key] = decoded;
  }
  return jar;
}

/** Express middleware: populate `req.cookies` from the `Cookie` header. */
export function cookieParser(req: Request, _res: Response, next: NextFunction): void {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
}
