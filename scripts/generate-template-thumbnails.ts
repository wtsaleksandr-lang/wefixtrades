/**
 * Template thumbnail snapshot pipeline (Elfsight-style `<id>@2x.png` PNGs).
 *
 * For every entry in `TEMPLATE_PRESETS`, this script:
 *   1. Opens a headless Chromium tab at the dev-only render route
 *      `/internal/template-render/<templateId>`.
 *   2. Waits for the render page to flip `data-render-ready="true"` once
 *      the `<AdvancedCalculator>` has mounted and layout has settled.
 *   3. Captures a 560×700 PNG at 2x deviceScaleFactor (effective 1120×1400)
 *      to `client/public/template-thumbnails/<templateId>@2x.png`.
 *
 * Run via `npm run thumbnails`, after `npm run dev` is up on port 5173 (or
 * pass `RENDER_BASE_URL=http://localhost:PORT` to point elsewhere). The
 * generated PNGs are static assets served from `client/public` — the
 * gallery shows them with `loading="lazy"` and falls back to the existing
 * `<TemplateMockup>` component when the PNG is missing.
 */

import { chromium, type Browser, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TEMPLATE_PRESETS } from "../shared/templatePresets.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const BASE_URL = (process.env.RENDER_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const OUT_DIR = path.join(REPO_ROOT, "client", "public", "template-thumbnails");
const VIEWPORT_W = 560;
const VIEWPORT_H = 700;
const READY_SELECTOR = '[data-render-ready="true"]';
const READY_TIMEOUT_MS = 15_000;
// Upper bound (per template) on how long to wait for images to finish
// loading/decoding after the render-ready flag flips. Kept well under the
// anti-hang ceiling so a stubborn asset degrades gracefully rather than
// stalling the run.
const IMAGE_WAIT_TIMEOUT_MS = 8_000;

async function snapOne(
  ctx: BrowserContext,
  templateId: string,
): Promise<{ ok: boolean; error?: string }> {
  const page = await ctx.newPage();
  try {
    const url = `${BASE_URL}/internal/template-render/${templateId}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR, { timeout: READY_TIMEOUT_MS });
    // The render page flips `data-render-ready` on a 500ms settle timer, which
    // can fire BEFORE option `<img>`s have fetched + decoded — the screenshot
    // then captures generic house-emoji placeholders instead of the real
    // imagery (observed on `mobile_mechanic`). Close the race explicitly:
    //   1. Let the network go idle so in-flight image requests complete.
    //   2. Wait for every `<img>` to report `complete` and successfully
    //      `decode()` (or settle on error so a single broken asset can't hang
    //      the whole run). Both steps are bounded so no template can block the
    //      pipeline.
    await page
      .waitForLoadState("networkidle", { timeout: IMAGE_WAIT_TIMEOUT_MS })
      .catch((err: Error) => {
        // Bounded — networkidle not reaching quiescence is non-fatal (the
        // per-image decode wait below is the real gate); surface it so a
        // chronically slow template is visible rather than silently dropped.
        console.warn(`[thumbnails] ${templateId}: networkidle wait — ${err.message}`);
      });
    await page
      .evaluate(
        (timeoutMs) =>
          Promise.race([
            Promise.all(
              Array.from(document.images).map((img) =>
                img.complete && img.naturalWidth > 0
                  ? Promise.resolve()
                  : new Promise<void>((resolve) => {
                      const done = () => resolve();
                      img.addEventListener("load", done, { once: true });
                      img.addEventListener("error", done, { once: true });
                      // decode() covers already-loaded-but-not-yet-decoded.
                      if (img.decode) img.decode().then(done).catch(done);
                    }),
              ),
            ).then(() => undefined),
            new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
          ]),
        IMAGE_WAIT_TIMEOUT_MS,
      )
      .catch((err: Error) => {
        // Bounded — an in-page eval failure must not abort the whole run;
        // log it so a broken decode path is visible instead of silent.
        console.warn(`[thumbnails] ${templateId}: image-decode wait — ${err.message}`);
      });
    await page.screenshot({
      path: path.join(OUT_DIR, `${templateId}@2x.png`),
      omitBackground: false,
      type: "png",
      // Clip is implicit because the page body matches the viewport, but
      // be explicit so any future layout drift can't push the screenshot
      // past 560×700.
      clip: { x: 0, y: 0, width: VIEWPORT_W, height: VIEWPORT_H },
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    await page.close();
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`[thumbnails] base=${BASE_URL}`);
  console.log(`[thumbnails] out=${path.relative(REPO_ROOT, OUT_DIR)}`);
  console.log(`[thumbnails] templates=${TEMPLATE_PRESETS.length}`);

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error(
      "[thumbnails] Failed to launch Chromium. Run `npx playwright install chromium` first.",
      (err as Error).message,
    );
    process.exit(1);
  }

  const ctx = await browser.newContext({
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });

  let ok = 0;
  let failed = 0;
  for (const tpl of TEMPLATE_PRESETS) {
    process.stdout.write(`[thumbnails] ${tpl.id} ... `);
    const res = await snapOne(ctx, tpl.id);
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
  console.log(`[thumbnails] done. ok=${ok} failed=${failed} total=${TEMPLATE_PRESETS.length}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[thumbnails] fatal:", err);
  process.exit(1);
});
