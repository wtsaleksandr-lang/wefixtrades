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
  {
    // Mirrors the customer-facing /r/{slug} landing page with the 5-star
    // picker in a hover-active state (4 stars filled) and business header.
    slug: "review-link",
    renderHTML: () => `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: white; padding: 32px 24px; max-width: 480px; margin: 0 auto; text-align: center; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <div style="width: 56px; height: 56px; border-radius: 12px; background: linear-gradient(135deg, #0d3cfc, #0a2fd0); margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 24px;">JP</div>
      <h2 style="margin: 0 0 6px; font-size: 20px; font-weight: 700; color: #0f172a;">How was your experience with Joe's Plumbing?</h2>
      <p style="margin: 0 0 24px; color: #64748b; font-size: 14px;">Your feedback helps us improve.</p>
      <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 8px;">
        ${[1, 2, 3, 4, 5].map((_, i) => `<button style="width: 48px; height: 48px; border: 2px solid ${i < 4 ? "#f59e0b" : "#e5e7eb"}; background: ${i < 4 ? "#fef3c7" : "white"}; border-radius: 8px; font-size: 24px; color: ${i < 4 ? "#f59e0b" : "#9ca3af"}; cursor: pointer;">★</button>`).join("")}
      </div>
      <p style="margin: 16px 0 0; color: #94a3b8; font-size: 11px;">Powered by <strong>WeFixTrades</strong></p>
    </div>`,
  },
  {
    // Mirrors the printable business card with QR code. Placeholder QR
    // pattern (not scannable) — just a visual stand-in for the preview.
    slug: "qr-card",
    renderHTML: () => `<div style="background: #f1f5f9; padding: 40px;">
      <div style="width: 336px; height: 192px; background: white; border-radius: 8px; padding: 18px; box-shadow: 0 4px 12px rgba(0,0,0,0.10); display: flex; gap: 16px; box-sizing: border-box;">
        <div style="flex: 1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <div style="font-size: 16px; font-weight: 700; margin-bottom: 4px; color: #0f172a;">Joe's Plumbing</div>
          <div style="font-size: 11px; color: #64748b; margin-bottom: 12px;">Trusted since 1998</div>
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px; color: #0f172a;">Rate your experience</div>
          <div style="font-size: 10px; color: #64748b;">Scan the QR code to leave a quick review on Google.</div>
          <div style="font-size: 9px; color: #94a3b8; margin-top: 18px;">wefixtrades.com</div>
        </div>
        <div style="flex-shrink: 0; width: 110px; height: 110px; background: linear-gradient(45deg, #0f172a 25%, white 25%, white 50%, #0f172a 50%, #0f172a 75%, white 75%); background-size: 12px 12px; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
          <div style="background: white; padding: 4px; font-size: 10px; color: #0f172a; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">QR</div>
        </div>
      </div>
    </div>`,
  },
  {
    // Mirrors the inline-mode callback form widget with realistic urgent
    // plumbing sample data pre-filled.
    slug: "callback",
    renderHTML: () => `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: white; padding: 24px; max-width: 380px; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 2px 12px rgba(0,0,0,0.06); box-sizing: border-box;">
      <h3 style="margin: 0 0 6px; font-size: 17px; font-weight: 700; color: #0f172a;">Request a callback</h3>
      <p style="margin: 0 0 16px; color: #64748b; font-size: 13px;">We'll get back to you within a few hours.</p>
      <div style="margin-bottom: 10px;">
        <input type="text" value="Sarah Chen" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; color: #0f172a;" />
      </div>
      <div style="margin-bottom: 10px;">
        <input type="text" value="+1 (555) 123-4567" style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; color: #0f172a;" />
      </div>
      <div style="margin-bottom: 10px;">
        <textarea style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; min-height: 56px; resize: none; color: #0f172a; font-family: inherit;">Burst pipe under kitchen sink — water shut off. Need ASAP.</textarea>
      </div>
      <div style="margin-bottom: 14px;">
        <select style="width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; background: white; color: #0f172a;">
          <option>Best time: Right now (urgent)</option>
        </select>
      </div>
      <button style="width: 100%; padding: 11px 0; background: linear-gradient(to bottom, #0d3cfc, #0a2fd0); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 1px 0 rgba(255,255,255,0.10) inset, 0 4px 12px rgba(13,60,252,0.25);">Send request</button>
      <p style="margin: 12px 0 0; color: #94a3b8; font-size: 10px; text-align: center;">Powered by <strong>WeFixTrades</strong></p>
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
