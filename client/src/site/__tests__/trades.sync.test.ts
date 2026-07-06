/**
 * trades.sync.test.ts — drift guard for the trades index.
 *
 * Asserts that `client/src/site/trades.ts` (TRADES) stays in lock-step with the
 * route slugs actually rendered by `client/src/pages/solutions/SolutionPage.tsx`
 * (the `SOLUTIONS` array). If someone adds, removes, or renames a trade in one
 * file but not the other, nav search and the /solutions catalogue would point at
 * dead routes — this test fails loudly instead.
 *
 * DB-free and dependency-free: it does NOT import the .tsx (that would pull in
 * React + lucide). It reads SolutionPage.tsx as text and extracts the `slug:`
 * literals with a regex, then compares the two slug sets.
 *
 * Runnable standalone:  npx tsx client/src/site/__tests__/trades.sync.test.ts
 * Wired into CI as:     npm run check:trades-sync
 *
 * Excluded from `tsc --noEmit` via the tsconfig **\/*.test.ts pattern.
 * Uses node:assert/strict, no test runner dependency.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { TRADES } from "../trades";

const here = dirname(fileURLToPath(import.meta.url));
const solutionPagePath = resolve(here, "../../pages/solutions/SolutionPage.tsx");

function solutionPageSlugs(): string[] {
  const src = readFileSync(solutionPagePath, "utf8");
  const slugs: string[] = [];
  const re = /slug:\s*"(for-[a-z-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    slugs.push(m[1]);
  }
  return slugs;
}

function main() {
  const pageSlugs = solutionPageSlugs();
  const tradeSlugs = TRADES.map((t) => t.slug);

  const pageSet = new Set(pageSlugs);
  const tradeSet = new Set(tradeSlugs);

  /* ─── 1. No duplicate slugs on either side ─── */
  assert.equal(pageSet.size, pageSlugs.length, "SolutionPage has duplicate slugs");
  assert.equal(tradeSet.size, tradeSlugs.length, "TRADES has duplicate slugs");

  /* ─── 2. Counts match and are non-trivial ─── */
  assert.ok(pageSlugs.length > 0, "SolutionPage yielded zero slugs — regex or path is wrong");
  assert.equal(
    tradeSlugs.length,
    pageSlugs.length,
    `TRADES count (${tradeSlugs.length}) must equal SolutionPage route count (${pageSlugs.length})`,
  );

  /* ─── 3. Every TRADES slug is a real SolutionPage route ─── */
  for (const slug of tradeSlugs) {
    assert.ok(pageSet.has(slug), `TRADES slug "${slug}" is not a SolutionPage route`);
  }

  /* ─── 4. Every SolutionPage route is represented in TRADES ─── */
  for (const slug of pageSlugs) {
    assert.ok(tradeSet.has(slug), `SolutionPage route "${slug}" is missing from TRADES`);
  }

  /* ─── 5. roofWidget flag is exactly the roof/solar trades ─── */
  const roofWidgetSlugs = TRADES.filter((t) => t.roofWidget).map((t) => t.slug).sort();
  assert.deepEqual(
    roofWidgetSlugs,
    ["for-roofers", "for-solar"],
    "roofWidget must be set on exactly for-roofers and for-solar",
  );

  console.log(`trades.sync OK — ${tradeSlugs.length} trades in sync with SolutionPage routes`);
}

main();
