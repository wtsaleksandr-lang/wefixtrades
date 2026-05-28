/**
 * Wave 90 — post-build smoke test.
 * Wave 93 — extended to every critical SEO + compliance route.
 * Wave 98 — split CRITICAL_PAGES into required (fatal) vs best-effort
 *   (warn-only). Only the three compliance/legal routes that have static
 *   template fallbacks in prerender-routes.mjs are truly required: they
 *   must be present and correct regardless of whether Playwright/Chromium
 *   could launch. All other pages (/, /products/*, /pricing, /about) are
 *   best-effort Playwright renders — if Chromium couldn't run in the build
 *   environment they simply won't exist, and failing the build on them
 *   blocked every deploy while adding no compliance value.
 *
 * Runs against `dist/public/` after `npm run build` completes. Verifies
 * that the prerender step actually produced the static HTML files that
 * external no-JS scrapers depend on. The Twilio / TCR A2P 10DLC
 * vetting bot in particular fetches /sms-consent-disclosure and reads
 * the response body without executing JavaScript — if the file is
 * missing, tiny (just the SPA shell), or missing the consent keywords,
 * the campaign submission is rejected. The same regression mode applies
 * to /privacy and /terms (TCR legitimacy checks).
 *
 * Why a standalone script and not a Playwright/vitest spec:
 *   - The repo has no node-level test runner; Playwright is for
 *     end-to-end browser tests against a running server.
 *   - This check is a static file-shape assertion, no browser needed.
 *   - Runs as part of the build chain (see `npm run build`) so a
 *     regression is caught locally and in CI before merge, not at
 *     post-deploy time.
 *
 * Exit codes:
 *   0 — all required pages present and correct (best-effort pages may warn)
 *   1 — at least one REQUIRED page missing or malformed (build fails)
 *
 * Invocation:
 *   tsx tests/build-smoke.test.ts
 *   npm run test:build-smoke
 *
 * Sibling files kept in sync:
 *   - scripts/seo/prerender-routes.mjs              (what we render)
 *   - scripts/deploy/content-verification.mjs       (post-deploy CI probe)
 *   - server/routes/deploymentHealthRoutes.ts       (admin dashboard probe)
 *   - server/static.ts CRITICAL_PRERENDERED_ROUTES  (runtime fallback alarm)
 */

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Wave 96 — CI-aware skip. When SKIP_PRERENDER=1 the build also skips
// scripts/seo/prerender-routes.mjs, which means dist/public/<route>/index.html
// won't exist for routes that lack a static-template fallback. Asserting on
// those files would be a guaranteed false-positive failure (GitHub CI runs
// on ubuntu-latest without Chromium system libs, so prerender can't run
// there).
//
// Wave 99 — production-build override. Earlier we assumed prod builds on
// Replit never set SKIP_PRERENDER. 2026-05-28 diagnostic proved otherwise:
// the deploy build was setting the flag (somewhere — likely an inherited
// Replit Secret), which caused prerender + this smoke check to both
// short-circuit, shipping dist/public/ with zero route HTML files and an
// empty TCR/Bing/LLM crawler response. Now SKIP_PRERENDER is ignored when
// any production indicator is set; CI on ubuntu-latest still gets to skip.
if (process.env.SKIP_PRERENDER === "1") {
  const isProdBuild =
    process.env.NODE_ENV === "production" ||
    process.env.REPLIT_DEPLOYMENT === "1" ||
    !!process.env.REPL_DEPLOYMENT_ID ||
    !!process.env.REPLIT_DEPLOYMENT_ID;
  if (isProdBuild) {
    console.log(
      `[build-smoke] SKIP_PRERENDER=1 IGNORED — production builds must validate. ` +
        `Detected: NODE_ENV=${process.env.NODE_ENV ?? "<unset>"}, ` +
        `REPLIT_DEPLOYMENT=${process.env.REPLIT_DEPLOYMENT ?? "<unset>"}, ` +
        `REPL_DEPLOYMENT_ID=${process.env.REPL_DEPLOYMENT_ID ? "<set>" : "<unset>"}.`,
    );
  } else {
    console.log(
      "[build-smoke] SKIP_PRERENDER=1 detected — skipping smoke test (CI mode).",
    );
    process.exit(0);
  }
}

// `import.meta.url` is a file:// URL; on Windows the .pathname form
// gives "/C:/..." which path.resolve mangles into "C:/C:/...". Use
// fileURLToPath so the same code works on both POSIX and Windows.
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..");
const DIST_DIR = path.join(REPO_ROOT, "dist", "public");

interface CriticalPage {
  route: string;
  file: string;
  minBytes: number;
  mustContain: string[];
  /**
   * true  → missing/malformed page fails the build (exit 1).
   * false → missing/malformed page emits a warning but build continues.
   *
   * Only routes that have a static-template fallback in
   * scripts/seo/prerender-routes.mjs (CRITICAL_TEMPLATE_FALLBACKS) are
   * marked required=true. All other routes are Playwright best-effort —
   * when Chromium can't launch in the build environment they won't be
   * written, and that must not block the deploy.
   */
  required: boolean;
}

const CRITICAL_PAGES: CriticalPage[] = [
  {
    route: "/",
    file: "index.html",
    minBytes: 4000,
    mustContain: ["WeFixTrades"],
    required: false,
  },
  {
    route: "/sms-consent-disclosure",
    file: path.join("sms-consent-disclosure", "index.html"),
    minBytes: 6000,
    mustContain: ["STOP", "consent", "opt-in"],
    required: true,
  },
  {
    route: "/privacy",
    file: path.join("privacy", "index.html"),
    minBytes: 5000,
    mustContain: ["Privacy"],
    required: true,
  },
  {
    route: "/terms",
    file: path.join("terms", "index.html"),
    minBytes: 5000,
    mustContain: ["Terms"],
    required: true,
  },
  {
    route: "/products/quickquotepro",
    file: path.join("products", "quickquotepro", "index.html"),
    minBytes: 5000,
    mustContain: ["QuoteQuick"],
    required: false,
  },
  {
    route: "/products/tradeline",
    file: path.join("products", "tradeline", "index.html"),
    minBytes: 5000,
    mustContain: ["TradeLine"],
    required: false,
  },
  {
    route: "/pricing",
    file: path.join("pricing", "index.html"),
    minBytes: 5000,
    mustContain: ["$"],
    required: false,
  },
  {
    route: "/about",
    file: path.join("about", "index.html"),
    minBytes: 5000,
    mustContain: ["About"],
    required: false,
  },
];

interface CheckResult {
  route: string;
  ok: boolean;
  required: boolean;
  problems: string[];
}

async function checkPage(page: CriticalPage): Promise<CheckResult> {
  const fullPath = path.join(DIST_DIR, page.file);
  const problems: string[] = [];

  if (!existsSync(fullPath)) {
    problems.push(`file does not exist: ${fullPath}`);
    return { route: page.route, ok: false, required: page.required, problems };
  }

  const stats = await stat(fullPath);
  if (stats.size < page.minBytes) {
    problems.push(
      `size ${stats.size}B is below the ${page.minBytes}B minimum (likely an unhydrated SPA shell)`,
    );
  }

  const content = await readFile(fullPath, "utf-8");
  const haystack = content.toLowerCase();
  for (const token of page.mustContain) {
    if (!haystack.includes(token.toLowerCase())) {
      problems.push(`missing required token "${token}"`);
    }
  }

  return { route: page.route, ok: problems.length === 0, required: page.required, problems };
}

async function main(): Promise<void> {
  console.log("[build-smoke] checking critical prerendered pages...");
  if (!existsSync(DIST_DIR)) {
    console.error(
      `[build-smoke] FATAL: ${DIST_DIR} does not exist. Run \`npm run build\` first.`,
    );
    process.exit(1);
  }

  const results = await Promise.all(CRITICAL_PAGES.map(checkPage));
  let anyRequiredFail = false;
  for (const result of results) {
    if (result.ok) {
      console.log(`[build-smoke] OK   ${result.route}`);
    } else if (result.required) {
      anyRequiredFail = true;
      console.error(`[build-smoke] FAIL ${result.route} (required)`);
      for (const problem of result.problems) {
        console.error(`  - ${problem}`);
      }
    } else {
      console.warn(`[build-smoke] WARN ${result.route} (best-effort, Chromium may not have run)`);
      for (const problem of result.problems) {
        console.warn(`  - ${problem}`);
      }
    }
  }

  if (anyRequiredFail) {
    console.error(
      "[build-smoke] one or more REQUIRED compliance pages failed validation; aborting build.",
    );
    process.exit(1);
  }
  console.log("[build-smoke] all required pages OK.");
}

main().catch((err) => {
  console.error("[build-smoke] FATAL:", err);
  process.exit(1);
});
