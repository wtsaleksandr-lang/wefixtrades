// Doppler bootstrap — MUST be the first import. Fills process.env from the
// Doppler vault before any other module reads env-vars at import time
// (server/db.ts throws on missing DATABASE_URL, etc.). Side-effect only.
import "./bootstrapDoppler";
import "dotenv/config";
import * as Sentry from "@sentry/node";
import { initAnalytics, shutdownAnalytics } from "./lib/analytics";
import { initObjectStorage } from "./lib/objectStorage";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
}

initAnalytics();
// Fail-fast on bill-encryption key misconfiguration. Asymmetric with
// initAnalytics() — analytics absence is acceptable degradation,
// bill encryption absence breaks a user-facing feature.
initObjectStorage();
process.on("SIGTERM", () => { void shutdownAnalytics(); });
process.on("SIGINT", () => { void shutdownAnalytics(); });

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import path from "path";
import { registerRoutes } from "./routes/index";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initScheduler } from "./jobs/scheduler";
import { pool } from "./db";
import { setupPassport } from "./auth";
import { createLogger } from "./lib/logger";

const logger = createLogger("Server");

/* ─── Startup Environment Validation ─── */
function validateEnv(): void {
  const isProduction = process.env.NODE_ENV === "production";

  const critical = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "STRIPE_SECRET_KEY",
    "STRIPE_BILLING_WEBHOOK_SECRET",
    "ANTHROPIC_API_KEY",
  ];

  const missing = critical.filter((key) => !process.env[key]);

  if (missing.length === 0) {
    // No missing critical vars — continue to dev-tool guard below
  } else if (isProduction) {
    logger.error(
      "FATAL: Missing required environment variables in production: " +
        missing.join(", "),
    );
    process.exit(1);
  } else {
    logger.warn(
      "Missing environment variables (non-fatal in development): " +
        missing.join(", "),
    );
  }

  /* ─── QuoteQuick Stripe price sanity check ─── */
  if (process.env.STRIPE_SECRET_KEY) {
    const qqPriceVars = [
      "STRIPE_PRICE_QQ_SOLO_MONTHLY",
      "STRIPE_PRICE_QQ_SOLO_ANNUAL",
      "STRIPE_PRICE_QQ_BUSINESS_MONTHLY",
      "STRIPE_PRICE_QQ_BUSINESS_ANNUAL",
    ];
    const missingQq = qqPriceVars.filter((key) => !process.env[key]);
    if (missingQq.length > 0) {
      logger.warn(
        "QuoteQuick Stripe price IDs missing (QQ checkout will fail for those tiers): " +
          missingQq.join(", "),
      );
    }
  }

  /* ─── Dev-tool guard: these flags must NEVER be set in production ─── */
  if (isProduction && process.env.DEV_TOOLS_ENABLED) {
    logger.error(
      "FATAL: DEV_TOOLS_ENABLED is set in production. " +
        "This exposes internal dev/test endpoints. Remove it and restart.",
    );
    process.exit(1);
  }

  /* ─── API base override guard: prevent prod traffic hitting test stubs ─── */
  if (isProduction) {
    const overrideVars = [
      "GBP_API_BASE_OVERRIDE",
      "GBP_POST_API_BASE_OVERRIDE",
      "FB_GRAPH_API_BASE_OVERRIDE",
      "IG_GRAPH_API_BASE_OVERRIDE",
      "IMAGE_API_BASE_OVERRIDE",
    ];
    const setOverrides = overrideVars.filter((key) => process.env[key]);
    if (setOverrides.length > 0) {
      logger.error(
        "FATAL: API base override variables are set in production: " +
          setOverrides.join(", ") +
          ". These redirect live traffic to test endpoints. Remove them and restart.",
      );
      process.exit(1);
    }
  }
}

validateEnv();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

/* ─── Security headers (helmet) ───
 *
 * Defense-in-depth HTTP headers. Adds HSTS, X-Content-Type-Options,
 * Referrer-Policy, X-DNS-Prefetch-Control, Cross-Origin-Opener-Policy,
 * and friends. Opt-outs explained below.
 *
 *   1. contentSecurityPolicy is set in REPORT-ONLY mode below.
 *      Violations are logged via /api/csp-report but not enforced yet.
 *      Once we've collected ~a week of violation reports and refined
 *      the allowlist, we'll graduate to enforce-mode in a follow-up.
 *
 *   2. crossOriginEmbedderPolicy: false
 *      Would block legitimate cross-origin iframes/scripts the marketing
 *      surface relies on.
 *
 *   3. frameguard: false  (X-Frame-Options NOT set globally)
 *      The QuoteQuick widget at /Calculator?...&embed=true is designed
 *      to be iframed on customer websites. Clickjacking protection on
 *      /admin and /portal is set per-route (see denyFrameEmbedding).
 *
 *   4. crossOriginResourcePolicy: false
 *      Helmet's default is "same-origin", which would block
 *      embed-widget.js / embed-chat.js / /Calculator from being loaded
 *      cross-origin (customer.com -> wefixtrades.com). We re-set CORP
 *      per-route below so admin/portal stay locked down but embed assets
 *      remain reachable.
 *
 * strictTransportSecurity (HSTS) at default: 180 days. Safe — the app
 * is exclusively HTTPS in production behind Replit's TLS-terminating LB.
 */
app.use(
  helmet({
    contentSecurityPolicy: false,           // see CSP-Report-Only block below
    crossOriginEmbedderPolicy: false,
    frameguard: false,
    crossOriginResourcePolicy: false,       // see per-route CORP below
  }),
);

/* ─── CSP — Report-Only mode ───
 *
 * Tight content-security policy that ALLOWS the third parties our
 * marketing + portal pages actually load (Google Fonts, Fontshare, Vapi,
 * Sentry, PostHog) and rejects everything else. Currently in
 * Report-Only mode (header is Content-Security-Policy-Report-Only) —
 * browsers will REPORT violations to /api/csp-report but not BLOCK
 * them. This lets us collect real-world violation data before
 * graduating to enforce-mode.
 *
 * 'unsafe-inline' is included for script-src + style-src because the
 * codebase has many <style>{`...`}</style> blocks + inline style attrs
 * + JSX-injected style strings (gsap, framer-motion). Tightening that
 * out is a separate refactor.
 */
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",                          // gsap and similar libs eval at runtime
    "https://us.i.posthog.com",
    "https://eu.i.posthog.com",
    "https://*.posthog.com",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
    "https://*.vapi.ai",
  ],
  styleSrc: [
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
    "https://api.fontshare.com",
    "https://*.fontshare.com",
  ],
  fontSrc: [
    "'self'",
    "data:",
    "https://fonts.gstatic.com",
    "https://api.fontshare.com",
    "https://*.fontshare.com",
  ],
  imgSrc: [
    "'self'",
    "data:",
    "blob:",
    "https:",                                 // permissive — we render arbitrary GBP photos, OG previews, etc.
  ],
  connectSrc: [
    "'self'",
    "https://us.i.posthog.com",
    "https://eu.i.posthog.com",
    "https://*.posthog.com",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
    "https://api.vapi.ai",
    "https://*.vapi.ai",
    "wss://api.vapi.ai",
    "wss://*.vapi.ai",
  ],
  frameSrc: [
    "'self'",
    "https://js.stripe.com",                  // 3DS / Stripe iframes if ever embedded
    "https://hooks.stripe.com",
    "https://*.vapi.ai",
  ],
  workerSrc: ["'self'", "blob:"],
  manifestSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'", "https://checkout.stripe.com"],
  // frame-ancestors NOT set — let X-Frame-Options per-route handle clickjacking
  // (CSP frame-ancestors would shadow our per-route X-Frame-Options DENY on /admin).
  reportUri: ["/api/csp-report"],
};
app.use(
  helmet.contentSecurityPolicy({
    directives: cspDirectives,
    reportOnly: true,
  }),
);

/* ─── CSP report endpoint ───
 *
 * Browser POSTs JSON here whenever CSP-Report-Only sees a violation.
 * We log via createLogger so violations show up in normal deploy logs.
 * Body type varies (application/csp-report vs application/json depending
 * on browser); accept both. Always 204 — we don't want the browser to
 * retry / surface errors to the user.
 */
app.post(
  "/api/csp-report",
  express.json({ type: ["application/csp-report", "application/json", "*/*"], limit: "16kb" }),
  (req: Request, res: Response) => {
    const report = (req.body && (req.body["csp-report"] || req.body)) || {};
    logger.info("[csp-report] violation", {
      "blocked-uri": report["blocked-uri"],
      "violated-directive": report["violated-directive"],
      "document-uri": report["document-uri"],
      "effective-directive": report["effective-directive"],
      "source-file": report["source-file"],
      "line-number": report["line-number"],
    });
    res.status(204).end();
  },
);

/* ─── Per-route CORP ───
 *
 * helmet's CORP default is "same-origin", which would block
 * cross-origin loads of our embed assets. Customer.com pages need to
 * load /embed-widget.js (as <script>) + /Calculator (as iframe src).
 * Mark those routes as "cross-origin" (i.e., world-readable as a static
 * resource). Admin + portal stay locked down.
 */
const corpCrossOrigin = (_: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
};
const corpSameOrigin = (_: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
};
// Embed assets: world-readable
app.use("/embed-widget.js", corpCrossOrigin);
app.use("/embed-chat.js", corpCrossOrigin);
app.use("/Calculator", corpCrossOrigin);
// Sensitive surfaces: locked down (matches the X-Frame-Options below)
app.use("/admin", corpSameOrigin);
app.use("/portal", corpSameOrigin);
app.use("/api/admin", corpSameOrigin);
app.use("/api/portal", corpSameOrigin);

/* ─── CORS ───
 *
 * Strict allowlist. Same-origin requests aren't subject to CORS at all,
 * so this only matters for browser-initiated cross-origin requests. The
 * QuoteQuick embed iframe is same-origin (the iframe loads
 * wefixtrades.com/Calculator), so API calls from inside the iframe are
 * NOT cross-origin. Server-to-server webhooks (Stripe, SendGrid,
 * Twilio) don't involve CORS.
 *
 * Allowed origins: wefixtrades.com + .ca apex/www, plus localhost and
 * Replit dev hosts for development.
 */
const corsAllowlist = [
  "https://wefixtrades.com",
  "https://www.wefixtrades.com",
  "https://wefixtrades.ca",
  "https://www.wefixtrades.ca",
];
const corsAllowDevRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$|\.replit\.dev$/;
app.use(
  cors({
    origin: (origin, cb) => {
      // Same-origin requests have no Origin header; allow.
      if (!origin) return cb(null, true);
      if (corsAllowlist.includes(origin)) return cb(null, true);
      if (corsAllowDevRegex.test(origin)) return cb(null, true);
      logger.info("[cors] rejected cross-origin request", { origin });
      return cb(new Error("CORS: origin not allowed"));
    },
    credentials: true,
  }),
);

/* ─── Per-route frame protection (clickjacking) ───
 *
 * helmet's global frameguard is OFF (above) because the QuoteQuick widget
 * at /Calculator?...&embed=true must be iframe-able on customer websites.
 * But /admin and /portal are sensitive surfaces — no one should be
 * iframing them. Set X-Frame-Options: DENY explicitly here.
 *
 * Applies to both API routes (/api/admin/*, /api/portal/*) and the SPA
 * fallback paths (/admin/*, /portal/*) since Express middleware runs
 * before serveStatic.
 */
const denyFrameEmbedding = (_: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Frame-Options", "DENY");
  next();
};
app.use("/admin", denyFrameEmbedding);
app.use("/portal", denyFrameEmbedding);
app.use("/api/admin", denyFrameEmbedding);
app.use("/api/portal", denyFrameEmbedding);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

/* ─── Session + Passport ─── */
const PgStore = connectPgSimple(session);

// SESSION_SECRET: hard-fail in production (also caught by validateEnv above),
// fall back to dev-only default otherwise with a warning.
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret && process.env.NODE_ENV === "production") {
  logger.error("FATAL: SESSION_SECRET is not set. Refusing to start in production.");
  process.exit(1);
}
if (!sessionSecret) {
  logger.warn("SESSION_SECRET not set — using insecure dev default. Do NOT run this in production.");
}

/* Session middleware is shared with Socket.IO via initRealtime so
 * WebSocket connections see the same session cookie as HTTP. */
export const sessionMiddleware = session({
  store: new PgStore({ pool, createTableIfMissing: true }),
  secret: sessionSecret || "wft-dev-secret-change-in-prod",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  },
});

// Trust Replit's HTTPS-terminating load balancer so req.secure reflects the original
// https:// scheme. Without this, express-session sees an HTTP connection behind the
// proxy and silently drops the secure-flag cookie — breaking every login flow.
app.set("trust proxy", 1);

app.use(sessionMiddleware);
setupPassport();
app.use(passport.initialize());
app.use(passport.session());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger.info(`${formattedTime} [${source}] ${message}`);
}

/* ─── Serve uploaded deliverables ─── */
app.use("/uploads", express.static(path.join(process.cwd(), "data", "uploads")));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: unknown;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (!path.startsWith("/api")) return;

    let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

    if (capturedJsonResponse && process.env.LOG_LEVEL === "debug") {
      if (typeof capturedJsonResponse === "object" && capturedJsonResponse !== null) {
        const obj = capturedJsonResponse as Record<string, unknown>;
        const keys = Object.keys(obj);
        const sample: Record<string, string> = {};
        for (const key of keys.slice(0, 5)) {
          const val = obj[key];
          const type = Array.isArray(val) ? "array" : typeof val;
          sample[key] = type;
        }
        logLine += ` :: keys=${JSON.stringify(keys.slice(0, 5))} sampleTypes=${JSON.stringify(sample)}`;
      } else {
        logLine += ` :: type=${typeof capturedJsonResponse}`;
      }
    }

    log(logLine);
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  /* Real-time push. Attached to the same HTTP server so Socket.IO
   * shares Express's port and session cookie. Must run after
   * registerRoutes so any boot-time logAdminActivity calls have
   * a chance to find the io instance via getRealtime(). */
  const { initRealtime } = await import("./realtime");
  initRealtime(httpServer, sessionMiddleware);

  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    logger.error("Internal Server Error", { error: String(err) });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
      initScheduler();
    },
  );

  // Exec server: dev-only remote shell tool (port 5001).
  // Gated on NODE_ENV so esbuild dead-code-eliminates it from dist/index.cjs.
  if (process.env.NODE_ENV !== "production") {
    import("./exec-server").catch((e) =>
      console.error("[exec-server] Failed to start:", e)
    );
  }
})();
