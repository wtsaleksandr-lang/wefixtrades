/**
 * Guard: every template preset must ship a committed, non-empty pre-rendered
 * thumbnail PNG so the premium gallery path (`TemplateThumbnail.tsx`) shows the
 * real Elfsight-style `<id>@2x.png` snapshot instead of silently falling back
 * to the data-driven mini-render for every card.
 *
 * WHY A COVERAGE CHECK (not a pixel/byte drift check):
 *   The PNGs are produced by Playwright/Chromium (`npm run thumbnails`) against
 *   a live dev server. Font rasterisation differs between OSes, so a byte-diff
 *   drift check would fail in CI (ubuntu) even when nothing changed — a
 *   false-positive machine. CI also runs WITHOUT the Playwright browser bundle
 *   (see .github/workflows/ci.yml, Wave 96), so it cannot regenerate. Instead
 *   this guard verifies the ONE thing that actually drifts and matters: that a
 *   newly-added template didn't ship without a committed thumbnail. It is
 *   deterministic, needs no browser, and no DB.
 *
 * REGENERATE after adding/removing/renaming a template:
 *   1. Start a dev server:  `npx vite --port 5321 --strictPort`
 *   2. In another shell:    `RENDER_BASE_URL=http://localhost:5321 npm run thumbnails`
 *   3. Commit the new/changed PNGs under client/public/template-thumbnails/.
 *
 * Run: `npm run check:template-thumbnails` (tsx; no DB, no browser).
 */
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATE_PRESETS } from "../shared/templatePresets";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const THUMB_DIR = path.join(REPO_ROOT, "client", "public", "template-thumbnails");

// A valid PNG snapshot is comfortably larger than this. A near-zero file means
// a blank/failed capture slipped through — treat it as missing.
const MIN_BYTES = 1024;

const missing: string[] = [];
const tooSmall: { id: string; bytes: number }[] = [];

for (const tpl of TEMPLATE_PRESETS) {
  const file = path.join(THUMB_DIR, `${tpl.id}@2x.png`);
  let bytes = -1;
  try {
    bytes = statSync(file).size;
  } catch {
    missing.push(tpl.id);
    continue;
  }
  if (bytes < MIN_BYTES) tooSmall.push({ id: tpl.id, bytes });
}

if (missing.length > 0 || tooSmall.length > 0) {
  console.error(
    `\ncheck:template-thumbnails — ${missing.length} missing + ${tooSmall.length} blank/tiny thumbnail(s):\n`,
  );
  for (const id of missing) {
    console.error(`  ✗ [${id}] no client/public/template-thumbnails/${id}@2x.png`);
  }
  for (const t of tooSmall) {
    console.error(`  ✗ [${t.id}] thumbnail is only ${t.bytes}B (< ${MIN_BYTES}B) — likely a blank/failed capture`);
  }
  console.error(
    `\nRegenerate: start \`npx vite --port 5321 --strictPort\`, then ` +
      `\`RENDER_BASE_URL=http://localhost:5321 npm run thumbnails\`, and commit the PNGs.\n`,
  );
  process.exit(1);
}

console.log(
  `check:template-thumbnails — OK (${TEMPLATE_PRESETS.length} templates, all have a committed non-empty @2x.png).`,
);
process.exit(0);
