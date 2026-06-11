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
    /* Sentry triage 2026-06-11 (NODEWEFIXTRADES-12/1K/1Q/1R): the SDK's AI
     * integrations capture provider connection timeouts thrown inside the
     * Anthropic client as handled:false ERROR events even though our call
     * sites catch them and fall back (audit narrative → templated prose,
     * provider failover chain). Worse, the minified frame names change every
     * deploy, so the SAME timeout opened a brand-new Sentry issue (+email)
     * per release. Downgrade those events to warning and pin a stable
     * fingerprint so they group into one long-lived, non-paging issue.
     * Everything else passes through untouched. */
    beforeSend(event) {
      const mech = event.exception?.values?.[0]?.mechanism?.type ?? "";
      const value = event.exception?.values?.[0]?.value ?? "";
      const isAiProviderError = mech.startsWith("auto.ai.");
      const isTimeout = /request timed out|connection error|timeout/i.test(value);
      if (isAiProviderError && isTimeout) {
        event.level = "warning";
        event.fingerprint = ["ai-provider-timeout"];
        event.tags = { ...event.tags, ai_provider_timeout: "true" };
      }
      return event;
    },
  });
}
