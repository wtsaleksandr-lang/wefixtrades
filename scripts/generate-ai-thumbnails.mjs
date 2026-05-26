#!/usr/bin/env node
/**
 * Wave 15 — AI-generated brand thumbnails.
 *
 * Generates brand-aligned marketing imagery for:
 *   1. The first 4 calculator template cards on /templates (4 thumbnails @ 1024x768).
 *   2. The 6 free-tool /tools/* pages (6 hero images @ 1536x1024 + 6 cross-link
 *      thumbnails @ 1024x768 — 12 total).
 *
 * Provider: Pollinations.ai (free, no auth, FLUX model). Mirrors the rotation
 * top of `server/services/contentflow/imageOrchestrator.ts` but runs as a
 * standalone CLI so we don't need a live server context to invoke it.
 *
 * Output:
 *   client/public/ai-thumbnails/templates/<template-id>.png
 *   client/public/ai-thumbnails/tools/<tool-slug>-hero.png      (1536x1024)
 *   client/public/ai-thumbnails/tools/<tool-slug>-thumb.png     ( 1024x768)
 *
 * Brand prompt skeleton: dark navy background, electric brand-blue accent
 * (rgb(13,60,252)), clean modern, isometric or top-down, NO text, NO logos.
 *
 * Run: `node scripts/generate-ai-thumbnails.mjs`
 *
 * Idempotent: skips files that already exist unless --force is passed.
 */

import { writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const OUT_ROOT = path.join(REPO_ROOT, "client", "public", "ai-thumbnails");
const TEMPLATE_DIR = path.join(OUT_ROOT, "templates");
const TOOL_DIR = path.join(OUT_ROOT, "tools");

const FORCE = process.argv.includes("--force");

/* ─── Asset catalogue ─── */

/**
 * First-row calculator templates on /templates (registry display order in
 * shared/templatePresets.ts: car_towing, driveway_paving, property_cleaning,
 * energy_upgrade). For Alex review before Wave 15.5 generates the rest.
 */
const TEMPLATES = [
  {
    id: "car_towing",
    trade: "vehicle towing service",
    detail:
      "a tow truck silhouette and a smartphone showing a tow-dispatch app with a clean ETA and price summary",
    aspect: "4:3",
  },
  {
    id: "driveway_paving",
    trade: "driveway paving contractor",
    detail:
      "an isometric tablet mockup showing a paving quote calculator with a clean material picker and price card, beside a stylised asphalt driveway swatch",
    aspect: "4:3",
  },
  {
    id: "property_cleaning",
    trade: "residential cleaning service",
    detail:
      "an isometric tablet mockup showing a room-based cleaning quote calculator with sparkle accents and a price card",
    aspect: "4:3",
  },
  {
    id: "energy_upgrade",
    trade: "home energy upgrade contractor",
    detail:
      "an isometric tablet mockup showing a home-efficiency upgrade calculator with a stylised leaf glyph and a savings price card",
    aspect: "4:3",
  },
];

/**
 * Six free-tool pages (PR #811 + #821). Each entry produces a hero image
 * (16:9) for the page hero and a thumbnail (4:3) for cross-link cards.
 */
const TOOLS = [
  {
    slug: "citation-checker",
    name: "Citation Checker",
    concept:
      "a grid of directory listing cards with a magnifying glass scanning across them, glowing brand-blue accents on the highlighted cards",
  },
  {
    slug: "google-review-link-generator",
    name: "Google Review Link Generator",
    concept:
      "a stylised smartphone showing a five-star rating screen with a chain-link icon hovering above, brand-blue glow around the link icon",
  },
  {
    slug: "local-rank-grid",
    name: "Local Rank Grid",
    concept:
      "a 5x5 isometric heatmap grid over a city map, green pins on the top cells, red pins on the bottom cells, brand-blue accent lines connecting them",
  },
  {
    slug: "local-rank-tracker",
    name: "Local Rank Tracker",
    concept:
      "an ascending bar chart with three small search-engine glyphs (a G, a B, a generic map pin) floating above the top bar, brand-blue gradient bars",
  },
  {
    slug: "local-rankflux",
    name: "Local RankFlux",
    concept:
      "a semicircular gauge dial with a needle pointing into a yellow caution zone, soft brand-blue background, clean modern dashboard aesthetic",
  },
  {
    slug: "local-serp-checker",
    name: "Local SERP Checker",
    concept:
      "a search results page mockup with a prominent location pin and a stylised globe icon, brand-blue accents on the active result row",
  },
];

/* ─── Prompt assembly ─── */

function templatePrompt(t) {
  return [
    `Professional marketing illustration for a ${t.trade} business`,
    t.detail,
    "dark navy background (#0a0e27 to #050817 gradient)",
    "electric brand-blue accent rgb(13,60,252) with subtle glow",
    "isometric perspective, soft shadows, sharp focus, photorealistic 3D render",
    "modern clean trades-business professional aesthetic",
    "4:3 aspect ratio, centered composition, generous negative space",
    "NO text content, NO words, NO letters, NO logos, NO brand marks",
  ].join(", ");
}

function toolPrompt(t, kind) {
  const aspectHint = kind === "hero" ? "16:9 wide aspect ratio, cinematic composition" : "4:3 aspect ratio, centered composition";
  return [
    `Minimalist abstract marketing illustration representing ${t.concept}`,
    "dark navy background (#0a0e27 to #050817 gradient)",
    "electric brand-blue accent rgb(13,60,252) and clean white highlights",
    "modern tech aesthetic, isometric or top-down perspective",
    "professional clean style, soft shadows, sharp focus, 3D render",
    aspectHint,
    "NO text content, NO words, NO letters, NO logos, NO brand marks",
  ].join(", ");
}

/* ─── Pollinations call ─── */

/**
 * Pollinations supports several free models. As of 2026-05-26 the `flux`
 * model began returning 402 (Payment Required) — the `turbo` (SDXL) and
 * default models remain freely accessible, but the IP-level queue allows
 * only 1 outstanding request. When Pollinations returns 402 we fall back
 * to Hugging Face FLUX.1-schnell (free tier with HUGGINGFACE_API_KEY).
 */
const POLLINATIONS_MODEL = process.env.POLLINATIONS_MODEL || "turbo";

async function pollinations(prompt, width, height, timeoutMs = 180_000) {
  const seed = Math.floor(Math.random() * 1_000_000); // stable-ish but new per run
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?model=${POLLINATIONS_MODEL}&width=${width}&height=${height}&nologo=true&seed=${seed}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    if (!res.ok) throw new Error(`pollinations ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4096) throw new Error(`pollinations: response too small (${buf.length} bytes)`);
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function togetherFlux(prompt, width, height, timeoutMs = 120_000) {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error("TOGETHER_API_KEY missing");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.together.xyz/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "black-forest-labs/FLUX.1-schnell",
        prompt,
        width,
        height,
        steps: 4,
        n: 1,
        response_format: "b64_json",
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`together ${res.status}: ${text.slice(0, 160)}`);
    }
    const json = await res.json();
    const item = json?.data?.[0];
    if (item?.b64_json) {
      const buf = Buffer.from(item.b64_json, "base64");
      if (buf.length < 4096) throw new Error(`together: response too small (${buf.length} bytes)`);
      return buf;
    }
    if (item?.url) {
      const fetched = await fetch(item.url);
      if (!fetched.ok) throw new Error(`together fetch ${fetched.status}`);
      const buf = Buffer.from(await fetched.arrayBuffer());
      if (buf.length < 4096) throw new Error(`together: response too small (${buf.length} bytes)`);
      return buf;
    }
    throw new Error("together: no image in response");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Provider chain — try Pollinations turbo first (free, cached), fall back
 * to Together AI FLUX.1-schnell when Pollinations 402's. Together's
 * schnell pricing is ~$0.003/megapixel → 16 images at ~1MP ≈ $0.05 total
 * worst case, well under the $1 wave budget.
 */
async function generateBuffer(prompt, width, height) {
  try {
    const buf = await pollinations(prompt, width, height);
    return { buf, provider: `pollinations:${POLLINATIONS_MODEL}` };
  } catch (err) {
    if (process.env.TOGETHER_API_KEY) {
      const buf = await togetherFlux(prompt, width, height);
      return { buf, provider: "together:flux-schnell" };
    }
    throw err;
  }
}

/* ─── File helpers ─── */

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function generateOne(label, outPath, prompt, width, height) {
  if (!FORCE && (await exists(outPath))) {
    console.log(`[skip] ${label} → ${path.relative(REPO_ROOT, outPath)} (exists, pass --force to regen)`);
    return { ok: true, skipped: true };
  }
  const t0 = Date.now();
  let lastErr = null;
  // 3 attempts — Pollinations occasionally returns a tiny / blank PNG or
  // takes >180s under load. Backoff between attempts.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      process.stdout.write(`[gen] ${label} (${width}x${height}) attempt ${attempt} ... `);
      const { buf, provider } = await generateBuffer(prompt, width, height);
      await mkdir(path.dirname(outPath), { recursive: true });
      await writeFile(outPath, buf);
      const ms = Date.now() - t0;
      console.log(`OK ${(buf.length / 1024).toFixed(0)}kb in ${ms}ms via ${provider}`);
      return { ok: true, skipped: false, bytes: buf.length, provider };
    } catch (err) {
      lastErr = err;
      console.log(`FAIL ${err.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 5_000 * attempt));
    }
  }
  return { ok: false, error: lastErr?.message };
}

/* ─── Main ─── */

async function main() {
  await mkdir(TEMPLATE_DIR, { recursive: true });
  await mkdir(TOOL_DIR, { recursive: true });

  console.log(`[ai-thumbnails] out=${path.relative(REPO_ROOT, OUT_ROOT)}`);
  console.log(`[ai-thumbnails] templates=${TEMPLATES.length} tools=${TOOLS.length}`);
  console.log(`[ai-thumbnails] provider=pollinations.ai (free) model=${POLLINATIONS_MODEL}`);
  console.log(`[ai-thumbnails] force=${FORCE}`);
  console.log("");

  /**
   * Build the full job list, then run with bounded parallelism. Pollinations
   * tolerates 2-3 concurrent requests well; more risks 429s.
   */
  const jobs = [];
  for (const t of TEMPLATES) {
    jobs.push({
      kind: "template",
      id: t.id,
      label: `template:${t.id}`,
      outPath: path.join(TEMPLATE_DIR, `${t.id}.png`),
      prompt: templatePrompt(t),
      width: 1024,
      height: 768,
    });
  }
  for (const t of TOOLS) {
    jobs.push({
      kind: "tool-hero",
      id: t.slug,
      label: `tool:${t.slug}:hero`,
      outPath: path.join(TOOL_DIR, `${t.slug}-hero.png`),
      prompt: toolPrompt(t, "hero"),
      width: 1280,
      height: 720,
    });
    jobs.push({
      kind: "tool-thumb",
      id: t.slug,
      label: `tool:${t.slug}:thumb`,
      outPath: path.join(TOOL_DIR, `${t.slug}-thumb.png`),
      prompt: toolPrompt(t, "thumb"),
      width: 1024,
      height: 768,
    });
  }

  /**
   * Concurrency=1 — Pollinations' free tier enforces a 1-request-per-IP
   * queue. Higher concurrency results in HTTP 402 "Queue full" responses
   * with an x402 payment challenge body. Sequential is the only safe mode.
   */
  const CONCURRENCY = 1;
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const i = cursor++;
      const j = jobs[i];
      const r = await generateOne(j.label, j.outPath, j.prompt, j.width, j.height);
      results.push({ kind: j.kind, id: j.id, ...r, outPath: j.outPath });
      // Small spacer between requests so Pollinations' 1-per-IP queue
      // settles before the next request races in.
      if (!r.skipped) await new Promise((res) => setTimeout(res, 1_500));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log("");
  const ok = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`[ai-thumbnails] done. generated=${ok} skipped=${skipped} failed=${failed} total=${results.length}`);
  if (failed > 0) {
    console.error("[ai-thumbnails] failures:");
    for (const r of results.filter((x) => !x.ok)) {
      console.error(`  ${r.kind}:${r.id} → ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[ai-thumbnails] fatal:", err);
  process.exit(1);
});
