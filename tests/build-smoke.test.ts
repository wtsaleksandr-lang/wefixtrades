/**
 * Wave 90 — post-build smoke test.
 * Wave 93 — extended to every critical SEO + compliance route.
 *
 * Runs against `dist/public/` after `npm run build` completes. Verifies
 * that the prerender step actually produced the static HTML files that
 * external no-JS scrapers depend on. The Twilio / TCR A2P 10DLC
 * vetting bot in particular fetches /sms-consent-disclosure and reads
 * the response body without executing JavaScript — if the file is
 * missing, tiny (just the SPA shell), or missing the consent keywords,
 * the campaign submission is rejected. The same regression mode applies
 * to every other prerendered route (Bing crawler, link previews,
 * privacy/terms compliance checkers), so Wave 93 expands the coverage
 * to all eight critical routes instead of just /sms-consent-disclosure.
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
 *   0 — all critical pages present, correctly sized, contain required tokens
 *   1 — at least one critical page missing or malformed (build fails)
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
// there). Defer to the build's own gate instead — production builds on Replit
// do NOT set this flag, so the smoke check still enforces every critical
// route at deploy time.
if (process.env.SKIP_PRERENDER === "1") {
  console.log(
    "[build-smoke] SKIP_PRERENDER=1 detected — skipping smoke test (CI mode).",
  );
  process.exit(0);
}

// `import.meta.url` is a file:// URL; on Windows the .pathname form
// gives "/C:/..." which path.resolve mangles into "C:/C:/...". Use
// fileURLToPath so the same code works on both POSIX and Windows.
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..");
const DIST_DIR = path.join(REPO_ROOT, "dist", "public");

interface CriticalPage {
  /** Route as used in the URL (e.g. "/sms-consent-disclosure"). */
  route: string;
  /** Generated file path, relative to dist/public. */
  file: string;
  /** Minimum byte size — guards against the unhydrated SPA shell. */
  minBytes: number;
  /** Case-insensitive substrings that must all be present in the file. */
  mustContain: string[];
}

const CRITICAL_PAGES: CriticalPage[] = [
  {
    route: "/",
    file: "index.html",
    // Home is the heaviest prerender (hero, features, social proof) —
    // 8 KB is well below the realistic floor but above the empty shell.
    minBytes: 8000,
    mustContain: ["WeFixTrades"],
  },
  {
    route: "/sms-consent-disclosure",
    file: path.join("sms-consent-disclosure", "index.html"),
    // The empty SPA shell is ~3-4 KB. A real disclosure with body content
    // is >12 KB. 6000 catches the silent-skip regression while leaving
    // headroom for template tweaks.
    minBytes: 6000,
    mustContain: ["STOP", "consent", "opt-in"],
  },
  {
    route: "/privacy",
    file: path.join("privacy", "index.html"),
    minBytes: 5000,
    mustContain: ["Privacy"],
  },
  {
    route: "/terms",
    file: path.join("terms", "index.html"),
    minBytes: 5000,
    mustContain: ["Terms"],
  },
  {
    route: "/products/quickquotepro",
    file: path.join("products", "quickquotepro", "index.html"),
    minBytes: 5000,
    // QuoteQuick is the brand name for the QuickQuotePro product page.
    mustContain: ["QuoteQuick"],
  },
  {
    route: "/products/tradeline",
    file: path.join("products", "tradeline", "index.html"),
    minBytes: 5000,
    mustContain: ["TradeLine"],
  },
  {
    route: "/pricing",
    file: path.join("pricing", "index.html"),
    minBytes: 5000,
    mustContain: ["$"],
  },
  {
    route: "/about",
    file: path.join("about", "index.html"),
    minBytes: 5000,
    mustContain: ["About"],
  },
];

interface CheckResult {
  route: string;
  ok: boolean;
  problems: string[];
}

async function checkPage(page: CriticalPage): Promise<CheckResult> {
  const fullPath = path.join(DIST_DIR, page.file);
  const problems: string[] = [];

  if (!existsSync(fullPath)) {
    problems.push(`file does not exist: ${fullPath}`);
    return { route: page.route, ok: false, problems };
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

  return { route: page.route, ok: problems.length === 0, problems };
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
  let anyFail = false;
  for (const result of results) {
    if (result.ok) {
      console.log(`[build-smoke] OK  ${result.route}`);
    } else {
      anyFail = true;
      console.error(`[build-smoke] FAIL ${result.route}`);
      for (const problem of result.problems) {
        console.error(`  - ${problem}`);
      }
    }
  }

  if (anyFail) {
    console.error(
      "[build-smoke] one or more critical pages failed validation; aborting build.",
    );
    process.exit(1);
  }
  console.log("[build-smoke] all critical pages OK.");
}

main().catch((err) => {
  console.error("[build-smoke] FATAL:", err);
  process.exit(1);
});
