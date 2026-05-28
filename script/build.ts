import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { spawn } from "node:child_process";
import * as Sentry from "@sentry/node";

/**
 * Wave 93 — best-effort Sentry tagging for build-time failures so
 * prerender / esbuild regressions are filterable next to runtime errors.
 *
 * No-op when SENTRY_DSN is missing (dev / local). When DSN is present
 * (Replit prod build), tags every captured event with source=build so
 * the operator can filter on `tags["source"]:build` in the Sentry UI.
 */
const SENTRY_BUILD_INITIALIZED = (() => {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "production",
    release:
      process.env.SENTRY_RELEASE ??
      process.env.GIT_SHA ??
      process.env.REPL_DEPLOYMENT_ID ??
      process.env.SOURCE_VERSION ??
      undefined,
    // Builds happen once per deploy — no need to sample tracing.
    tracesSampleRate: 0,
  });
  Sentry.setTag("source", "build");
  return true;
})();

function reportBuildIssue(category: string, message: string, extra?: Record<string, unknown>) {
  console.warn(`[build] ${category}: ${message}`);
  if (!SENTRY_BUILD_INITIALIZED) return;
  Sentry.withScope((scope) => {
    scope.setTag("build_category", category);
    scope.setLevel("error");
    if (extra) scope.setExtras(extra);
    Sentry.captureMessage(`[build/${category}] ${message}`);
  });
}

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

/**
 * SEO Wave E — per-route prerender step. Runs after the Vite client
 * build so the rendered dist/public is ready to serve.
 *
 * Wave 90 — failure semantics changed.
 *   Previously: any non-zero exit from prerender-routes.mjs was warned
 *   and swallowed ("skipping — non-fatal"). That silent skip shipped an
 *   unhydrated /sms-consent-disclosure and blocked the A2P 10DLC
 *   campaign vetting for several deploys.
 *   Now: a non-zero exit aborts the build. The prerender script itself
 *   only exits non-zero when a CRITICAL_ROUTES entry (see
 *   scripts/seo/prerender-routes.mjs) failed BOTH the Playwright path
 *   AND the static-template fallback. Non-critical route failures are
 *   still warned and continue, so a single flaky landing page doesn't
 *   break the deploy.
 *
 * Wave 99 — SKIP_PRERENDER is IGNORED on production builds.
 *   Diagnostic on 2026-05-28 showed prod was shipping dist/public/ with
 *   ZERO route HTML files — root cause was SKIP_PRERENDER=1 leaking into
 *   the Replit deploy build environment. Result: TCR vetting bot saw the
 *   empty SPA shell on /sms-consent-disclosure, /privacy, /terms and
 *   rejected the A2P 10DLC campaign. The env-flag escape hatch must not
 *   be honoured in production — local iteration only.
 */
async function prerenderRoutes(): Promise<void> {
  if (isPrerenderSkipped("build")) {
    console.log("[build] SKIP_PRERENDER=1 — skipping prerender step.");
    return;
  }
  console.log("prerendering routes for Bing/LLM crawlers...");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/seo/prerender-routes.mjs"],
      { stdio: "inherit" },
    );
    child.on("error", (err) => {
      // Wave 90 — prerender errors abort the build (no longer silent skip).
      // Wave 93 — also tag Sentry so the failure shows up in the dashboard
      // next to runtime errors.
      reportBuildIssue("prerender", `spawn error: ${err.message}`, { stage: "spawn" });
      reject(new Error(`prerender spawn error: ${err.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reportBuildIssue(
          "prerender",
          `exited with code ${code} — see CRITICAL_ROUTES in scripts/seo/prerender-routes.mjs`,
          { exit_code: code, stage: "exit" },
        );
        reject(
          new Error(
            `prerender exited with code ${code} — see CRITICAL_ROUTES in scripts/seo/prerender-routes.mjs. Set SKIP_PRERENDER=1 to bypass for local iteration only.`,
          ),
        );
      }
    });
  });
}

/**
 * Wave 99 — production-build prerender enforcement.
 *
 * Returns true only when SKIP_PRERENDER=1 AND the build is NOT a
 * production deploy. Replit autoscale sets one or more of
 * REPLIT_DEPLOYMENT / REPL_DEPLOYMENT_ID / NODE_ENV=production during
 * the deploy build; any of those forces prerender to run regardless of
 * the env flag, with a loud diagnostic line so the override is visible
 * in deploy logs.
 *
 * @param tag short label that prefixes the override-ignored log line.
 */
function isPrerenderSkipped(tag: string): boolean {
  if (process.env.SKIP_PRERENDER !== "1") return false;
  const isProdBuild =
    process.env.NODE_ENV === "production" ||
    process.env.REPLIT_DEPLOYMENT === "1" ||
    !!process.env.REPL_DEPLOYMENT_ID ||
    !!process.env.REPLIT_DEPLOYMENT_ID;
  if (!isProdBuild) return true;
  console.log(
    `[${tag}] SKIP_PRERENDER=1 IGNORED — production builds must prerender. ` +
      `Detected: NODE_ENV=${process.env.NODE_ENV ?? "<unset>"}, ` +
      `REPLIT_DEPLOYMENT=${process.env.REPLIT_DEPLOYMENT ?? "<unset>"}, ` +
      `REPL_DEPLOYMENT_ID=${process.env.REPL_DEPLOYMENT_ID ? "<set>" : "<unset>"}. ` +
      `Skipping prerender in prod ships an empty SPA shell to TCR/Bing/LLM crawlers.`,
  );
  return false;
}

/**
 * Wave 90 — post-build smoke check.
 *
 * After the client + prerender + server bundles are emitted, verify
 * that the critical static pages (currently /sms-consent-disclosure)
 * actually made it to disk with the expected content. This catches
 * regressions like the prerender silently skipping a page, or a
 * template-fallback writer running but emitting an empty file.
 *
 * Wave 99 — see isPrerenderSkipped(): production builds always run.
 */
async function runBuildSmoke(): Promise<void> {
  if (isPrerenderSkipped("build")) {
    console.log("[build] SKIP_PRERENDER=1 — skipping post-build smoke check.");
    return;
  }
  console.log("running post-build smoke check...");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "tests/build-smoke.test.ts"],
      { stdio: "inherit" },
    );
    child.on("error", (err) => {
      reject(new Error(`build-smoke spawn error: ${err.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build-smoke exited with code ${code}`));
    });
  });
}

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  await prerenderRoutes();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  await runBuildSmoke();
}

buildAll()
  .then(async () => {
    if (SENTRY_BUILD_INITIALIZED) {
      await Sentry.flush(2000).catch(() => undefined);
    }
  })
  .catch(async (err) => {
    console.error(err);
    reportBuildIssue("build-fatal", err?.message ?? String(err), {
      stack: err?.stack,
    });
    if (SENTRY_BUILD_INITIALIZED) {
      await Sentry.flush(2000).catch(() => undefined);
    }
    process.exit(1);
  });
