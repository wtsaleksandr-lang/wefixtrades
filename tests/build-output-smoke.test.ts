/**
 * Wave 93 — extended post-build smoke test.
 *
 * Wave 88 / 90 added a minimal smoke check focused on the consent
 * disclosure (because the TCR 10DLC vetting bot was rejecting on it).
 * This file extends the coverage to EVERY critical SEO + compliance
 * route so a future prerender regression can't silently ship empty
 * shells on /pricing, /privacy, /about, etc. — same failure mode,
 * different page.
 *
 * Runs after `npm run build` finishes and `dist/public/` is on disk.
 * Reads each prerendered HTML file and asserts:
 *   1. File exists at `dist/public/<route>/index.html`
 *      (or `dist/public/index.html` for `/`)
 *   2. Size >= minBytes (defends against the unhydrated SPA shell,
 *      which is ~3-4 KB)
 *   3. Every case-insensitive token in `mustContain` is present in
 *      the file body
 *
 * Wire into `npm run build` so a regression aborts the deploy locally
 * before it ever leaves the dev machine.
 *
 * Exit codes:
 *   0 — all critical pages present, correctly sized, contain required tokens
 *   1 — at least one critical page missing or malformed (build fails)
 *
 * Invocation:
 *   tsx tests/build-output-smoke.test.ts
 *   npm run test:build-output-smoke
 *
 * Sibling files kept in sync:
 *   - scripts/seo/prerender-routes.mjs        (what we render)
 *   - scripts/deploy/content-verification.mjs (post-deploy probes)
 *   - server/static.ts                         (CRITICAL_PRERENDERED_ROUTES)
 */

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const DIST_DIR = path.join(REPO_ROOT, "dist", "public");

interface CriticalPage {
  /** Route as used in the URL. */
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
    minBytes: 8_000,
    mustContain: ["WeFixTrades"],
  },
  {
    route: "/sms-consent-disclosure",
    file: path.join("sms-consent-disclosure", "index.html"),
    // The empty SPA shell is ~3-4 KB. A real disclosure with body content
    // is >12 KB. 6000 catches the silent-skip regression while leaving
    // headroom for template tweaks.
    minBytes: 6_000,
    mustContain: ["STOP", "consent", "opt-in"],
  },
  {
    route: "/privacy",
    file: path.join("privacy", "index.html"),
    minBytes: 5_000,
    mustContain: ["Privacy"],
  },
  {
    route: "/terms",
    file: path.join("terms", "index.html"),
    minBytes: 5_000,
    mustContain: ["Terms"],
  },
  {
    route: "/products/quickquotepro",
    file: path.join("products", "quickquotepro", "index.html"),
    minBytes: 5_000,
    mustContain: ["QuoteQuick"],
  },
  {
    route: "/products/tradeline",
    file: path.join("products", "tradeline", "index.html"),
    minBytes: 5_000,
    mustContain: ["TradeLine"],
  },
  {
    route: "/pricing",
    file: path.join("pricing", "index.html"),
    minBytes: 5_000,
    mustContain: ["$"],
  },
  {
    route: "/about",
    file: path.join("about", "index.html"),
    minBytes: 5_000,
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
  if (process.env.SKIP_PRERENDER === "1") {
    console.log(
      "[build-output-smoke] SKIP_PRERENDER=1 — skipping (prerender step was skipped, so prerendered files are not expected).",
    );
    return;
  }
  console.log("[build-output-smoke] checking critical prerendered pages...");
  if (!existsSync(DIST_DIR)) {
    console.error(
      `[build-output-smoke] FATAL: ${DIST_DIR} does not exist. Run \`npm run build\` first.`,
    );
    process.exit(1);
  }

  const results = await Promise.all(CRITICAL_PAGES.map(checkPage));
  let anyFail = false;
  for (const result of results) {
    if (result.ok) {
      console.log(`[build-output-smoke] OK   ${result.route}`);
    } else {
      anyFail = true;
      console.error(`[build-output-smoke] FAIL ${result.route}`);
      for (const problem of result.problems) {
        console.error(`  - ${problem}`);
      }
    }
  }

  if (anyFail) {
    console.error(
      "[build-output-smoke] one or more critical pages failed validation; aborting build.",
    );
    process.exit(1);
  }
  console.log(`[build-output-smoke] all ${results.length} critical pages OK.`);
}

main().catch((err) => {
  console.error("[build-output-smoke] FATAL:", err);
  process.exit(1);
});
