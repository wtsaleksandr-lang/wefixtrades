/**
 * Wave 42 — capture real calculator screenshots for the four "first-row"
 * templates on `/templates` (the marketing index). Replaces the AI-generated
 * illustrations at `client/public/ai-thumbnails/templates/<id>.png` with
 * actual screenshots of the live `<AdvancedCalculator>` widget.
 *
 * Strategy:
 *   - Reuses the existing dev-only `/internal/template-render/:templateId`
 *     route (see `client/src/pages/InternalTemplateRender.tsx`), which
 *     renders the calculator at a deterministic 560×700 frame with
 *     animations disabled and a `data-render-ready="true"` ready signal.
 *   - For each of the four target ids we load that route at a larger
 *     viewport, wait for ready, then take an element screenshot of the
 *     calculator card. The output PNG is saved at 1024×768 (matching the
 *     dimensions of the AI illustrations being replaced) so the existing
 *     `objectFit: "cover"` crop on the template card hero (height 132px)
 *     keeps producing the same letterbox shape.
 *
 * Re-run this script when a new "first-row" template id is added to
 * `AI_THUMBNAIL_TEMPLATE_IDS` in `client/src/pages/marketing/templates.tsx`.
 * Append the new id to TARGET_IDS below.
 *
 * Usage:
 *   1. Start the dev server (separate terminal):
 *        cross-env PORT=5174 npm run dev
 *      (default PORT=5000 conflicts when another checkout is running).
 *   2. Run this script (uses RENDER_BASE_URL or defaults to localhost:5174):
 *        RENDER_BASE_URL=http://localhost:5174 node scripts/capture-template-screenshots.mjs
 */

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const BASE_URL = (process.env.RENDER_BASE_URL ?? "http://localhost:5174").replace(/\/$/, "");
const OUT_DIR = path.join(REPO_ROOT, "client", "public", "ai-thumbnails", "templates");

// Capture the calculator at the full-size internal render frame, then
// screenshot the wrapping container clipped to 1024×768 (same dimensions
// as the AI illustrations being replaced).
const VIEWPORT_W = 1024;
const VIEWPORT_H = 768;
const READY_SELECTOR = '[data-render-ready="true"]';
const READY_TIMEOUT_MS = 30_000;

// Marketing first-row templates (must stay in sync with
// AI_THUMBNAIL_TEMPLATE_IDS in client/src/pages/marketing/templates.tsx).
const TARGET_IDS = [
  "car_towing",
  "driveway_paving",
  "property_cleaning",
  "energy_upgrade",
];

async function snapOne(ctx, templateId) {
  const page = await ctx.newPage();
  try {
    // `?bg=#ffffff` overrides the render page's default `#f6f8fa` so the
    // screenshot lands on a clean white background — the template card hero
    // sits on the category palette and lighter backgrounds blend better.
    const url = `${BASE_URL}/internal/template-render/${templateId}?bg=%23ffffff`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR, { timeout: READY_TIMEOUT_MS });

    // InternalTemplateRender hard-codes 560×700 with overflow:hidden. Stretch
    // the render wrapper to fill the full viewport so the calculator gets the
    // wider canvas and the screenshot fills the target 1024×768 dimensions.
    await page.addStyleTag({
      content: `
        [data-testid="internal-template-render"] {
          width: ${VIEWPORT_W}px !important;
          height: ${VIEWPORT_H}px !important;
          padding: 32px !important;
          background: #ffffff !important;
        }
      `,
    });

    // Tiny settle for fonts / async assets that finish painting after
    // `ready` flips (the render page only waits 500ms internally) and to
    // let the calculator re-layout into the wider container.
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.join(OUT_DIR, `${templateId}.png`),
      type: "png",
      clip: { x: 0, y: 0, width: VIEWPORT_W, height: VIEWPORT_H },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err instanceof Error ? err.message : String(err)) };
  } finally {
    await page.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`[wave42-thumbs] base=${BASE_URL}`);
  console.log(`[wave42-thumbs] out=${path.relative(REPO_ROOT, OUT_DIR)}`);
  console.log(`[wave42-thumbs] targets=${TARGET_IDS.join(", ")}`);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error(
      "[wave42-thumbs] Failed to launch Chromium. Run `npx playwright install chromium` first.",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  const ctx = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });

  let ok = 0;
  let failed = 0;
  for (const id of TARGET_IDS) {
    process.stdout.write(`[wave42-thumbs] ${id} ... `);
    const res = await snapOne(ctx, id);
    if (res.ok) {
      ok += 1;
      console.log("OK");
    } else {
      failed += 1;
      console.log(`FAIL — ${res.error}`);
    }
  }

  await ctx.close();
  await browser.close();
  console.log(`[wave42-thumbs] done. ok=${ok} failed=${failed} total=${TARGET_IDS.length}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[wave42-thumbs] fatal:", err);
  process.exit(1);
});
