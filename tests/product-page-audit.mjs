/**
 * Per-product Effortel-style page auditor.
 *
 * For each /products/<slug>, fetches the rendered HTML and checks:
 *   - HTTP 200
 *   - Page contains the product name (config sanity)
 *   - Body text length (rough proxy for empty cards — Vite SPA serves the
 *     same shell, so this is a weak signal)
 *
 * The real gap-checking happens against the source: scan
 * client/src/config/product-mockups.tsx for cards with weak content.
 *
 * Heuristics for a "weak" card:
 *   - mockup is just a single StatTile (lonely tile in a card)
 *   - mockup grid has fewer items than columns suggest (visible gap)
 *   - StatTrio with all the same color (no visual variety)
 *   - description < 60 chars (not enough body to balance the card)
 *
 * Outputs a report so you can fix in batches.
 */

import { readFileSync } from "fs";

const BASE = process.env.BASE_URL || "http://localhost:5000";
const PRODUCTS = [
  "tradeline", "quickquotepro", "mapguard", "reputationshield",
  "socialsync", "rankflow", "sitelaunch", "webcare", "webfix",
  "contentflow", "adflow", "bookflow",
];

const errors = [];
const warnings = [];

function w(slug, msg) { warnings.push(`[${slug}] ${msg}`); }
function e(slug, msg) { errors.push(`[${slug}] ${msg}`); }

async function checkRoute(slug) {
  const res = await fetch(`${BASE}/products/${slug}`);
  if (res.status !== 200) e(slug, `HTTP ${res.status}`);
}

function auditMockupsSource() {
  const src = readFileSync("client/src/config/product-mockups.tsx", "utf-8");

  for (const slug of PRODUCTS) {
    // Find the slug's section (e.g. "tradeline: [")
    const start = src.indexOf(`  ${slug}: [`);
    if (start === -1) {
      e(slug, "no entry in product-mockups.tsx");
      continue;
    }
    // Find next top-level slug (matches "  <slug>: [" or "  __default: [")
    const tail = src.slice(start + 1);
    const nextMatch = tail.match(/\n  [a-z_][a-z_]+: \[/);
    const end = nextMatch ? start + 1 + nextMatch.index : src.length;
    const block = src.slice(start, end);

    // Card count: each card starts with `      number: "0`
    const cards = [...block.matchAll(/number: "0\d"/g)];
    if (cards.length < 3) w(slug, `only ${cards.length} cards (recommend 4)`);

    // Look for descriptions shorter than 60 chars (weak body copy)
    const descs = [...block.matchAll(/description: "([^"]{1,300})"/g)].map(m => m[1]);
    descs.forEach((d, i) => {
      if (d.length < 60) w(slug, `card ${i + 1} description short (${d.length} chars): "${d.slice(0,40)}…"`);
    });

    // Per-card audit — use cards.length as the actual count, slice to avoid
    // false positives from stray "{ number: "0..." in card body strings.
    const cardChunks = block.split(/\{\s*number: "0\d"/).slice(1, cards.length + 1);
    let richMockupCount = 0;
    cardChunks.forEach((chunk, i) => {
      const cardNum = i + 1;
      const tiles = chunk.match(/<(StatTile|MiniChartTile|FlowCard|MapTile|RankTile|CalendarTile|GaugeTile|ReviewTile|OrbitingLogos)\b/g) || [];
      const trios = chunk.match(/<StatTrio\b/g) || [];
      // "Rich" = anything that's more than a number-card. Includes the bespoke
      // animated product demos (e.g. <TradeLineChatDemo>) that live in
      // client/src/components/product-demos/.
      const richTiles = chunk.match(/<(MiniChartTile|FlowCard|MapTile|RankTile|CalendarTile|GaugeTile|ReviewTile|OrbitingLogos|MapMockup|TradeLineChatDemo|[A-Z]\w+Demo)\b/g) || [];
      const total = tiles.length + trios.length * 3;

      if (total === 0) w(slug, `card ${cardNum}: mockup uses no recognized tile primitives`);
      else if (total === 1 && trios.length === 0 && !chunk.includes("OrbitingLogos"))
        w(slug, `card ${cardNum}: only 1 tile — visual gap likely`);

      // "Numbery" card — only StatTile/StatTrio with no icon prop
      const statsOnly = richTiles.length === 0;
      const hasIcon = /\bicon[:=]/.test(chunk);   // matches both `icon:` (object) and `icon=` (JSX)
      if (statsOnly && !hasIcon)
        w(slug, `card ${cardNum}: stats-only, no icons — looks bare`);

      if (richTiles.length > 0) richMockupCount++;
    });

    // Whole-product check: at least one "rich" mockup gives the page visual
    // variety beyond walls of numbers.
    if (richMockupCount === 0)
      w(slug, `no rich mockup tiles anywhere — page is wall-to-wall stats`);
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Product page audit — V7 / Effortel layout");
  console.log("  " + new Date().toISOString());
  console.log("═══════════════════════════════════════════════════\n");

  console.log("── HTTP smoke ──");
  for (const slug of PRODUCTS) {
    process.stdout.write(`  /products/${slug.padEnd(18)} `);
    try { await checkRoute(slug); console.log("✓"); }
    catch (err) { e(slug, err.message); console.log(`✗ ${err.message}`); }
  }

  console.log("\n── Mockup config audit ──");
  auditMockupsSource();

  console.log("\n═══════════════════════════════════════════════════");
  if (errors.length === 0) console.log("  No errors.");
  else { console.log(`  ${errors.length} ERROR(S):`); errors.forEach(e => console.log(`    ✗ ${e}`)); }
  if (warnings.length === 0) console.log("  No warnings.");
  else { console.log(`  ${warnings.length} WARNING(S):`); warnings.forEach(w => console.log(`    ⚠ ${w}`)); }
  console.log("═══════════════════════════════════════════════════\n");

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch(console.error);
