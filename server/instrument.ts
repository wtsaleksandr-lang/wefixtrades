/**
 * Sentry SDK initialization. Per Sentry's docs this module must be imported
 * BEFORE any other application module so the SDK can install its
 * instrumentation hooks (HTTP, console, unhandled rejection, etc.) before
 * those subsystems are required. The only import that precedes it in
 * server/index.ts is server/bootstrapDoppler — that one is also side-effect
 * only and must run first so process.env.SENTRY_DSN is populated from the
 * Doppler vault before this file reads it.
 *
 * No-op when SENTRY_DSN is missing so dev/test envs without a DSN stay
 * noise-free (no events emitted, no network calls).
 */

import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    sendDefaultPii: true,
    environment: process.env.NODE_ENV ?? "development",
    // Release tagging lets Sentry group regressions per-deploy. Falls
    // back through the same chain as /api/healthz so the two stay in sync.
    release:
      process.env.SENTRY_RELEASE ??
      process.env.GIT_SHA ??
      process.env.REPL_DEPLOYMENT_ID ??
      process.env.SOURCE_VERSION ??
      undefined,
    tracesSampleRate: 0.05,
  });
}
