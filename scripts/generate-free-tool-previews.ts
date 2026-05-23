/**
 * Free Tools preview snapshot pipeline.
 *
 * For every live free tool (Schema, FAQ, Hours, Trust Badges), this script
 * renders a self-contained HTML preview in headless Chromium and writes a
 * 560×400 @2x PNG to `client/public/free-tools/previews/<slug>.png`.
 *
 * Unlike the template thumbnails script, these previews use inline HTML with
 * realistic sample data rather than mounting the real widget — the widget
 * scripts ship as standalone embeds and the goal here is a static gallery
 * preview for the Free Tools index card grid.
 *
 * Run: `npm run previews:free-tools`
 * Prereq: `npx playwright install chromium`
 */

import { chromium, type Browser } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const OUTPUT_DIR = path.join(REPO_ROOT, "client", "public", "free-tools", "previews");
const VIEWPORT = { width: 560, height: 400 };
const DPI = 2;

interface ToolPreview {
  slug: string;
  /** Inline HTML for the preview body. Use realistic sample data, not lorem ipsum. */
  renderHTML: () => string;
}

const TOOLS: ToolPreview[] = [
  {
    // Schema generator output is JSON-LD metadata invisible to site visitors,
    // so we mirror the portal UI showing the generated code block instead.
    slug: "schema",
    renderHTML: () => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; background: #ffffff; border-radius: 10px; border: 1px solid #e5e7eb; width: 480px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
          <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: #0f172a;">Local Business Schema</h2>
          <span style="font-size: 11px; padding: 3px 8px; background: #ecfdf5; color: #047857; border-radius: 999px; font-weight: 600;">JSON-LD</span>
        </div>
        <pre style="margin: 0; background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; font-size: 11px; line-height: 1.65; font-family: 'SF Mono', Menlo, monospace; overflow: hidden;">&lt;script type="application/ld+json"&gt;
{
  "@context": "https://schema.org",
  "@type": "Plumber",
  "name": "Joe's Plumbing",
  "telephone": "+1-555-0123",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "120 Main St",
    "addressLocality": "Austin",
    "addressRegion": "TX"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.9",
    "reviewCount": "187"
  }
}
&lt;/script&gt;</pre>
      </div>`,
  },
  {
    slug: "faq",
    renderHTML: () => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; background: #ffffff; border-radius: 10px; border: 1px solid #e5e7eb; width: 480px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
        <h2 style="font-size: 17px; font-weight: 600; margin: 0 0 14px; color: #0f172a;">Frequently Asked Questions</h2>
        <details open style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; background: #f8fafc;">
          <summary style="font-weight: 600; cursor: pointer; font-size: 14px; color: #0f172a; list-style: none; display: flex; justify-content: space-between; align-items: center;">
            How long does a typical job take?
            <span style="color: #0d3cfc; font-size: 16px;">−</span>
          </summary>
          <p style="margin: 10px 0 0; color: #475569; font-size: 13px; line-height: 1.55;">Most service calls are wrapped up within 2–4 hours. Larger installs (water heater swaps, repipes) we schedule a half-day window.</p>
        </details>
        <details style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px;">
          <summary style="font-weight: 600; cursor: pointer; font-size: 14px; color: #0f172a; list-style: none; display: flex; justify-content: space-between; align-items: center;">
            Do you offer free estimates?
            <span style="color: #94a3b8; font-size: 16px;">+</span>
          </summary>
        </details>
        <details style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px;">
          <summary style="font-weight: 600; cursor: pointer; font-size: 14px; color: #0f172a; list-style: none; display: flex; justify-content: space-between; align-items: center;">
            What areas do you serve?
            <span style="color: #94a3b8; font-size: 16px;">+</span>
          </summary>
        </details>
      </div>`,
  },
  {
    slug: "hours",
    renderHTML: () => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; background: #ffffff; border-radius: 10px; border: 1px solid #e5e7eb; width: 360px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
        <div style="display: inline-flex; align-items: center; gap: 8px; padding: 7px 13px; background: #ecfdf5; color: #047857; border-radius: 999px; font-weight: 600; margin-bottom: 16px; font-size: 13px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.18);"></span>
          Open now · Closes 6:00 PM
        </div>
        <table style="font-size: 14px; line-height: 1.85; width: 100%; border-collapse: collapse;">
          <tbody>
            <tr><td style="padding-right: 24px; color: #6b7280; width: 110px;">Monday</td><td style="color: #0f172a;">9:00 AM – 6:00 PM</td></tr>
            <tr><td style="padding-right: 24px; color: #6b7280;">Tuesday</td><td style="color: #0f172a;">9:00 AM – 6:00 PM</td></tr>
            <tr style="background: #eff6ff; font-weight: 600;"><td style="padding-right: 24px; padding-left: 6px; color: #0d3cfc; border-radius: 4px 0 0 4px;">Wednesday</td><td style="color: #0d3cfc;">9:00 AM – 6:00 PM · Today</td></tr>
            <tr><td style="padding-right: 24px; color: #6b7280;">Thursday</td><td style="color: #0f172a;">9:00 AM – 6:00 PM</td></tr>
            <tr><td style="padding-right: 24px; color: #6b7280;">Friday</td><td style="color: #0f172a;">9:00 AM – 6:00 PM</td></tr>
            <tr><td style="padding-right: 24px; color: #6b7280;">Saturday</td><td style="color: #0f172a;">10:00 AM – 2:00 PM</td></tr>
            <tr><td style="padding-right: 24px; color: #6b7280;">Sunday</td><td style="color: #94a3b8;">Closed</td></tr>
          </tbody>
        </table>
      </div>`,
  },
  {
    slug: "badges",
    renderHTML: () => `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; background: #ffffff; border-radius: 10px; border: 1px solid #e5e7eb; width: 480px; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
        <div style="font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">Trusted by 1,200+ neighbors</div>
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; background: #ffffff;">
            <span style="font-size: 18px;">🛡️</span>
            <span style="font-weight: 600; font-size: 13px; color: #0f172a;">Licensed &amp; Insured</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; background: #ffffff;">
            <span style="font-size: 18px; color: #f59e0b;">★</span>
            <span style="font-weight: 600; font-size: 13px; color: #0f172a;">4.9 Google · 187 reviews</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; background: #ffffff;">
            <span style="font-size: 18px;">🏆</span>
            <span style="font-weight: 600; font-size: 13px; color: #0f172a;">BBB A+ Rated</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; background: #ffffff;">
            <span style="font-size: 18px;">🇺🇸</span>
            <span style="font-weight: 600; font-size: 13px; color: #0f172a;">Veteran-Owned</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1.5px solid #e5e7eb; border-radius: 8px; background: #ffffff;">
            <span style="font-size: 18px;">⚡</span>
            <span style="font-weight: 600; font-size: 13px; color: #0f172a;">24/7 Emergency</span>
          </div>
        </div>
      </div>`,
  },
];

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log(`[free-tool-previews] out=${path.relative(REPO_ROOT, OUTPUT_DIR)}`);
  console.log(`[free-tool-previews] tools=${TOOLS.length}`);

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    console.error(
      "[free-tool-previews] Failed to launch Chromium. Run `npx playwright install chromium` first.",
      (err as Error).message,
    );
    process.exit(1);
  }

  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DPI,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  let ok = 0;
  let failed = 0;
  for (const tool of TOOLS) {
    process.stdout.write(`[free-tool-previews] ${tool.slug} ... `);
    try {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin: 0; background: #f1f5f9; min-height: ${VIEWPORT.height}px; display: flex; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box;">${tool.renderHTML()}</body></html>`;
      await page.setContent(html, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(200); // let layout settle
      const buf = await page.screenshot({
        type: "png",
        omitBackground: false,
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: VIEWPORT.height },
      });
      const outPath = path.join(OUTPUT_DIR, `${tool.slug}.png`);
      await writeFile(outPath, buf);
      console.log(`OK (${buf.length} bytes)`);
      ok += 1;
    } catch (err) {
      console.log(`FAIL — ${(err as Error).message}`);
      failed += 1;
    }
  }

  await context.close();
  await browser.close();
  console.log(`[free-tool-previews] done. ok=${ok} failed=${failed} total=${TOOLS.length}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[free-tool-previews] fatal:", err);
  process.exit(1);
});
