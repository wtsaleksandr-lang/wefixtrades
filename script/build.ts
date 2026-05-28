import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { spawn } from "node:child_process";

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
 * Skip with SKIP_PRERENDER=1 for quick iteration on the server side.
 */
async function prerenderRoutes(): Promise<void> {
  if (process.env.SKIP_PRERENDER === "1") {
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
      reject(new Error(`prerender spawn error: ${err.message}`));
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
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
 * Wave 90 — post-build smoke check.
 *
 * After the client + prerender + server bundles are emitted, verify
 * that the critical static pages (currently /sms-consent-disclosure)
 * actually made it to disk with the expected content. This catches
 * regressions like the prerender silently skipping a page, or a
 * template-fallback writer running but emitting an empty file.
 *
 * Skipped if SKIP_PRERENDER=1 (no prerendered output to check).
 */
async function runBuildSmoke(): Promise<void> {
  if (process.env.SKIP_PRERENDER === "1") {
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

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
