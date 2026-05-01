import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
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
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_BILLING_WEBHOOK_SECRET",
    "ANTHROPIC_API_KEY",
  ];

  const missing = critical.filter((key) => !process.env[key]);

  if (missing.length === 0) return;

  if (isProduction) {
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
}

validateEnv();

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

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

app.use(
  session({
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
  })
);
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
})();
