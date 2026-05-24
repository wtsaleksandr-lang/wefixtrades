#!/usr/bin/env node
/**
 * SEO — per-product OG card generator.
 *
 * Writes a 1200x630 SVG per product to `client/public/og/<slug>.svg`.
 * SVG was chosen over PNG because (a) the repo does not depend on
 * `sharp` or any other server-side image lib and adding one for a
 * one-shot output is overkill; (b) Twitter, Facebook, LinkedIn, and
 * Slack all rasterize SVG OG cards correctly when served with the
 * right Content-Type (Vite already serves .svg as image/svg+xml).
 *
 * Each card uses the WeFixTrades brand palette: deep slate background
 * with the brand-accent blue radial glow + the product name as the
 * dominant element and the WeFixTrades wordmark as the footer.
 *
 * Run: `node scripts/seo/generate-og-images.mjs`
 *
 * Idempotent: rewrites every file on every invocation. Cheap (<5ms
 * per card), and keeps the design tied to this script in source.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const OUT_DIR = join(REPO_ROOT, "client", "public", "og");

// Mirrors `client/src/config/products.ts` — kept inline so this script
// can run without the TS toolchain. Update both lists when adding a
// new product page (12 slugs as of PR #683).
const PRODUCTS = [
  { slug: "tradeline", name: "24/7 TradeLine", tagline: "Never miss a lead. AI answers every call." },
  { slug: "quickquotepro", name: "QuoteQuick", tagline: "Instant quotes on your website. Live in 5 minutes." },
  { slug: "mapguard", name: "MapGuard", tagline: "Managed Google Maps visibility for trades." },
  { slug: "webcare", name: "WebCare", tagline: "Website monitoring + maintenance, done for you." },
  { slug: "sitelaunch", name: "SiteLaunch", tagline: "Professional trade website. Live in 5 days." },
  { slug: "socialsync", name: "SocialSync", tagline: "Done-for-you social media posting." },
  { slug: "reputationshield", name: "ReputationShield", tagline: "Automated review growth + reputation protection." },
  { slug: "rankflow", name: "RankFlow", tagline: "Done-for-you local SEO for trades." },
  { slug: "webfix", name: "WebFix", tagline: "One-time website speed + SEO fixes." },
  { slug: "contentflow", name: "ContentFlow", tagline: "AI-powered content + multi-channel publishing." },
  { slug: "adflow", name: "AdFlow", tagline: "Managed Google + Meta ads for trades." },
  { slug: "bookflow", name: "BookFlow", tagline: "Simple online booking for trades." },
];

// Brand tokens — kept in sync with `client/src/theme/tokens.ts`
// (mkt.bg / mkt.accent / mkt.onDark). Locked from the brand-badges
// memory rule — touch the source tokens if you ever change them, not
// these inlined values.
const BG = "#0B1220";
const PANEL = "#111A2E";
const ACCENT = "#0D3CFC";
const TEXT = "#FFFFFF";
const MUTED = "#A6B0C2";
const FAINT = "#5B6479";

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSvg({ name, tagline }) {
  // 1200x630 is the Open Graph standard (used by Facebook, LinkedIn,
  // Slack) and is also the optimal large-card size for Twitter.
  const W = 1200;
  const H = 630;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="${PANEL}"/>
    </linearGradient>
    <radialGradient id="glow" cx="20%" cy="20%" r="70%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.35"/>
      <stop offset="60%" stop-color="${ACCENT}" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <!-- Subtle hairline grid for brand consistency with marketing surfaces. -->
  <g stroke="${FAINT}" stroke-opacity="0.08" stroke-width="1">
    <line x1="0" y1="120" x2="${W}" y2="120"/>
    <line x1="0" y1="510" x2="${W}" y2="510"/>
  </g>
  <!-- Eyebrow -->
  <text x="80" y="170" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="22" fill="${ACCENT}" letter-spacing="6">WEFIXTRADES · PRODUCT</text>
  <!-- Product name -->
  <text x="80" y="320" font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif" font-size="96" font-weight="700" fill="${TEXT}" letter-spacing="-2">${escapeXml(name)}</text>
  <!-- Tagline -->
  <text x="80" y="400" font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif" font-size="34" fill="${MUTED}">${escapeXml(tagline)}</text>
  <!-- Accent bar -->
  <rect x="80" y="450" width="120" height="6" rx="3" fill="${ACCENT}"/>
  <!-- Footer wordmark -->
  <text x="80" y="570" font-family="Inter, system-ui, -apple-system, Segoe UI, sans-serif" font-size="26" font-weight="700" fill="${TEXT}">WeFixTrades<tspan fill="${ACCENT}">.</tspan></text>
  <text x="${W - 80}" y="570" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="20" fill="${FAINT}" text-anchor="end" letter-spacing="2">wefixtrades.com</text>
</svg>
`;
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const p of PRODUCTS) {
    const svg = buildSvg(p);
    const file = join(OUT_DIR, `${p.slug}.svg`);
    writeFileSync(file, svg, "utf8");
    process.stdout.write(`wrote ${file}\n`);
  }
  process.stdout.write(`\nDone. ${PRODUCTS.length} OG cards written to ${OUT_DIR}\n`);
}

main();
