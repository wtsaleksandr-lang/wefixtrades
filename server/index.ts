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
    // Release tagging lets Sentry group regressions per-deploy. Falls
    // back through the same chain as /api/healthz so the two stay in sync.
    release:
      process.env.SENTRY_RELEASE ??
      process.env.GIT_SHA ??
      process.env.REPL_DEPLOYMENT_ID ??
      process.env.SOURCE_VERSION ??
      undefined,
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
import { setupPassport, impersonationMiddleware } from "./auth";
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
    // Wave Q — three-tier ladder. Starter price vars are legacy and only
    // honoured for grandfathered subs; missing them is no longer a warn.
    const qqPriceVars = [
      "STRIPE_PRICE_QQ_PRO_MONTHLY",
      "STRIPE_PRICE_QQ_PRO_ANNUAL",
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

  /* ─── ReputationShield env sanity check ───
     RS fails silently per-customer when these are unset (review
     ingestion / token encryption / request delivery all no-op).
     Warn loudly at boot rather than discovering it via a support
     ticket. Non-fatal — RS isn't the whole platform. */
  {
    const rsVars: Array<{ key: string; impact: string }> = [
      { key: "OUTSCRAPER_API_KEY", impact: "Google/Facebook review ingestion is dead" },
      { key: "TOKEN_ENCRYPTION_KEY", impact: "Google Business OAuth connect breaks" },
      { key: "SMTP_HOST", impact: "review-request + report emails won't send" },
    ];
    const missingRs = rsVars.filter(({ key }) => !process.env[key]);
    if (missingRs.length > 0) {
      logger.warn(
        "ReputationShield env vars missing — RS will partially fail: " +
          missingRs.map(({ key, impact }) => `${key} (${impact})`).join("; "),
      );
    }
    // Twilio is the marketed default review-request channel; its absence
    // silently degrades RS to email-only.
    const twilioVars = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"];
    if (twilioVars.some((k) => !process.env[k])) {
      logger.warn(
        "ReputationShield: Twilio not fully configured — SMS review requests " +
          "will fall back to email-only.",
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
/* Impersonation middleware runs after passport.session so req.user is
 * already populated with the admin's identity. When the admin is in an
 * active "view as customer" session, this swaps req.user to the target
 * and sets req.adminImpersonating. Hard cap + auto-expiry both live
 * inside the middleware itself. */
app.use(impersonationMiddleware);

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

    // Include request id when the requestId middleware has tagged the
    // request (currently /api/v1/*). Cheap correlation handle for
    // grep'ing logs against a customer-quoted X-Request-Id.
    const rid = (req as any).requestId;
    let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms${rid ? ` rid=${rid}` : ""}`;

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
  // BF-1b — pre-deploy DATABASE_URL sanity guard. Refuses to boot if
  // NODE_ENV=production but DATABASE_URL host looks like a dev/preview/
  // staging branch. This is the BF-1 credential-wipe signature; better to
  // crash loud at boot than to apply migrations + serve traffic against the
  // wrong database. Runs BEFORE bootstrapMigrations() so a misconfigured
  // deploy never even touches the wrong DB's __bootstrap_migrations table.
  try {
    const { assertDatabaseUrlOk } = await import("./lib/checkDatabaseUrl");
    if (!assertDatabaseUrlOk()) {
      process.exit(1);
    }
  } catch (err: any) {
    logger.warn("[boot] DATABASE_URL guard import failed", { error: err?.message });
  }

  // Wave R-pre A — apply any pending hand-rolled SQL migrations BEFORE
  // any route is mounted. Without this, a republish of code that
  // references a new column (Wave P added updated_at + slug_release_warned_at
  // to calculators) and lands BEFORE Alex hand-runs `db:push` causes every
  // calculator query to 500 in production. The bootstrapper is idempotent:
  // each migration file uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS,
  // tracked in __bootstrap_migrations so re-runs are no-ops.
  try {
    const { bootstrapMigrations } = await import("./lib/bootstrapMigrations");
    await bootstrapMigrations();
  } catch (err: any) {
    logger.error("[boot] bootstrap migrations FAILED — refusing to start", { error: err?.message });
    process.exit(1);
  }

  await registerRoutes(httpServer, app);

  /* Ensure the contentflow_settings table exists at boot (not lazily) so
   * the dev and prod databases stay in sync — otherwise the deploy schema
   * diff keeps proposing to DROP it. Non-blocking; errors are swallowed. */
  import("./storage")
    .then(({ storage }) => storage.getContentflowSettings())
    .catch((err: any) => logger.warn("[boot] contentflow_settings ensure failed", { error: err?.message }));

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

  /* Server-side admin convenience redirect.
   *
   * Lives ahead of the Vite/serveStatic catch-all so it intercepts /admin
   * BEFORE the SPA HTML is served — browser sees a 302 and does a fresh
   * full-page navigation to /admin/crm. Avoids the client-side redirect
   * chain (/admin → <Redirect> → /admin/crm → RequirePortal) where a
   * transient `isLoading` window in useAuth can cause the wrapper's
   * "not portal user" branch to fire before the auth query resolves,
   * landing the user on the marketing home. ContentFlow Phase B7.5. */
  app.get("/admin", (_req: Request, res: Response) => {
    res.redirect(302, "/admin/crm");
  });

  /* Public ContentFlow draft preview — no auth required.
   *
   * Renders any content_draft as a readable HTML page, plus its children
   * (repurposer fan-out) if any exist. Intended for demoing the system to
   * stakeholders who don't have admin credentials. Read-only — no actions.
   *
   * Uses raw SQL (sql.raw) to dodge any schema-mismatch issues with
   * Drizzle on tables where code is ahead of the DB. The repurposer chain
   * currently can't fire on prod because of pending migrations
   * (journey_summary, trial_pro_expires_at columns missing) — once those
   * land, children populate here automatically.
   *
   * URL: /preview/article/:id
   * ContentFlow Phase B7.6.
   */
  app.get("/preview/article/:id", async (req: Request, res: Response) => {
    const draftId = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(draftId)) {
      return res.status(400).type("html").send("<h1>Bad request</h1><p>Invalid draft id.</p>");
    }
    try {
      const parentRes = await pool.query(
        `SELECT id, kind, surface, status, target_platform, title, body, excerpt,
                metadata, created_at
         FROM content_drafts
         WHERE id = $1
         LIMIT 1`,
        [draftId],
      );
      if (!parentRes.rows.length) {
        return res.status(404).type("html").send(`<h1>Draft ${draftId} not found</h1>`);
      }
      const parent = parentRes.rows[0];

      const childrenRes = await pool.query(
        `SELECT id, kind, surface, status, target_platform, title, body, excerpt,
                metadata, created_at
         FROM content_drafts
         WHERE (metadata->>'parent_draft_id')::int = $1
         ORDER BY id ASC`,
        [draftId],
      );
      const children: any[] = childrenRes.rows;

      function escape(s: any): string {
        if (s == null) return "";
        return String(s).replace(/[&<>"']/g, (c) =>
          ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string),
        );
      }

      function renderMarkdown(md: string): string {
        // Minimal markdown → HTML for headings + paragraphs.
        const lines = md.split(/\r?\n/);
        const out: string[] = [];
        let inPara = false;
        for (const line of lines) {
          const t = line.trim();
          if (!t) {
            if (inPara) {
              out.push("</p>");
              inPara = false;
            }
            continue;
          }
          if (t.startsWith("## ")) {
            if (inPara) { out.push("</p>"); inPara = false; }
            out.push(`<h2>${escape(t.slice(3))}</h2>`);
          } else if (t.startsWith("# ")) {
            if (inPara) { out.push("</p>"); inPara = false; }
            out.push(`<h1>${escape(t.slice(2))}</h1>`);
          } else {
            if (!inPara) { out.push("<p>"); inPara = true; }
            else { out.push(" "); }
            out.push(escape(t));
          }
        }
        if (inPara) out.push("</p>");
        return out.join("");
      }

      function statusBadge(s: string): string {
        const colors: Record<string, string> = {
          draft: "#94a3b8",
          awaiting_admin: "#f59e0b",
          awaiting_client: "#f59e0b",
          approved: "#10b981",
          rejected: "#ef4444",
          published: "#3b82f6",
          delivered: "#3b82f6",
          failed: "#ef4444",
          pending_approval: "#f59e0b",
        };
        const color = colors[s] || "#64748b";
        return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${color};color:white;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${escape(s)}</span>`;
      }

      const parentMeta = parent.metadata || {};
      const childCount = children.length;

      const childrenHtml = childCount === 0
        ? `<div style="padding:16px;background:#fff8e1;border-left:4px solid #f59e0b;border-radius:4px;margin-top:24px;">
             <strong>No repurposer children yet.</strong><br/>
             <span style="font-size:14px;color:#475569;">
               The article is approved but the repurposer fan-out hasn't fired (or failed).
               Once it runs, you'll see 8+ derivative drafts here: 3 Facebook captions, 3 Instagram captions,
               1 Google Business Profile summary, 1 email newsletter, 1 LinkedIn post,
               1 Pinterest post, and (if enabled) 1 video script + 1 infographic.
               Currently blocked by pending DB migrations on production —
               <code>journey_summary</code> / <code>trial_pro_expires_at</code> columns expected in code but absent in DB.
             </span>
           </div>`
        : children.map((c: any) => {
            const cMeta = c.metadata || {};
            const imageUrl = cMeta.media_plan?.image_url || cMeta.media_plan?.url || null;
            const target = c.target_platform || c.kind;
            return `
              <div style="border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:16px;background:white;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                  <div>
                    <span style="display:inline-block;padding:4px 10px;background:#1e293b;color:white;border-radius:4px;font-size:12px;font-weight:600;text-transform:uppercase;">${escape(target)}</span>
                    <span style="color:#64748b;font-size:13px;margin-left:8px;">draft #${c.id}</span>
                  </div>
                  ${statusBadge(c.status)}
                </div>
                ${c.title ? `<h3 style="margin:8px 0;font-size:16px;">${escape(c.title)}</h3>` : ""}
                ${imageUrl ? `<img src="${escape(imageUrl)}" style="max-width:100%;border-radius:6px;margin:8px 0;" alt="" loading="lazy"/>` : ""}
                <div style="white-space:pre-wrap;color:#1e293b;line-height:1.55;font-size:14px;">${escape(c.body || "(no body)")}</div>
              </div>`;
          }).join("");

      const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex,nofollow"/>
  <title>ContentFlow preview — draft ${draftId}</title>
  <style>
    body { font: 16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; margin:0; background:#f8fafc; color:#0f172a; }
    .container { max-width: 760px; margin: 32px auto; padding: 0 20px; }
    .banner { background:#0f172a; color:white; padding:16px 20px; border-radius:8px; margin-bottom:24px; font-size:14px; }
    .banner code { background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:3px; font-size:12px; }
    .article { background:white; padding:32px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.05); }
    .article h1 { font-size:28px; margin-top:0; }
    .article h2 { font-size:20px; margin-top:28px; color:#334155; }
    .article p { margin:12px 0; }
    .meta { color:#64748b; font-size:13px; margin-bottom:24px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
    .children-section { margin-top:40px; }
    .children-section h2 { font-size:18px; color:#1e293b; margin-bottom:16px; }
    footer { color:#94a3b8; font-size:12px; text-align:center; margin:32px 0 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="banner">
      <strong>ContentFlow preview</strong> — public read-only view of draft <code>#${draftId}</code> and its repurposed children. No admin auth required. Intended for stakeholder demo.
    </div>
    <article class="article">
      <div class="meta">
        ${statusBadge(parent.status)}
        <span>kind: <code>${escape(parent.kind)}</code></span>
        <span>surface: <code>${escape(parent.surface)}</code></span>
        <span>created ${new Date(parent.created_at).toLocaleString()}</span>
      </div>
      ${renderMarkdown(parent.body || "")}
    </article>
    <div class="children-section">
      <h2>Repurposed children (${childCount})</h2>
      ${childrenHtml}
    </div>
    <footer>WeFixTrades ContentFlow · /preview/article/${draftId}</footer>
  </div>
</body>
</html>`;
      res.type("html").send(html);
    } catch (err: any) {
      res.status(500).type("html").send(`<h1>Preview failed</h1><pre>${err?.message || err}</pre>`);
    }
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
