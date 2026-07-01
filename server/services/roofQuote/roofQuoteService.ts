/**
 * Roof-Quote backend service — ported from the proven standalone widget server
 * at `spikes/roof-quote/serve.mjs`. This is a faithful TypeScript port of the
 * raw-HTTP helpers; the logic (render prompts, camera math, provider failover,
 * disk cache) is intentionally unchanged — it is proven and must not be
 * "improved".
 *
 * Routes consume these functions from `server/routes/roofQuoteRoutes.ts`.
 *
 * Env keys (read LAZILY inside each helper so a missing key never crashes boot):
 *   - ROOFQUOTE_SOLAR_KEY || GOOGLE_MAPS_API_KEY  → geocode / solar / datalayers / geotiff / streetview / capture-bearing
 *   - GEMINI_API_KEY                              → houseKnowledge vision + roof-feature detection
 *   - REPLICATE_API_TOKEN                         → renderReplicate
 *   - OPENAI_API_KEY                              → renderOpenAI (final tier only)
 *   - FAL_KEY                                     → renderFal
 *   (the tiles key — ROOFQUOTE_TILES_KEY || GOOGLE_MAPS_API_KEY — is consumed in the route layer, not here)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, createReadStream, createWriteStream, renameSync, unlinkSync } from "fs";
import path from "path";
import os from "os";
import https from "https";
import zlib from "zlib";
import readline from "readline";
import { createHash } from "crypto";
import { chromium, type Browser } from "playwright";
import { createLogger } from "../../lib/logger";
import { noisyCatch } from "../../lib/silentFailureGuard";
import { detectRoofFeatures } from "../../roofQuote/assets/rooffeatures.mjs";
import { buildRoofMask, compositeThroughMask } from "./roofMask";

const log = createLogger("RoofQuote");

// ── lazy env readers ────────────────────────────────────────────────────────
const solarKey = (): string =>
  process.env.ROOFQUOTE_SOLAR_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
const replicateKey = (): string => process.env.REPLICATE_API_TOKEN || "";
// Static-Maps tiles key for the top-down satellite base (spike's TILES). Mirrors the
// route layer's tiles-key resolution so the roof-only path uses the same billed key.
const tilesKey = (): string =>
  process.env.ROOFQUOTE_TILES_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
const geminiKey = (): string => process.env.GEMINI_API_KEY || "";
const falKey = (): string => process.env.FAL_KEY || "";
const openaiKey = (): string => process.env.OPENAI_API_KEY || "";

// ── persistent disk cache: captures + AI renders survive restarts (cost lever) ──
const CACHE_DIR = path.join(process.cwd(), ".cache", "roofquote");
try {
  mkdirSync(CACHE_DIR, { recursive: true });
} catch {
  /* fall back to tmp below if cwd cache is unwritable */
}
function cacheDir(): string {
  if (existsSync(CACHE_DIR)) return CACHE_DIR;
  const tmp = path.join(os.tmpdir(), "roofquote-cache");
  try {
    mkdirSync(tmp, { recursive: true });
  } catch {
    /* best-effort */
  }
  return tmp;
}
const ckey = (s: unknown): string =>
  createHash("sha1").update(String(s)).digest("hex").slice(0, 16);
function diskGetJSON<T = unknown>(prefix: string, key: string): T | null {
  const f = path.join(cacheDir(), prefix + "-" + ckey(key) + ".json");
  if (existsSync(f)) {
    try {
      return JSON.parse(readFileSync(f, "utf8")) as T;
    } catch {
      /* corrupt cache entry — ignore */
    }
  }
  return null;
}
function diskSetJSON(prefix: string, key: string, val: unknown): void {
  try {
    writeFileSync(path.join(cacheDir(), prefix + "-" + ckey(key) + ".json"), JSON.stringify(val));
  } catch {
    /* cache write is best-effort */
  }
}
function diskGetBuf(prefix: string, key: string): Buffer | null {
  const f = path.join(cacheDir(), prefix + "-" + ckey(key) + ".bin");
  if (existsSync(f)) {
    try {
      return readFileSync(f);
    } catch {
      /* ignore */
    }
  }
  return null;
}
function diskSetBuf(prefix: string, key: string, buf: Buffer): void {
  try {
    writeFileSync(path.join(cacheDir(), prefix + "-" + ckey(key) + ".bin"), buf);
  } catch {
    /* best-effort */
  }
}

// ── in-memory caches (avoid paying twice for the same render within a process) ──
const aiCache = new Map<string, AiRenderResult>();
const featuresCache = new Map<string, unknown>();
const knowledgeCache = new Map<string, string>();
const captureCache = new Map<string, Buffer>();

// View of the base image fed to the repaint model. The oblique aerial frames the
// roof from above; a street-level (Street View) photo frames the house from the
// curb, so the prompt anchors which surfaces to preserve differently.
type BaseView = "oblique" | "street";

// ── render prompt (ported from serve.mjs; extended with a street-level variant) ──
function roofPrompt(material: string, pkg: string, view: BaseView = "oblique"): string {
  // STRONG preservation anchor — img2img models (Flux Kontext) will otherwise regenerate a whole new house for
  // dramatic materials (e.g. metal). Lead with "edit THIS photo / same house / do NOT generate a new house".
  const geom = pkg
    ? " The roof is " + pkg + "; keep that exact roof geometry — ridges, planes, pitch and outline."
    : "";
  if (view === "street") {
    // Street-level photo: only the upper portion (the visible roof slope) changes; the
    // façade, sky, yard and street must stay pixel-identical.
    return (
      "Edit THIS exact street-level photo of a house. Replace ONLY the visible roof covering (the sloped roof surface) of the main house in the centre with " +
      material +
      ", covering the whole visible roof." +
      geom +
      " Keep the IDENTICAL same house from the input photo — same walls, siding, windows, doors, porch, chimney, gutters, lawn, driveway, vehicles, fences, trees, neighbouring houses, sky, camera angle and lighting. Do NOT generate a new or different house, building or scene; preserve every other pixel exactly. Photorealistic, sharp, natural realistic roof colour."
    );
  }
  return (
    "Edit THIS exact photo. Change ONLY the roof covering of the main house in the centre to " +
    material +
    ", covering the whole roof." +
    geom +
    " Keep the IDENTICAL same house from the input photo — same walls, siding, windows, doors, chimney, gutters, lawn, driveway, vehicles, trees, neighbouring houses, camera angle and lighting. Do NOT generate a new or different house, building or scene; preserve every other pixel exactly. Photorealistic, sharp, natural realistic roof colour."
  );
}

// ── image-render providers (failover chain). Each returns an <img>-loadable url (http or data:) or throws ──
async function renderOpenAI(dataUri: string, material: string, pkg: string, view: BaseView = "oblique"): Promise<string> {
  // GPT-4o image model (gpt-image-1) via the edits endpoint — the model ChatGPT uses; crispest + best house preservation.
  const OPENAI = openaiKey();
  if (!OPENAI) throw new Error("no_openai_key");
  const buf = Buffer.from(dataUri.split(",")[1], "base64");
  const fd = new FormData();
  fd.append("model", "gpt-image-1");
  fd.append("image", new Blob([buf], { type: "image/png" }), "house.png");
  fd.append("prompt", roofPrompt(material, pkg, view));
  fd.append("size", "1536x1024"); // force consistent high-res landscape (auto returns inconsistent square/landscape)
  fd.append("quality", "high");
  fd.append("input_fidelity", "high"); // keep the input house faithful
  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: "Bearer " + OPENAI },
    body: fd,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("openai_" + r.status + ":" + t.slice(0, 140));
  }
  const j = (await r.json()) as { data?: Array<{ b64_json?: string }> };
  const b = j.data && j.data[0] && j.data[0].b64_json;
  if (!b) throw new Error("openai_no_image");
  return "data:image/png;base64," + b;
}

// Deterministic per-house seed: SAME input image (same address) → SAME seed for every material, so Flux Kontext's
// stochastic sampling lands on the SAME house each time and only the roof (driven by the prompt) changes. Without a
// fixed seed, each material is a fresh random draw and the model re-imagines walls/trees/cars per material
// (the "different house per material" bug). Derived from the input image bytes so it's stable across requests + restarts.
function houseSeed(dataUri: string): number {
  const h = createHash("sha1").update(dataUri).digest();
  // 31-bit positive int (Replicate seeds are uint32-ish; keep it well inside range)
  return ((h[0] << 23) | (h[1] << 15) | (h[2] << 7) | (h[3] & 0x7f)) & 0x7fffffff;
}

async function renderReplicate(dataUri: string, material: string, pkg: string, view: BaseView = "oblique"): Promise<string> {
  const REPLICATE = replicateKey();
  if (!REPLICATE) throw new Error("no_replicate_key");
  // Replicate (Flux Kontext) is true img2img → keeps the house identical, only the roof changes, framing matches the
  // capture. Retry transient failures so it stays the CONSISTENT provider rather than intermittently dropping to Gemini.
  const seed = houseSeed(dataUri); // lock the seed per-house so every material renders the SAME house (see houseSeed)
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rr = await fetch(
        "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + REPLICATE,
            "Content-Type": "application/json",
            Prefer: "wait",
          },
          body: JSON.stringify({
            input: {
              prompt: roofPrompt(material, pkg, view),
              input_image: dataUri,
              output_format: "jpg",
              safety_tolerance: 2,
              seed, // fixed per-house → consistent house identity across materials
            },
          }),
        },
      );
      let j = (await rr.json()) as {
        status?: string;
        error?: string;
        detail?: string;
        output?: string | string[];
        urls?: { get: string };
      };
      let tries = 0;
      while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 40) {
        const pollUrl = j.urls?.get;
        if (!pollUrl) break; // error body (billing/rate-limit) or sync response w/o poll url → handled below
        await new Promise((s) => setTimeout(s, 1500));
        const pr = await fetch(pollUrl, { headers: { Authorization: "Bearer " + REPLICATE } });
        j = (await pr.json()) as typeof j;
        tries++;
      }
      if (j.status !== "succeeded") throw new Error("replicate_" + (j.error || j.detail || j.status || "failed"));
      const out = Array.isArray(j.output) ? j.output[0] : j.output;
      if (!out) throw new Error("replicate_no_output");
      return out;
    } catch (e) {
      lastErr = e;
      await new Promise((s) => setTimeout(s, 1800));
    }
  }
  throw lastErr;
}

async function renderGemini(dataUri: string, material: string, pkg: string, view: BaseView = "oblique"): Promise<string> {
  const GEMINI = geminiKey();
  if (!GEMINI) throw new Error("no_gemini_key");
  const b64 = dataUri.split(",")[1];
  const mime = dataUri.slice(5).split(";")[0] || "image/jpeg";
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=" +
      GEMINI,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mime, data: b64 } },
              { text: roofPrompt(material, pkg, view) },
            ],
          },
        ],
      }),
    },
  );
  if (!r.ok) throw new Error("gemini_" + r.status);
  const j = (await r.json()) as {
    candidates?: Array<{ content?: { parts?: Array<Record<string, any>> } }>;
  };
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const img = parts.find((p) => p.inline_data || p.inlineData);
  if (!img) throw new Error("gemini_no_image");
  return "data:image/jpeg;base64," + (img.inline_data || img.inlineData).data;
}

async function renderFal(dataUri: string, material: string, pkg: string, view: BaseView = "oblique"): Promise<string> {
  const FAL = falKey();
  if (!FAL) throw new Error("no_fal_key");
  const fr = await fetch("https://fal.run/fal-ai/flux-pro/kontext", {
    method: "POST",
    headers: { Authorization: "Key " + FAL, "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: dataUri,
      prompt: roofPrompt(material, pkg, view),
      num_images: 1,
      safety_tolerance: "5",
      output_format: "jpeg",
    }),
  });
  if (!fr.ok) throw new Error("fal_" + fr.status);
  const j = (await fr.json()) as { images?: Array<{ url?: string }> };
  const url = j.images && j.images[0] && j.images[0].url;
  if (!url) throw new Error("fal_no_image");
  return url;
}

type RenderFn = (dataUri: string, material: string, pkg: string, view?: BaseView) => Promise<string>;
// Provider order: REPLICATE FIRST. OpenAI is at a hard billing limit and Gemini/fal are
// depleted; Replicate (REPLICATE_API_TOKEN) is the one funded, alive provider, so it leads
// the chain — heading with a guaranteed-failing OpenAI call would just add a wasted request +
// its latency before the real render. The full failover is preserved (openai/gemini/fal remain
// as fallbacks for if/when they are funded again), only reordered. The `aiRender` browse-tier
// filter still drops openai (the pricey gpt-image-1) regardless of position.
const RENDER_CHAIN: Array<[string, RenderFn]> = [
  ["replicate", renderReplicate],
  ["openai", renderOpenAI],
  ["gemini", renderGemini],
  ["fal", renderFal],
];

// ── DURABLE re-host of rendered images (audit-6 P1) ──
// Provider delivery URLs (e.g. replicate.delivery/...) are EPHEMERAL → they expire to HTTP 404.
// The FIRST visitor cached that soon-dead url (aiCache + the on-disk "air" JSON cache), so every
// LATER visitor to the same address got the dead url → the <img> 404s → naturalWidth:0 → solid-black
// "after" panel. Fix: while the provider url is still alive, fetch the bytes server-side, store them in
// the on-disk byte cache ("airimg"), and return a STABLE self-hosted url the route layer serves. data:
// URIs (gemini/openai b64) are already self-contained → returned unchanged. Returns the stable url on
// success, or null on failure so the caller can fall back to the raw url (never fails a render on rehost).
async function rehostRenderedImage(ck: string, providerUrl: string): Promise<string | null> {
  if (!providerUrl || providerUrl.startsWith("data:")) return providerUrl; // data URIs are durable as-is
  try {
    const r = await fetch(providerUrl);
    if (!r.ok) throw new Error("fetch " + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) throw new Error("empty");
    const ct = r.headers.get("content-type") || "image/jpeg";
    diskSetBuf("airimg", ck, buf);
    diskSetJSON("airimgct", ck, { ct }); // remember the content-type for the streaming route
    return "/api/roofquote/airender-image?key=" + encodeURIComponent(ck);
  } catch (e) {
    // Log + graceful fallback (NOT a silent swallow — no-silent-catch guard): the render still
    // succeeds with the raw provider url, just without the durability guarantee.
    log.warn("airender rehost failed (serving raw provider url)", { err: (e as Error).message });
    return null;
  }
}

// Read a re-hosted render's bytes + content-type for the streaming route (server/routes layer).
export function readRehostedImage(ck: string): { buf: Buffer; contentType: string } | null {
  const buf = diskGetBuf("airimg", ck);
  if (!buf) return null;
  const meta = diskGetJSON<{ ct?: string }>("airimgct", ck);
  return { buf, contentType: (meta && meta.ct) || "image/jpeg" };
}

// ── Property Analysis Agent: build a "House Knowledge Package" (Solar facets + Gemini vision) ──
async function geminiVision(buf: Buffer): Promise<{ roof_type?: string; chimneys?: number; vents?: number }> {
  const GEMINI = geminiKey();
  if (!GEMINI) return {};
  try {
    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        GEMINI,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: "image/png", data: buf.toString("base64") } },
                {
                  text: 'This is an aerial view of a house. Identify the MAIN house in the centre. Return ONLY compact JSON, no prose: {"roof_type":"gable|hip|flat|gambrel|complex","chimneys":<int>,"vents":<int>}',
                },
              ],
            },
          ],
        }),
      },
    );
    if (!r.ok) return {};
    const j = (await r.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const txt = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const raw = (txt.find((p) => p.text) || {}).text || "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return {};
    return JSON.parse(m[0]);
  } catch {
    return {};
  }
}

export async function houseKnowledge(address: string): Promise<string> {
  if (knowledgeCache.has(address)) return knowledgeCache.get(address)!;
  const SOLAR = solarKey();
  const parts: string[] = [];
  let x12: number | null = null;
  // Solar API facets (planes + pitch) — same data the widget already uses
  try {
    const g = await fetch(
      "https://maps.googleapis.com/maps/api/geocode/json?address=" +
        encodeURIComponent(address) +
        "&key=" +
        SOLAR,
    );
    const gj = (await g.json()) as any;
    const loc = gj.status === "OK" && gj.results[0] && gj.results[0].geometry.location;
    if (loc) {
      const bi = await fetch(
        "https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=" +
          loc.lat +
          "&location.longitude=" +
          loc.lng +
          "&requiredQuality=LOW&key=" +
          SOLAR,
      );
      if (bi.ok) {
        const b = (await bi.json()) as any;
        const segs = (b.solarPotential && b.solarPotential.roofSegmentStats) || [];
        if (segs.length) parts.push(segs.length + " roof plane" + (segs.length > 1 ? "s" : ""));
        const pitches = segs
          .map((s: any) => s.pitchDegrees)
          .filter((x: any) => typeof x === "number");
        if (pitches.length) {
          const avg = pitches.reduce((a: number, b: number) => a + b, 0) / pitches.length;
          x12 = Math.round(Math.tan((avg * Math.PI) / 180) * 12);
          if (x12 > 0) parts.push("~" + x12 + "/12 pitch");
        }
      }
    }
  } catch {
    /* solar facets are best-effort */
  }
  // Gemini vision on the oblique aerial (roof type, chimneys, vents)
  try {
    const buf = await captureOblique(address);
    const v = await geminiVision(buf);
    // trust Solar's pitch over vision's type: drop a "flat" label that contradicts a steep measured pitch
    const rt = v.roof_type && String(v.roof_type).toLowerCase();
    if (rt && !(rt === "flat" && x12 != null && x12 >= 3)) parts.unshift(rt + " roof");
    if (typeof v.chimneys === "number") parts.push(v.chimneys + " chimney" + (v.chimneys === 1 ? "" : "s"));
    if (typeof v.vents === "number" && v.vents > 0)
      parts.push(v.vents + " roof vent" + (v.vents === 1 ? "" : "s"));
  } catch {
    /* vision is best-effort */
  }
  const pkg = parts.join(", ");
  knowledgeCache.set(address, pkg);
  return pkg;
}

// ── Image Collector: headless capture of the Google 3D oblique aerial ──────────
// Marker error the route layer recognises to degrade gracefully (204, not 502)
// when the runtime simply cannot launch a headless browser. Server-side capture
// is a pre-warm OPTIMISATION (the before/after slider), never required — the
// widget already hides the slider on a failed image. The prod (Replit publish)
// runtime ships without the Playwright Chromium binary, so chromium.launch()
// throws instantly; we must NOT log a 502 on every widget load for that.
export class CaptureUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureUnavailableError";
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── capture reliability state (ported from spikes/roof-quote/serve.mjs, commit 2dd7e876) ──
// De-dupe concurrent headless renders: two callers for the SAME address share ONE browser run
// (never launch two browsers for one house). Cleared when the render settles.
const captureInflight = new Map<string, Promise<Buffer>>();
// Recently-down memory: an address whose oblique render just failed (no GPU / no 3D tiles in this
// runtime) maps to an expiry ms. While it's in the future the route SKIPS the slow ~20s headless
// attempt and serves the fast Street-View fallback directly — instead of retrying the slow path on
// every request. Retried again automatically once the TTL lapses.
const captureObliqueDown = new Map<string, number>();
const OBLIQUE_DOWN_TTL = 10 * 60 * 1000; // 10 min — keeps /capture snappy, but retries oblique later
// ~14s ceiling on the roof-ready poll. A GPU runtime reaches __roofReady well under this; a no-GPU
// runtime never will → we bail fast to the Street-View fallback instead of spending ~70s on a render
// that produces a blank/partial frame anyway. Env-configurable to match the spike (RQ_CAPTURE_READY_MS).
const CAPTURE_READY_MAX_MS = Number(process.env.RQ_CAPTURE_READY_MS || 14000);

/** True while `address` is inside its recently-failed cooldown window — the route uses this to skip the
 *  slow headless attempt and serve the fast Street-View fallback directly. Exported for the route layer. */
export function isObliqueRecentlyDown(address: string): boolean {
  return (captureObliqueDown.get(address) || 0) > Date.now();
}
/** Mark `address` as recently-failed for OBLIQUE_DOWN_TTL so subsequent calls skip the slow path.
 *  Called by the route layer when a capture attempt fails (or its deadline is exceeded). */
export function markObliqueDown(address: string): void {
  captureObliqueDown.set(address, Date.now() + OBLIQUE_DOWN_TTL);
}

let _browser: Browser | null = null;
// Once a launch fails (no Chromium binary / missing system lib in this runtime),
// every subsequent launch in the same process fails the same way. Latch it so we
// fast-fail without re-attempting (and re-logging) a multi-second launch per request.
let _browserUnavailable = false;
async function getBrowser(): Promise<Browser> {
  if (_browser) {
    try {
      if (_browser.isConnected()) return _browser;
    } catch {
      /* relaunch below */
    }
  }
  if (_browserUnavailable) {
    throw new CaptureUnavailableError("headless browser unavailable in this runtime");
  }
  // TRUE headless + software WebGL (SwiftShader): renders Google 3D tiles with no GPU/display → deployable on standard server containers
  try {
    _browser = await chromium.launch({
      headless: true,
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--no-sandbox",
        "--ignore-gpu-blocklist",
      ],
    });
  } catch (err) {
    _browserUnavailable = true;
    log.warn("roofquote capture disabled — headless Chromium failed to launch (pre-warm optimisation skipped)", {
      err: (err as Error).message,
    });
    throw new CaptureUnavailableError((err as Error).message || "chromium launch failed");
  }
  return _browser;
}

// compass bearing from point A → point B (degrees, 0=N) — used to face the house FROM the street
function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180,
    y = Math.sin((lng2 - lng1) * r) * Math.cos(lat2 * r);
  const x =
    Math.cos(lat1 * r) * Math.sin(lat2 * r) -
    Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lng2 - lng1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

// Public entry: cached + disk-backed + IN-FLIGHT DE-DUPED. Two concurrent callers for the same
// address share ONE headless render (never launch two browsers for one house). The slow render is
// delegated to `_captureObliqueRender`; the deadline/Street-View-fallback race lives at the route
// layer (server/routes/roofQuoteRoutes.ts) so a slow render never hangs the HTTP response.
export async function captureOblique(address: string): Promise<Buffer> {
  // VERIFY HOOK: simulate the prod (Replit publish) runtime that ships no headless Chromium, so the
  // oblique→Street-View fallback + recently-down cooldown can be exercised locally. Off by default.
  if (process.env.RQ_FORCE_NO_CHROMIUM === "1") {
    throw new CaptureUnavailableError("headless browser unavailable in this runtime");
  }
  if (captureCache.has(address)) return captureCache.get(address)!;
  {
    const d = diskGetBuf("cap", address);
    if (d) {
      captureCache.set(address, d);
      return d;
    }
  }
  // A render is already running for this house → await it instead of launching a second browser.
  const existing = captureInflight.get(address);
  if (existing) return existing;
  const p = (async (): Promise<Buffer> => {
    const buf = await _captureObliqueRender(address);
    captureCache.set(address, buf);
    diskSetBuf("cap", address, buf);
    return buf;
  })().finally(() => {
    captureInflight.delete(address);
  });
  captureInflight.set(address, p);
  return p;
}

// The actual headless render. BOUNDED so it can never hang the request ~70s: poll __roofReady up to
// CAPTURE_READY_MAX_MS (~14s), then give the 3D tiles a short settle, then screenshot. If readiness
// never arrives (e.g. no GPU → SwiftShader can't stream Google 3D tiles), bail NOW so the route falls
// back to Street View FAST instead of spending another ~15s on camera/screenshot work that produces a
// blank/partial frame anyway.
async function _captureObliqueRender(address: string): Promise<Buffer> {
  const SOLAR = solarKey();
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 840 } });
  const page = await ctx.newPage();
  try {
    const port = process.env.PORT || "5000";
    // The ported widget is served by THIS Express app under the prefixed path.
    await page.goto("http://127.0.0.1:" + port + "/api/roofquote/widget?noauto=1", {
      waitUntil: "domcontentloaded",
    }); // noauto → no default-address race
    await page.fill("#addr", address);
    await page.click("#go");
    // Bounded readiness wait. Old code polled 60×1000ms (+9s tiles ≈ 70s worst case) which timed out
    // the client with no fallback. Cap the poll so the route can fall back fast instead of hanging.
    const readyDeadline = Date.now() + CAPTURE_READY_MAX_MS;
    let ready = false;
    while (Date.now() < readyDeadline) {
      if (await page.evaluate(() => (window as any).__roofReady === true)) {
        ready = true;
        break;
      }
      await sleep(1000);
    }
    if (!ready) {
      throw new Error("__roofReady not set within " + CAPTURE_READY_MAX_MS + "ms — bailing to fallback");
    }
    await sleep(3500);
    // solar panels OFF → clean roof. Best-effort: if the toggle isn't present the
    // capture still works, but log (don't swallow) so a persistent failure is visible.
    await noisyCatch(page.click("#bPanels"), { op: "roofquote.captureOblique.panelsOff" });
    await sleep(700);
    // face the house FROM the street (curb-appeal angle): bearing street-pano → house. Falls back to 180.
    const site = (await page.evaluate(() => (window as any).__site())) as {
      lat: number;
      lng: number;
      alt: number;
    } | null;
    let heading = 180;
    try {
      const m = await fetch(
        "https://maps.googleapis.com/maps/api/streetview/metadata?location=" +
          encodeURIComponent(address) +
          "&key=" +
          SOLAR,
      );
      const mj = (await m.json()) as any;
      if (mj.status === "OK" && mj.location && site)
        heading = bearing(mj.location.lat, mj.location.lng, site.lat, site.lng);
    } catch {
      /* fall back to heading 180 */
    }
    // set the camera DIRECTLY (animated flyCameraTo doesn't reliably apply under headless SwiftShader) + fly as backup
    await page.evaluate((h: number) => {
      try {
        const s = (window as any).__site();
        const g = (window as any).gmap;
        g.center = { lat: s.lat, lng: s.lng, altitude: s.alt };
        g.range = 44;
        g.tilt = 52;
        g.heading = h;
        if (g.flyCameraTo)
          g.flyCameraTo({
            endCamera: {
              center: { lat: s.lat, lng: s.lng, altitude: s.alt },
              range: 44,
              tilt: 52,
              heading: h,
            },
            durationMillis: 300,
          });
      } catch {
        /* camera set best-effort */
      }
    }, heading);
    await sleep(9000); // SwiftShader streams the closer tiles slowly — give it time
    await page.addStyleTag({
      content:
        "#card,#ctrls,#bar,#status,#matbar,#sunbar,#matHint,#load,#aiBtn,#aiBar,#report{display:none!important}",
    });
    await sleep(700);
    const buf = await page.screenshot({ type: "png" });
    return buf; // caching (memory + disk) is done by the public captureOblique() wrapper
  } finally {
    await ctx.close();
  }
}

// ── Roof feature detection (Gemini vision): chimneys/vents/skylights/dormers, cached ──
export async function roofFeatures(address: string): Promise<unknown> {
  if (featuresCache.has(address)) {
    return { cached: true, ...(featuresCache.get(address) as object) };
  }
  const buf = await captureOblique(address);
  const f = await detectRoofFeatures(buf, geminiKey());
  featuresCache.set(address, f);
  return f;
}

// ── simple upstream proxies (key hidden server-side) ──────────────────────────
export type GeocodeResult =
  | { lat: number; lng: number; formatted: string; precise: boolean; locationType: string }
  | { error: string; message: string };

export async function geocode(address: string): Promise<GeocodeResult> {
  const SOLAR = solarKey();
  const r = await fetch(
    "https://maps.googleapis.com/maps/api/geocode/json?address=" +
      encodeURIComponent(address) +
      "&key=" +
      SOLAR,
  );
  const j = (await r.json()) as any;
  if (j.status === "OK" && j.results[0]) {
    const res0 = j.results[0];
    const l = res0.geometry.location;
    // location_type tells us how precise the point is: ROOFTOP = exact building,
    // RANGE_INTERPOLATED ≈ interpolated along the street, GEOMETRIC_CENTER /
    // APPROXIMATE = a centroid (city / parking lot / region) that can sit dozens of
    // metres off the actual roof. The widget re-anchors imprecise points to Solar's
    // building centroid; `precise` lets it know when that re-anchor matters most.
    const locationType = String(res0.geometry.location_type || "");
    return {
      lat: l.lat,
      lng: l.lng,
      formatted: res0.formatted_address,
      locationType,
      precise: locationType === "ROOFTOP",
    };
  }
  return { error: j.status, message: j.error_message || "" };
}

/* ─── Local residential electricity rate ($/kWh): US via live EIA (public-domain,
   free commercial use; cached ~14d); Canada via researched provincial table (no
   aggregated CA rate API exists). Powers the widget's real local savings math. ─── */
const eiaKey = (): string => process.env.EIA_API_KEY || process.env.EIA_KEY || "";
const CA_RATES: Record<string, number> = {
  ON: 0.13, BC: 0.115, AB: 0.17, QC: 0.078, MB: 0.097, SK: 0.18,
  NS: 0.183, NB: 0.137, NL: 0.139, PE: 0.166, NT: 0.38, YT: 0.19, NU: 0.375,
};
export interface RateResult {
  rate?: number; region?: string; period?: string; source?: string; error?: string; _t?: number;
}
export async function localRate(country: string, region: string): Promise<RateResult> {
  country = (country || "US").toUpperCase();
  region = (region || "").toUpperCase();
  if (country === "CA") {
    const rate = CA_RATES[region];
    return rate ? { rate, region, source: "provincial tariff (approx)" } : { error: "no_rate", region };
  }
  if (!region || region.length !== 2) return { error: "bad_region" };
  const cached = diskGetJSON<RateResult>("rate", country + region);
  if (cached && cached._t && Date.now() - cached._t < 14 * 864e5) return cached;
  const EIA = eiaKey();
  if (!EIA) return { error: "no_eia_key" };
  const url =
    "https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=" + EIA +
    "&frequency=monthly&data%5B0%5D=price&facets%5Bstateid%5D%5B0%5D=" + region +
    "&facets%5Bsectorid%5D%5B0%5D=RES&sort%5B0%5D%5Bcolumn%5D=period&sort%5B0%5D%5Bdirection%5D=desc&length=1";
  const r = await fetch(url);
  const j = (await r.json()) as any;
  const row = j?.response?.data?.[0];
  if (row?.price) {
    const out: RateResult = {
      rate: +(row.price / 100).toFixed(4), region, period: row.period, source: "EIA " + row.period, _t: Date.now(),
    };
    diskSetJSON("rate", country + region, out);
    return out;
  }
  return { error: "no_rate", region };
}

/* ─── Peak sun-hours (annual avg daily irradiance, kWh/m²/day) from NASA POWER —
   no key, public-domain, global incl. Canada north. Climatology → cache long. ─── */
export interface SunResult { sunHours?: number; source?: string; error?: string; }
export async function sunHours(lat: string, lng: string): Promise<SunResult> {
  if (!lat || !lng) return { error: "bad_coords" };
  const key = (+lat).toFixed(2) + "," + (+lng).toFixed(2);
  const cached = diskGetJSON<SunResult>("sun", key);
  if (cached) return cached;
  const r = await fetch(
    "https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN&community=RE&longitude=" +
      lng + "&latitude=" + lat + "&format=JSON",
  );
  const j = (await r.json()) as any;
  const ann = j?.properties?.parameter?.ALLSKY_SFC_SW_DWN?.ANN;
  if (typeof ann === "number") {
    const out: SunResult = { sunHours: +ann.toFixed(1), source: "NASA POWER" };
    diskSetJSON("sun", key, out);
    return out;
  }
  return { error: "no_sun" };
}

/* ─── Clean VECTOR building footprint (the EVEN/straight outer-roofline source) ───
   Replaces the fuzzy Solar-mask Moore-trace as the primary outer-outline source.
   Coverage cascade: OpenStreetMap via Overpass (free, hosted, no dep) → on-disk
   pre-cached footprints (assets/footprints.geojson) for addresses OSM misses →
   {source:"none"} so the widget keeps its mask-trace fallback (low-confidence).
   Returns a clean building-footprint ring as GeoJSON [lng,lat][] (open). ─── */
type LngLat = [number, number];
const fpMetres = (lat: number) => ({ mLat: 111320, mLng: 111320 * Math.cos((lat * Math.PI) / 180) });
function fpOpenRing(ring: LngLat[]): LngLat[] {
  const r = ring.slice();
  if (r.length > 1) { const f = r[0], l = r[r.length - 1];
    if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) r.pop(); }
  return r;
}
function fpRingArea(ring: LngLat[], lat0: number): number {
  const { mLat, mLng } = fpMetres(lat0); let s = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length];
    s += (a[0] * mLng) * (b[1] * mLat) - (b[0] * mLng) * (a[1] * mLat); }
  return Math.abs(s) / 2;
}
function fpCentroid(ring: LngLat[]): LngLat {
  let x = 0, y = 0; for (const [lng, lat] of ring) { x += lng; y += lat; }
  return [x / ring.length, y / ring.length];
}
function fpPointInRing(pt: LngLat, ring: LngLat[]): boolean {
  let inside = false; const x = pt[0], y = pt[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi) inside = !inside;
  }
  return inside;
}
function fpPickBuilding(elements: any[], lat: number, lng: number): LngLat[] | null {
  const cands: LngLat[][] = [];
  for (const el of elements || []) {
    const geom = el.geometry; if (!Array.isArray(geom) || geom.length < 4) continue;
    const ring = fpOpenRing(geom.map((g: any) => [g.lon, g.lat] as LngLat));
    if (ring.length < 3) continue;
    if (fpRingArea(ring, lat) < 8) continue;
    cands.push(ring);
  }
  if (!cands.length) return null;
  for (const ring of cands) if (fpPointInRing([lng, lat], ring)) return ring;
  let best: LngLat[] | null = null, bestD = Infinity; const { mLat, mLng } = fpMetres(lat);
  for (const ring of cands) { const c = fpCentroid(ring);
    const d = Math.hypot((c[0] - lng) * mLng, (c[1] - lat) * mLat); if (d < bestD) { bestD = d; best = ring; } }
  return best && bestD <= 40 ? best : null;
}
async function overpassFootprint(lat: number, lng: number): Promise<LngLat[] | null> {
  const body = "data=" + encodeURIComponent('[out:json][timeout:25];way["building"](around:30,' + lat + "," + lng + ");out geom;");
  const headers = { "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "WeFixTrades-RoofQuote/1.0 (roof footprint lookup; contact support@wefixtrades.com)" };
  const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, { method: "POST", headers, body });
      if (!r.ok) continue;
      const j = (await r.json()) as any;
      const ring = fpPickBuilding(j.elements, lat, lng);
      if (ring) return ring;
      return null;
    } catch { /* try next endpoint */ }
  }
  return null;
}
let _fpCache: LngLat[][] | null = null, _fpCacheLoaded = false;
function loadFpCache(): LngLat[][] | null {
  if (_fpCacheLoaded) return _fpCache;
  _fpCacheLoaded = true;
  try {
    const f = path.join(__dirname, "..", "..", "roofQuote", "assets", "footprints.geojson");
    if (existsSync(f)) {
      const j = JSON.parse(readFileSync(f, "utf8"));
      _fpCache = ((j.features || []) as any[]).map((ft) => {
        const g = ft.geometry; if (!g) return null;
        const coords = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null;
        if (!coords) return null;
        return fpOpenRing(coords.map((c: number[]) => [c[0], c[1]] as LngLat));
      }).filter((r): r is LngLat[] => !!r && r.length >= 3);
    }
  } catch { _fpCache = null; }
  return _fpCache;
}
function cacheFootprint(lat: number, lng: number): LngLat[] | null {
  const rings = loadFpCache(); if (!rings || !rings.length) return null;
  for (const ring of rings) if (fpPointInRing([lng, lat], ring)) return ring;
  let best: LngLat[] | null = null, bestD = Infinity; const { mLat, mLng } = fpMetres(lat);
  for (const ring of rings) { const c = fpCentroid(ring);
    const d = Math.hypot((c[0] - lng) * mLng, (c[1] - lat) * mLat); if (d < bestD) { bestD = d; best = ring; } }
  return best && bestD <= 40 ? best : null;
}
/* ─── Microsoft GlobalML Building Footprints — ON-DEMAND universal backstop (US + Canada) ───
   Microsoft's open Building Footprints set covers essentially every building on Earth, distributed
   by Bing-zoom-9 map tile (9-digit quadkey). A ~7 MB index CSV maps QuadKey → per-tile gzipped
   GeoJSONL URL. For any lat/lng we compute the z9 quadkey, look up its tile URL (index disk-cached,
   filtered to US+Canada), download the tile once to disk (streamed → low memory), then scan it for
   the building containing the point (else nearest within ~60 m). First address per tile costs a few
   seconds (a dense metro tile can be 30–130 MB); later addresses in that tile re-scan locally fast.
   Node stdlib only (https + zlib + readline). Mirrors spikes/roof-quote/serve.mjs. ─── */
const MSFT_LINKS_URL = "https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv";
const MSFT_UA = "WeFixTrades-RoofQuote/1.0 (building footprint lookup; contact support@wefixtrades.com)";
const MSFT_TILE_MAX_BYTES = 220 * 1024 * 1024;   // refuse pathologically huge tiles rather than OOM
let _msftIndex: Record<string, string> | null = null;
let _msftIndexLoaded = false;
let _msftIndexInflight: Promise<Record<string, string>> | null = null;

function lngLatToQuadkey(lat: number, lng: number, z: number): string {
  const sinLat = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180);
  const x = (lng + 180) / 360;
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  const n = Math.pow(2, z);
  let tx = Math.max(0, Math.min(n - 1, Math.floor(x * n)));
  let ty = Math.max(0, Math.min(n - 1, Math.floor(y * n)));
  let qk = "";
  for (let i = z; i > 0; i--) { let d = 0; const m = 1 << (i - 1); if ((tx & m) !== 0) d += 1; if ((ty & m) !== 0) d += 2; qk += d; }
  return qk;
}
function httpsGetBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": MSFT_UA } }, (r) => {
      if (r.statusCode && r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); httpsGetBuffer(r.headers.location).then(resolve, reject); return; }
      if (r.statusCode !== 200) { r.resume(); reject(new Error("http_" + r.statusCode)); return; }
      const chunks: Buffer[] = []; r.on("data", (c) => chunks.push(c as Buffer)); r.on("end", () => resolve(Buffer.concat(chunks))); r.on("error", reject);
    }).on("error", reject);
  });
}
async function loadMsftIndex(): Promise<Record<string, string>> {
  if (_msftIndexLoaded) return _msftIndex || {};
  if (_msftIndexInflight) return _msftIndexInflight;
  _msftIndexInflight = (async () => {
    const disk = diskGetJSON<{ map: Record<string, string>; _t: number }>("msftidx", "us-ca-v1");
    if (disk && disk._t && Date.now() - disk._t < 30 * 864e5 && disk.map) { _msftIndex = disk.map; _msftIndexLoaded = true; return _msftIndex; }
    try {
      const txt = (await httpsGetBuffer(MSFT_LINKS_URL)).toString("utf8");
      const map: Record<string, string> = {};
      for (let i = txt.indexOf("\n") + 1; i > 0 && i < txt.length;) {
        let j = txt.indexOf("\n", i); if (j < 0) j = txt.length;
        const line = txt.slice(i, j); i = j + 1;
        const a = line.indexOf(","); if (a < 0) continue;
        const region = line.slice(0, a);
        if (region !== "UnitedStates" && region !== "Canada") continue;
        const b = line.indexOf(",", a + 1); if (b < 0) continue;
        const qk = line.slice(a + 1, b);
        const d = line.indexOf(",", b + 1);
        const url = (d < 0 ? line.slice(b + 1) : line.slice(b + 1, d)).trim();
        if (qk && url) map[qk] = url;
      }
      _msftIndex = map; _msftIndexLoaded = true;
      diskSetJSON("msftidx", "us-ca-v1", { map, _t: Date.now() });
      return map;
    } catch (err) {
      log.warn("msft index load failed", { err: (err as Error).message });
      _msftIndex = {}; _msftIndexLoaded = true; return _msftIndex;
    }
  })();
  try { return await _msftIndexInflight; } finally { _msftIndexInflight = null; }
}
/* ─── PARSED per-cell spatial index (perf lever; mirrors spikes/roof-quote/serve.mjs) ───
   The z9 tile has ~400k buildings; re-parsing the whole 30-45 MB .gz on EVERY lookup (the old scanMsftTile /
   scanMsftTileBbox) cost ~1.5-5 s each and up to ~40 s for dense metros. A roof quote only needs the buildings
   in the ADDRESS NEIGHBOURHOOD, so we stream the .gz ONCE, keep only buildings whose centroid lands in a CELL
   (z13 quadkey ≈ ~3 km, padded) around the query, and cache that SMALL per-cell set (a few hundred buildings) to
   disk + memory. Both the point lookup (msftFootprint) and the bbox lookup (msftBuildingsBbox) read the cell, so
   the second lookup for an address is INSTANT. A cheap STRING pre-filter (coordinate 2-decimal prefixes) skips
   JSON.parse on the ~99% of lines nowhere near the cell — turning the one-time full-tile parse from ~40 s into a
   fast substring scan that only parses the few hundred candidate lines. Correctness is identical: the post-parse
   centroid-in-cell test still gates every kept building; the pre-filter only drops PROVABLY-out-of-cell lines. */
interface MsftCellBuilding { ring: LngLat[]; c: LngLat; a: number; bb: [number, number, number, number]; }
const MSFT_CELL_Z = 13;                          // ~3 km cell — comfortably covers the Select-Your-Roof map view
const _msftCellMem = new Map<string, { buildings: MsftCellBuilding[]; t: number }>();
const MSFT_CELL_MEM_MAX = 24;
const _msftCellInflight = new Map<string, Promise<MsftCellBuilding[] | null>>();
function _msftCellMemGet(k: string): MsftCellBuilding[] | null {
  const e = _msftCellMem.get(k); if (e) { _msftCellMem.delete(k); _msftCellMem.set(k, e); return e.buildings; } return null;
}
function _msftCellMemSet(k: string, buildings: MsftCellBuilding[]): void {
  _msftCellMem.set(k, { buildings, t: Date.now() });
  while (_msftCellMem.size > MSFT_CELL_MEM_MAX) { const kk = _msftCellMem.keys().next().value as string; _msftCellMem.delete(kk); }
}
// Padded lat/lng bounds of the z13 cell containing (lat,lng), with ~600 m pad so an edge query still captures
// neighbour buildings just across the cell boundary.
function _msftCellBounds(lat: number, lng: number): { s: number; w: number; n: number; e: number } {
  const n = Math.pow(2, MSFT_CELL_Z);
  const sinLat = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180);
  const tx = Math.floor((lng + 180) / 360 * n), ty = Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n);
  const lngW = tx / n * 360 - 180, lngE = (tx + 1) / n * 360 - 180;
  const yN = ty / n, yS = (ty + 1) / n;
  const latN = Math.atan(Math.sinh(Math.PI * (1 - 2 * yN))) * 180 / Math.PI, latS = Math.atan(Math.sinh(Math.PI * (1 - 2 * yS))) * 180 / Math.PI;
  const pad = 0.006;
  return { s: Math.min(latN, latS) - pad, w: lngW - pad, n: Math.max(latN, latS) + pad, e: lngE + pad };
}
// 2-decimal coordinate prefixes ("-96.60", "33.24", …) that any coordinate inside [lo,hi] must contain as a
// substring in the GeoJSON line — the cheap pre-filter that lets us skip JSON.parse on far-away lines.
function _coordPrefixes(lo: number, hi: number): string[] {
  const out: string[] = []; const a = Math.floor((lo - 0.01) * 100), b = Math.floor((hi + 0.01) * 100);
  for (let k = a; k <= b; k++) out.push((k / 100).toFixed(2));
  return out;
}
// Stream the .gz ONCE, keep only buildings whose centroid lands in [s,w,n,e]. Compact {ring,c,a,bb}.
function _scanMsftCell(srcStream: NodeJS.ReadableStream, s: number, w: number, n: number, e: number): Promise<MsftCellBuilding[]> {
  return new Promise((resolve) => {
    const out: MsftCellBuilding[] = []; let done = false;
    const lngPfx = _coordPrefixes(w, e), latPfx = _coordPrefixes(s, n);
    const gun = zlib.createGunzip();
    const rl = readline.createInterface({ input: srcStream.pipe(gun), crlfDelay: Infinity });
    const finish = () => { if (done) return; done = true; try { rl.close(); } catch { /* closed */ } try { (srcStream as any).destroy?.(); } catch { /* noop */ } resolve(out); };
    srcStream.on("error", finish); gun.on("error", finish);
    rl.on("line", (line) => {
      if (done || !line) return;
      // CHEAP string pre-filter: require BOTH an in-range lng prefix AND lat prefix before paying for JSON.parse.
      let hasLng = false; for (const p of lngPfx) { if (line.indexOf(p) >= 0) { hasLng = true; break; } }
      if (!hasLng) return;
      let hasLat = false; for (const p of latPfx) { if (line.indexOf(p) >= 0) { hasLat = true; break; } }
      if (!hasLat) return;
      let f: any; try { f = JSON.parse(line); } catch { return; }
      const g = f && f.geometry; if (!g) return;
      const raw = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null;
      if (!raw || raw.length < 4) return;
      const p0 = raw[0]; if (p0[0] < w - 0.002 || p0[0] > e + 0.002 || p0[1] < s - 0.002 || p0[1] > n + 0.002) return;
      const open = fpOpenRing((raw as number[][]).map((c) => [c[0], c[1]] as LngLat));
      if (open.length < 3) return;
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      for (const q of open) { if (q[0] < minx) minx = q[0]; if (q[0] > maxx) maxx = q[0]; if (q[1] < miny) miny = q[1]; if (q[1] > maxy) maxy = q[1]; }
      const lat0 = (miny + maxy) / 2;
      const area = fpRingArea(open, lat0);
      if (area < 8) return;
      const c = fpCentroid(open);
      if (c[1] < s || c[1] > n || c[0] < w || c[0] > e) return;
      out.push({ ring: open, c, a: area, bb: [minx, miny, maxx, maxy] });
    });
    rl.on("close", finish);
  });
}
// mem → disk → (download tile once + scan the cell once). [] for a genuinely empty cell, null if the tile
// couldn't be obtained. Keeps the raw .gz on disk so OTHER cells in the same z9 tile reuse it.
async function msftCellBuildings(lat: number, lng: number): Promise<MsftCellBuilding[] | null> {
  const idx = await loadMsftIndex();
  const qk = lngLatToQuadkey(lat, lng, 9);
  const url = idx[qk];
  if (!url) return null;
  const cellKey = lngLatToQuadkey(lat, lng, MSFT_CELL_Z);
  const mem = _msftCellMemGet(cellKey); if (mem) return mem;
  const inflight = _msftCellInflight.get(cellKey); if (inflight) return inflight;
  const p = (async (): Promise<MsftCellBuilding[] | null> => {
    const disk = diskGetJSON<{ b: MsftCellBuilding[]; _t: number }>("msftcell", cellKey);
    if (disk && Array.isArray(disk.b)) { _msftCellMemSet(cellKey, disk.b); return disk.b; }
    const tileFile = path.join(cacheDir(), "msfttile-" + qk + ".gz");
    if (!existsSync(tileFile)) { const ok = await downloadMsftTile(url, tileFile); if (!ok) return null; }
    const b = _msftCellBounds(lat, lng);
    let buildings: MsftCellBuilding[];
    try { buildings = await _scanMsftCell(createReadStream(tileFile), b.s, b.w, b.n, b.e); }
    catch { try { unlinkSync(tileFile); } catch { /* noop */ } return null; }
    diskSetJSON("msftcell", cellKey, { b: buildings, _t: Date.now() });
    _msftCellMemSet(cellKey, buildings);
    return buildings;
  })().finally(() => { _msftCellInflight.delete(cellKey); });
  _msftCellInflight.set(cellKey, p);
  return p;
}
function downloadMsftTile(url: string, tileFile: string): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false; const settle = (v: string | null) => { if (!settled) { settled = true; resolve(v); } };
    const part = tileFile + ".part";
    let ws: ReturnType<typeof createWriteStream>;
    try { ws = createWriteStream(part); } catch { settle(null); return; }
    const fail = () => { try { ws.destroy(); } catch { /* noop */ } try { if (existsSync(part)) unlinkSync(part); } catch { /* noop */ } settle(null); };
    const req = https.get(url, { headers: { "User-Agent": MSFT_UA } }, (r) => {
      if (r.statusCode !== 200) { r.resume(); fail(); return; }
      const len = +(r.headers["content-length"] || 0);
      if (len && len > MSFT_TILE_MAX_BYTES) { r.resume(); try { req.destroy(); } catch { /* noop */ } fail(); return; }
      r.pipe(ws);
      r.on("error", fail);
      ws.on("error", fail);
      ws.on("finish", () => { try { renameSync(part, tileFile); resolve(tileFile); } catch { fail(); } });
    });
    req.on("error", fail);
    req.setTimeout(45000, () => { try { req.destroy(); } catch { /* noop */ } fail(); });
  });
}
async function msftFootprint(lat: number, lng: number): Promise<LngLat[] | null> {
  const buildings = await msftCellBuildings(lat, lng);
  if (!buildings) return null;   // no tile / download-parse failed → cascade falls through
  // Point lookup over the small cell set: containing building wins; else nearest centroid/edge within ~60 m.
  const { mLat, mLng } = fpMetres(lat);
  let best: LngLat[] | null = null, bestD = Infinity;
  for (const b of buildings) {
    const bb = b.bb;
    if (lng >= bb[0] && lng <= bb[2] && lat >= bb[1] && lat <= bb[3] && fpPointInRing([lng, lat], b.ring)) return b.ring;
    let dEdge = Infinity; for (const p of b.ring) { const dv = Math.hypot((p[0] - lng) * mLng, (p[1] - lat) * mLat); if (dv < dEdge) dEdge = dv; }
    const d = Math.min(Math.hypot((b.c[0] - lng) * mLng, (b.c[1] - lat) * mLat), dEdge);
    if (d < bestD) { bestD = d; best = b.ring; }
  }
  return best && bestD <= 60 ? best : null;
}

export interface FootprintCandidate { ring: LngLat[]; source: "osm" | "msft" | "cache"; attribution: string; }
export interface FootprintResult { ring?: LngLat[]; source: "osm" | "msft" | "cache" | "none"; attribution?: string; error?: string; candidates?: FootprintCandidate[]; incomplete?: boolean; }

// (fix6 latency) How long the route will WAIT for the Microsoft tile before responding with whatever
// it has (OSM). The msftFootprint promise is NOT aborted past this budget — Node keeps it running so
// its downloadMsftTile() finishes and writes the .gz to the disk tile cache in the BACKGROUND, making
// the NEXT request for that dense-metro tile instant. Dense z9 tiles (Phoenix/Denver ~100-130 MB)
// cost 15-25 s cold; that no longer stalls the caller.
const MS_FOOTPRINT_BUDGET_MS = 6500;
const OSM_FOOTPRINT_BUDGET_MS = 8000;   // overall route ceiling: even if Overpass stalls (its [timeout:25] is too long), bail at 8s → route ≤~8s
// Fast-first-paint budget: if OSM returns a usable ring within this window, respond immediately (OSM-only, MS
// backgrounded) rather than blocking on the full MS budget. Delivers the <~2s main-outline target where OSM has
// coverage; MS still finishes + caches for the instant refetch/next load.
const FOOTPRINT_FAST_PAINT_MS = 2200;
// After the fast-paint window, if MS already has a ring, wait at most this long for OSM (cleaner rings) before
// responding — so a hung Overpass can't block a response we could already give from the warm MS cell.
const FOOTPRINT_OSM_GRACE_MS = 1500;
// How long an INCOMPLETE footprint (OSM-only, MS still warming) is served from cache before we re-run to upgrade
// to the complete OSM+MS set. Short so it never shadows the complete set for long; makes rapid warm reloads instant.
const FOOTPRINT_INCOMPLETE_TTL_MS = 90 * 1000;
// Same idea for the neighbour layer: an incomplete-but-non-empty union (OSM/MS in hand, VIDA/MS still filling) is
// served instantly for a short window, then re-runs to upgrade to the complete (VIDA/MS-filled) set.
const BUILDINGS_INCOMPLETE_TTL_MS = 90 * 1000;
// Tighter OSM ceiling for the NEIGHBOUR layer: with the MS cell instant once warm, a flaky Overpass should not
// hold the whole /buildings response for the full two-mirror timeout. MS+VIDA background-complete + cache, so a
// short inline OSM wait never drops data. Set just above one mirror try (OVERPASS_PER_TRY_MS=3.5s) plus slack.
const BUILDINGS_OSM_BUDGET_MS = 4200;
// Resolve `live` to its value if it settles within `ms`, else `fallback`. Does NOT abort `live` — it
// keeps running so any in-flight download finishes + caches in the background; we just stop waiting.
function timeboxResolve<T>(live: Promise<T>, ms: number, fallback: T): Promise<T> {
  // `live` keeps running past `ms` (we attach handlers but never abort it), so an in-flight tile
  // download finishes + caches in the background. A late rejection lands in the `.then` reject arm
  // below, which is a real handler — so it can never become an unhandled rejection.
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => { if (!settled) { settled = true; resolve(fallback); } }, ms);
    live.then(
      (v) => { if (!settled) { settled = true; clearTimeout(t); resolve(v); } },
      () => { if (!settled) { settled = true; clearTimeout(t); resolve(fallback); } },
    );
  });
}
function timeboxMsft(lat: number, lng: number): Promise<LngLat[] | null> {
  // Resolves to the MS ring if it arrives within the budget, else null. The underlying msftFootprint
  // promise keeps running past the budget to finish + cache the tile for the next request. msftFootprint
  // already swallows its own network/parse errors (returns null); timeboxResolve's reject arm is the
  // backstop, so no inline .catch is needed.
  return timeboxResolve<LngLat[] | null>(msftFootprint(lat, lng), MS_FOOTPRINT_BUDGET_MS, null);
}

export async function buildingFootprint(lat: string, lng: string): Promise<FootprintResult> {
  const la = +lat, ln = +lng;
  if (!isFinite(la) || !isFinite(ln)) return { source: "none", error: "bad_coords", candidates: [] };
  const key = la.toFixed(5) + "," + ln.toFixed(5);
  // Cache read: a COMPLETE entry is served for 30d; an INCOMPLETE entry (OSM-only, MS still warming when the
  // first cold request responded) is served for a SHORT window so a warm reload is INSTANT, then treated as a
  // MISS so the next call re-runs, finds the now-parsed MS cell, and upgrades to the complete set. This kills
  // the old "warm == cold == 5-8s" defeat (the incomplete result used to NEVER cache). Determinism preserved:
  // the wire still carries `incomplete:true`, so the client refetches the complete set before pinning measurement.
  const cached = diskGetJSON<{ body: FootprintResult; _t: number; incomplete?: boolean }>("footprint", key);
  if (cached && cached._t) {
    const ttl = cached.incomplete ? FOOTPRINT_INCOMPLETE_TTL_MS : 30 * 864e5;
    if (Date.now() - cached._t < ttl) return cached.body;
  }
  // (fix4 #1) Fetch OSM AND Microsoft in PARALLEL and return EVERY candidate, so the CLIENT can register each to
  // Google's roof reference and keep the best-aligned one (instead of "first source wins"). MS keeps running past
  // its budget (finishes + caches its tile/cell in the background), so we never abort it — we only decide how long
  // to WAIT. overpassFootprint / msftFootprint each swallow their own errors (return null) — no outer .catch().
  const osmP = timeboxResolve<LngLat[] | null>(overpassFootprint(la, ln), OSM_FOOTPRINT_BUDGET_MS, null);
  const msftP = timeboxMsft(la, ln);
  // FAST FIRST PAINT: if OSM returns a usable ring within a SHORT budget, respond NOW with OSM-only and let MS
  // finish + cache in the background — instead of blocking on the 6.5s MS budget when we already have a paintable
  // outline. Marked incomplete so the client paints instantly and refetches the complete OSM+MS set (served from
  // the now-warm cache in ms) before pinning the measurement — determinism preserved, latency slashed.
  const fastOsm = await Promise.race([osmP, new Promise<null>((r) => setTimeout(() => r(null), FOOTPRINT_FAST_PAINT_MS))]);
  if (fastOsm && Array.isArray(fastOsm) && fastOsm.length >= 3) {
    const msftNow = await Promise.race([msftP, Promise.resolve<"pending">("pending")]);
    const candidates: FootprintCandidate[] = [{ ring: fastOsm, source: "osm", attribution: "© OpenStreetMap contributors" }];
    let msPending = true;
    if (msftNow && msftNow !== "pending" && Array.isArray(msftNow) && msftNow.length >= 3) { candidates.push({ ring: msftNow, source: "msft", attribution: "© Microsoft Building Footprints (ODbL/CDLA)" }); msPending = false; }
    const out: FootprintResult = { ring: candidates[0].ring, source: candidates[0].source, attribution: candidates[0].attribution, candidates, incomplete: msPending };
    diskSetJSON("footprint", key, { body: out, _t: Date.now(), incomplete: msPending });
    return out;
  }
  // OSM was slow/absent past the fast-paint window. Don't blindly wait OSM's full 8s budget if MS is already in
  // hand (the common case once the tile+cell are warm): resolve MS first, and if it has a ring grant OSM only a
  // SHORT grace (cleaner rings when it lands) before responding. Stops the "MS ready in ms but response blocked
  // 8s on a hung Overpass" stall.
  const msft = await msftP;
  let osm: LngLat[] | null;
  if (msft && msft.length >= 3) {
    osm = await Promise.race([osmP, new Promise<null>((r) => setTimeout(() => r(null), FOOTPRINT_OSM_GRACE_MS))]);
  } else {
    osm = await osmP;
  }
  const candidates: FootprintCandidate[] = [];
  if (osm && osm.length >= 3) candidates.push({ ring: osm, source: "osm", attribution: "© OpenStreetMap contributors" });
  if (msft && msft.length >= 3) candidates.push({ ring: msft, source: "msft", attribution: "© Microsoft Building Footprints (ODbL/CDLA)" });
  if (!candidates.length) {
    const c = cacheFootprint(la, ln);
    if (c && c.length >= 3) candidates.push({ ring: c, source: "cache", attribution: "© Microsoft / national building footprints" });
  }
  // msPending: MS was still warming when the budget expired → INCOMPLETE (missing MS).
  const msPending = !msft;
  if (!candidates.length) return { source: "none", candidates: [] };
  const primary = candidates[0];
  const out: FootprintResult = { ring: primary.ring, source: primary.source, attribution: primary.attribution, candidates, incomplete: msPending };
  // Persist ANY real-source hit immediately (kills the warm==cold defeat). Complete → 30d TTL; OSM-only
  // (MS pending) → short incomplete-TTL so the warm reload is instant yet upgrades to the complete set shortly.
  if (candidates.some((c) => c.source === "osm" || c.source === "msft")) diskSetJSON("footprint", key, { body: out, _t: Date.now(), incomplete: msPending });
  return out;
}

/* ─── MULTI-building footprints within a map-view bbox (Select-Your-Roof neighbour layer) ───
   Returns EVERY building polygon inside the visible map bounds so the client can draw neighbouring
   houses as selectable outlines. Mirrors spikes/roof-quote/serve.mjs buildingsInBbox. OSM (Overpass
   way[building] over the bbox) first; the Microsoft z9 tile is scanned as a cold-area fallback. Empty
   {buildings:[]} is a valid answer (the client degrades to single-building). Disk-cached by rounded bbox. */
export interface BboxBuilding { id: string; ring: LngLat[]; centroid: LngLat; area: number; source: "osm" | "msft" | "vida"; }
export interface BuildingsResult { buildings: BboxBuilding[]; source: "osm" | "msft" | "vida" | "none"; attribution?: string; error?: string; _incomplete?: boolean; }
function bboxClamp(s: number, w: number, n: number, e: number): [number, number, number, number] {
  const cs = Math.min(s, n), cn = Math.max(s, n), cw = Math.min(w, e), ce = Math.max(w, e);
  const midLat = (cs + cn) / 2, midLng = (cw + ce) / 2, MAXSPAN = 0.012;
  const hs = Math.min((cn - cs) / 2, MAXSPAN / 2), hl = Math.min((ce - cw) / 2, MAXSPAN / 2);
  return [midLat - hs, midLng - hl, midLat + hs, midLng + hl];
}
function ringsFromOverpassEls(elements: any[], lat0: number): BboxBuilding[] {
  const out: BboxBuilding[] = [];
  for (const el of elements || []) {
    const geom = el.geometry; if (!Array.isArray(geom) || geom.length < 4) continue;
    const ring = fpOpenRing(geom.map((g: any) => [g.lon, g.lat] as LngLat));
    if (ring.length < 3) continue;
    if (fpRingArea(ring, lat0) < 8) continue;
    const c = fpCentroid(ring);
    out.push({ id: "osm/" + (el.type || "way") + "/" + (el.id != null ? el.id : c[0].toFixed(6) + "," + c[1].toFixed(6)),
      ring, centroid: c, area: fpRingArea(ring, lat0), source: "osm" });
  }
  return out;
}
// Per-endpoint hard timeout so a single hung/rate-limited Overpass mirror can't eat the whole route budget and
// starve the retry. Tightened 6s→3.5s (2×3.5=7s < 8s budget): with the Microsoft parsed-cell index now instant,
// OSM is no longer the sole neighbour source, so a slow/flaky Overpass mirror should yield FAST to MS/VIDA rather
// than burning the budget (the sparse-area 12s stall).
const OVERPASS_PER_TRY_MS = 3500;
async function overpassBuildingsBbox(bs: number, bw: number, bn: number, be: number): Promise<BboxBuilding[] | null> {
  const body = "data=" + encodeURIComponent('[out:json][timeout:7];way["building"](' + bs + "," + bw + "," + bn + "," + be + ");out geom;");
  const headers = { "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "WeFixTrades-RoofQuote/1.0 (roof footprint lookup; contact support@wefixtrades.com)" };
  const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  for (const ep of endpoints) {
    try {
      // Tight abort so a hung mirror yields to the next one (the quick retry) well inside the budget.
      const r = await fetch(ep, { method: "POST", headers, body, signal: AbortSignal.timeout(OVERPASS_PER_TRY_MS) });
      if (!r.ok) continue; // 429/502/504 → failure, try next mirror
      const j = (await r.json()) as any;
      return ringsFromOverpassEls(j.elements, (bs + bn) / 2); // possibly [] (valid empty — area genuinely has no OSM ways)
    } catch { /* timeout / network → try next endpoint */ }
  }
  return null; // both mirrors unreachable/failed (NOT a valid empty)
}
// Collect Microsoft buildings whose centroid lands inside the bbox, from the SMALL per-cell index
// (msftCellBuildings) — an in-memory filter, no per-request re-parse of the 30-45 MB .gz once the cell is warm.
async function msftBuildingsBbox(bs: number, bw: number, bn: number, be: number): Promise<BboxBuilding[] | null> {
  const lat = (bs + bn) / 2, lng = (bw + be) / 2;
  const buildings = await msftCellBuildings(lat, lng);
  if (!buildings) return null;
  const out: BboxBuilding[] = [];
  for (const b of buildings) {
    const c = b.c;
    if (c[1] < bs || c[1] > bn || c[0] < bw || c[0] > be) continue;
    out.push({ id: "msft/" + c[0].toFixed(6) + "," + c[1].toFixed(6), ring: b.ring, centroid: c, area: b.a, source: "msft" });
    if (out.length >= 400) break;
  }
  return out;
}
// True iff Microsoft HAS a footprint tile covering this bbox's quadkey. Disambiguates the two meanings of a
// `null` msft result: (a) NO MS COVERAGE here (no tile in the index) → `null` is COMPLETE; vs (b) the tile
// exists but was still downloading at the budget → `null` is TRANSIENT. Without this, markets with no MS tiles
// (ZA/AU, where VIDA is the only source) were flagged `_incomplete` forever and never cached → re-query every call.
async function msftHasTile(bs: number, bw: number, bn: number, be: number): Promise<boolean> {
  try { const lat = (bs + bn) / 2, lng = (bw + be) / 2; const idx = await loadMsftIndex(); return !!idx[lngLatToQuadkey(lat, lng, 9)]; }
  catch { return false; }
}

/* ─── VIDA Google–Microsoft–OSM Open Buildings (3rd footprint source, coverage-gap regions) ───
   FREE, public, anonymous S3 GeoParquet partitioned by country (ISO3). Queried at request-time with
   DuckDB httpfs+spatial (no download — bbox row-group pruning fetches ~0.3% of the file). Fills the
   coverage gap where OSM + Microsoft both return nothing (e.g. South Africa, Australia). Purely
   additive: ANY failure (duckdb missing, S3 unreachable, unknown country, timeout) logs + returns [],
   so the OSM→MS→approx union proceeds exactly as before. Mirrors spikes/roof-quote/serve.mjs. */
// (perf) VIDA NEVER blocks first paint. It runs to COMPLETION in the background (vidaBuildingsComplete) and
// self-heals via the bbox cache, so the request waits only a SHORT inline slice for an already-warm/cached VIDA
// result; if it isn't ready we paint OSM/MS now and the next (cached) load has the VIDA-filled set. The old 12s
// inline budget was the bulk of the "30-40s neighbours" latency on VIDA-dependent addresses.
const VIDA_FOOTPRINT_BUDGET_MS = 2500;
// Extra inline wait granted ONLY when NOTHING else covered the bbox (OSM down + no MS) — the reliability floor
// for pure-VIDA markets (ZA/AU) on the very first hit. Bounded so even that worst case can't reach 30-40s.
const VIDA_SECOND_CHANCE_MS = 5000;
const VIDA_S3 = "s3://us-west-2.opendata.source.coop/vida/google-microsoft-osm-open-buildings/geoparquet/by_country";
// Coarse ISO2/ISO3 lookup for the countries we expect coverage-gap roofs in. VIDA only needs the
// 3-letter ISO to pick the country file; we derive it from the bbox centroid (the /buildings route
// has no geocoded country — see the country-resolution note in vidaBuildingsBbox).
const ISO2_TO_ISO3: Record<string, string> = { ZA: "ZAF", AU: "AUS", NZ: "NZL", US: "USA", CA: "CAN", GB: "GBR" };
// Rough lon/lat boxes → ISO3. Coarse on purpose: just enough to route a query to the right country
// file for the gap regions; an out-of-box centroid returns null and VIDA is gracefully skipped.
// Approximate country bounding rectangles → which VIDA country parquet(s) to query. The boxes only SELECT
// candidates; a wrong guess just yields no rows and falls back gracefully. The US/Canada Great-Lakes border
// is genuinely unsplittable by rectangle (e.g. Windsor ON and Detroit MI sit at the same lng, <0.02° apart in
// lat), so the USA and CAN boxes deliberately OVERLAP across the border band and iso3CandidatesFromBbox
// returns BOTH for a point inside both — vidaBuildingsBbox queries each parquet and unions, so the right
// country's buildings always come back regardless of which side of the line the point is on.
const COUNTRY_BOXES: { iso3: string; w: number; s: number; e: number; n: number }[] = [
  { iso3: "ZAF", w: 16.0, s: -35.0, e: 33.0, n: -22.0 },   // South Africa
  { iso3: "AUS", w: 112.0, s: -44.0, e: 154.0, n: -10.0 }, // Australia
  { iso3: "NZL", w: 166.0, s: -47.5, e: 179.0, n: -34.0 }, // New Zealand
  { iso3: "CAN", w: -141.0, s: 41.0, e: -52.0, n: 84.0 },  // Canada (overlaps USA across the border band — both queried + unioned)
  // USA RE-ADDED (feat/us-footprints): USA.parquet (153.6M rows / 30,720 row-groups) was dropped because its
  // giant FOOTER cold-read timed out (~121s) UNDER concurrency. The single-flight serializer removes that
  // contention and a US STARTUP PREWARM (see prewarmVida) reads the footer ONCE so real US requests land warm:
  // measured ~5-7s after prewarm (Phoenix 5.7s/Sacramento 7.0s/Houston 6.8s), stable & non-zero; ~10s true-cold.
  // Box = CONUS + AK + HI; overlaps CAN at the border on purpose (iso3CandidatesFromBbox returns both → unioned).
  { iso3: "USA", w: -179.2, s: 18.5, e: -66.9, n: 71.5 },  // United States (CONUS + Alaska + Hawaii)
  { iso3: "IRL", w: -10.6, s: 51.3, e: -5.9, n: 55.5 },    // Ireland (overlaps GBR — both queried in the band)
  { iso3: "GBR", w: -8.7, s: 49.8, e: 1.9, n: 60.9 },      // United Kingdom
];
// Returns every distinct ISO3 whose box contains the bbox centroid, in COUNTRY_BOXES order (most-specific
// markets listed first). Empty when the point is outside all served markets → VIDA is skipped.
function iso3CandidatesFromBbox(bs: number, bw: number, bn: number, be: number): string[] {
  const lat = (bs + bn) / 2, lng = (bw + be) / 2, out: string[] = [];
  for (const b of COUNTRY_BOXES) if (lng >= b.w && lng <= b.e && lat >= b.s && lat <= b.n && !out.includes(b.iso3)) out.push(b.iso3);
  return out;
}
function iso2ToIso3(iso2?: string): string | null {
  if (!iso2) return null;
  return ISO2_TO_ISO3[iso2.toUpperCase()] || null;
}
// Parse a WKT POLYGON / MULTIPOLYGON outer ring → open LngLat ring (same shape as OSM/MS rings).
function wktOuterRing(wkt: string): LngLat[] | null {
  if (!wkt) return null;
  const m = /\(\(([^()]*)\)/.exec(wkt); // first coordinate group (outer ring of POLYGON or first MULTIPOLYGON part)
  if (!m) return null;
  const ring: LngLat[] = [];
  for (const pair of m[1].split(",")) {
    const t = pair.trim().split(/\s+/);
    const lng = +t[0], lat = +t[1];
    if (!isFinite(lng) || !isFinite(lat)) continue;
    ring.push([lng, lat]);
  }
  const open = fpOpenRing(ring);
  return open.length >= 3 ? open : null;
}
// ── RELIABILITY REBUILD (feat/reliable-footprints) — mirrors spikes/roof-quote/serve.mjs ─────────────
// The cold path used to FLAKE due to three bugs the diagnosis surfaced:
//   1. RACE: vidaConn() set `_duckdbInit=true` synchronously, THEN awaited ~4s of INSTALL/LOAD. Any caller in
//      that window saw `_duckdbInit===true` and got `_duckdbConn` while it was STILL null → vida returned []
//      instantly (no neighbours), and that empty got cached.
//   2. CACHE-POISON: `_incomplete` only checked `msft===null`. A vida-EXPECTED-but-empty union was cached as
//      COMPLETE → permanent fail until the 7-day TTL (in ZA/AU, vida is the ONLY source → a hard cached 0).
//   3. ABANDONED COLD QUERY: timeboxResolve stops WAITING at the budget but the vida result was DISCARDED
//      (unlike the MS tile, which finishes downloading + caches), so every cold miss re-paid full cost.
// Fixes: (1) memoize the connection as a single shared PROMISE (no half-built conn); (2) run the vida query to
// COMPLETION in the background and cache its rows by rounded bbox so a cold miss self-heals; (3) flag the union
// `_incomplete` whenever vida is still pending for a supported market.
let _duckdbConnP: Promise<any> | null = null;
function vidaConn(): Promise<any> {
  if (_duckdbConnP) return _duckdbConnP;
  _duckdbConnP = (async () => {
    try {
      // Lazy/dynamic require so a missing native binding can NEVER crash module load — it just disables VIDA.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const duckdb = require("duckdb");
      const db = new duckdb.Database(":memory:");
      const conn = db.connect();
      const run = (sql: string) => new Promise<void>((resolve, reject) => conn.run(sql, (e: any) => (e ? reject(e) : resolve())));
      // Required session settings or it SSL-fails on the dotted bucket name. Run ONCE on this persistent conn.
      await run("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;");
      await run("SET s3_region='us-west-2'; SET s3_url_style='path'; SET s3_endpoint='s3.us-west-2.amazonaws.com';");
      return conn;
    } catch (e) {
      log.warn("vida duckdb init failed — VIDA footprints disabled", { err: (e as Error).message });
      return null;
    }
  })();
  return _duckdbConnP;
}
// ── Query serializer (CRITICAL for cold reliability) ─────────────────────────────────────────────────
// DIAGNOSED: duckdb serializes work on the in-memory DB, so concurrent S3 reads CONTEND — a CAN query that's
// ~3.4s alone balloons to ~18s when prewarm queries run alongside it. Fix: run every vida query through a
// single-flight queue (only ONE S3 read in flight → no contention), and give REAL requests PRIORITY over
// prewarm — a real query jumps ahead of any still-queued prewarm, so it waits at most the one in-flight read.
let _vidaChain: Promise<any> = Promise.resolve();
const _vidaPrioQ: Array<{ fn: () => Promise<any>; resolve: (v: any) => void; reject: (e: any) => void }> = [];
let _vidaBusy = false;
function _vidaPump(): void {
  if (_vidaBusy) return;
  const job = _vidaPrioQ.shift(); if (!job) return;
  _vidaBusy = true;
  Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => { _vidaBusy = false; _vidaPump(); });
}
// Run `fn` serialized. priority=true → REAL request: jumps the prewarm queue. priority=false → prewarm:
// chained after everything, draining pending priority jobs first so real traffic is never starved.
function vidaRun<T>(fn: () => Promise<T>, priority?: boolean): Promise<T> {
  if (priority) return new Promise<T>((resolve, reject) => { _vidaPrioQ.push({ fn, resolve, reject }); _vidaPump(); });
  // Non-priority (prewarm) failures are already logged at the vidaQueryCountry/prewarmVida level; here we only
  // need to keep the serializer chain alive for the NEXT step. Both catches return an explicit sentinel (false)
  // rather than swallowing into undefined, so this is a chain-continuation guard, not a hidden error.
  const p = _vidaChain
    .then(() => new Promise<void>((res) => { const tick = (): void => { if (_vidaPrioQ.length || _vidaBusy) setTimeout(tick, 40); else res(); }; tick(); }))
    .then(fn).catch(() => false as unknown as T);
  _vidaChain = p.catch(() => false);
  return p as Promise<T>;
}
// Query ONE country parquet for the bbox. Own try/catch so one slow/failing country can't sink the others.
// `priority` is threaded to vidaRun so real requests preempt prewarm on the shared (serialized) connection.
async function vidaQueryCountry(conn: any, iso3: string, bs: number, bw: number, bn: number, be: number, priority?: boolean): Promise<BboxBuilding[]> {
  const lat0 = (bs + bn) / 2, out: BboxBuilding[] = [];
  try {
    const file = `${VIDA_S3}/country_iso=${iso3}/${iso3}.parquet`;
    // bbox STRUCT filter triggers GeoParquet row-group pruning (note: x=lon, y=lat).
    const sql =
      "SELECT ST_AsText(geometry) AS wkt, bf_source, confidence, area_in_meters " +
      `FROM read_parquet('${file.replace(/'/g, "''")}') ` +
      `WHERE bbox.xmin <= ${be} AND bbox.xmax >= ${bw} AND bbox.ymin <= ${bn} AND bbox.ymax >= ${bs} ` +
      "LIMIT 600;";
    const rows: any[] = await vidaRun<any[]>(() => new Promise((resolve, reject) =>
      conn.all(sql, (e: any, r: any[]) => (e ? reject(e) : resolve(r || [])))), priority);
    for (const row of rows) {
      const ring = wktOuterRing(String(row.wkt || ""));
      if (!ring) continue;
      if (fpRingArea(ring, lat0) < 8) continue;
      const c = fpCentroid(ring);
      if (c[1] < bs || c[1] > bn || c[0] < bw || c[0] > be) continue; // centroid outside bbox
      out.push({ id: "vida/" + c[0].toFixed(6) + "," + c[1].toFixed(6), ring, centroid: c, area: fpRingArea(ring, lat0), source: "vida" });
    }
  } catch (e) {
    log.warn("vida bbox query failed — skipping this country", { iso3, err: (e as Error).message });
  }
  return out;
}
// Raw multi-country query: candidates run in PARALLEL (one slow country can't block another) on the shared
// persistent connection, then unioned + deduped. NEVER throws — returns [] on any failure.
async function vidaBuildingsBbox(bs: number, bw: number, bn: number, be: number, iso3s: string[], priority?: boolean): Promise<BboxBuilding[]> {
  if (!iso3s || !iso3s.length) return [];
  const conn = await vidaConn();
  if (!conn) return [];
  const seen = new Set<string>(), out: BboxBuilding[] = [];
  const per = await Promise.all(iso3s.map((iso3) => vidaQueryCountry(conn, iso3, bs, bw, bn, be, priority)));
  for (const list of per) for (const b of list) { if (seen.has(b.id)) continue; seen.add(b.id); out.push(b); }
  return out;
}

// ── Background completion + self-healing cache (mirrors the MS-tile "keep running past the budget" model) ──
// A cold vida query is kicked off and RUNS TO COMPLETION even after the request stops waiting at its budget; its
// rows are stored in this in-memory cache keyed by rounded bbox, so the NEXT call (or the client's background
// retry) gets the full neighbour set instantly — a cold miss self-heals, never permanently fails.
const VIDA_BBOX_TTL_MS = 7 * 864e5;
const _vidaResultCache = new Map<string, { rows: BboxBuilding[]; t: number }>();
const _vidaInflight = new Map<string, Promise<BboxBuilding[]>>(); // in-flight dedup; concurrent callers share it
function _vidaKey(bs: number, bw: number, bn: number, be: number): string { return [bs, bw, bn, be].map((n) => n.toFixed(4)).join(","); }
// Returns the FULL vida rows for the bbox, started/continued in the background. Runs to completion + caches
// regardless of whether any individual caller is still waiting on it.
function vidaBuildingsComplete(bs: number, bw: number, bn: number, be: number, iso3s: string[]): Promise<BboxBuilding[]> {
  if (!iso3s || !iso3s.length) return Promise.resolve([]);
  const key = _vidaKey(bs, bw, bn, be);
  const cached = _vidaResultCache.get(key);
  if (cached && Date.now() - cached.t < VIDA_BBOX_TTL_MS) return Promise.resolve(cached.rows);
  const inflight = _vidaInflight.get(key);
  if (inflight) return inflight;
  // priority=true: this is a REAL request → its country queries preempt prewarm on the serialized connection.
  const p = vidaBuildingsBbox(bs, bw, bn, be, iso3s, true)
    .then((rows) => { if (Array.isArray(rows) && rows.length) _vidaResultCache.set(key, { rows, t: Date.now() }); return rows || []; })
    .catch((e) => { log.warn("vida complete failed", { err: (e as Error)?.message }); return [] as BboxBuilding[]; })
    .finally(() => { _vidaInflight.delete(key); });
  _vidaInflight.set(key, p);
  return p;
}
// True iff a bbox EXPECTED vida (had ISO3 candidates) but we don't yet hold a non-empty cached vida result —
// i.e. the vida layer for this union is still INCOMPLETE and the union must NOT be cached as final.
function vidaPending(bs: number, bw: number, bn: number, be: number, iso3s: string[]): boolean {
  if (!iso3s || !iso3s.length) return false; // no supported market → vida not expected → not pending
  const cached = _vidaResultCache.get(_vidaKey(bs, bw, bn, be));
  return !(cached && Date.now() - cached.t < VIDA_BBOX_TTL_MS && cached.rows.length > 0);
}
export async function buildingsInBbox(bboxStr: string): Promise<BuildingsResult> {
  const parts = String(bboxStr || "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !isFinite(n))) return { buildings: [], source: "none", error: "bad_bbox" };
  let [bs, bw, bn, be] = bboxClamp(parts[0], parts[1], parts[2], parts[3]);
  const gk = [bs, bw, bn, be].map((n) => n.toFixed(4)).join(",");
  // Cache read: a COMPLETE non-empty result is served for 7d; a NON-EMPTY but INCOMPLETE result (OSM/MS in hand,
  // VIDA still loading OR MS tile still warming) is served for a SHORT window so a warm reload is INSTANT instead
  // of re-paying the full race, then a MISS so the next call upgrades to the complete set. This is the key fix for
  // "30-40s neighbours, every time": an incomplete union used to NEVER cache, so every visit re-raced flaky
  // Overpass (12s) + waited the VIDA budget. We still NEVER cache an incomplete EMPTY (a cached 0 would shadow a
  // warming tile). The `_incomplete` flag persisted alongside distinguishes the two on read.
  const cached = diskGetJSON<{ body: BuildingsResult; _t: number; incomplete?: boolean }>("buildings", gk);
  if (cached && cached.body && cached._t) {
    const ttl = cached.incomplete ? BUILDINGS_INCOMPLETE_TTL_MS : 7 * 864e5;
    if (Date.now() - cached._t < ttl) return cached.body;
  }
  // Reliability fix (mirrors spikes/roof-quote/serve.mjs): RACE OSM + MS concurrently instead of the old
  // sequential cascade. The public Overpass mirrors intermittently time out / 429 / 502; under the old
  // cascade that returned an empty list AND only began warming the MS tile AFTER OSM's full budget, so a
  // transient Overpass blip left Select-Your-Roof stuck at the main house. Racing them starts the MS tile
  // download WHILE OSM runs, so on an OSM failure the MS footprints are already in hand (or the tile is
  // warm for the immediate retry). Independently time-boxed → total wait ≈ max(budget), not the sum.
  // 3rd source: VIDA Open Buildings (ISO3 from bbox centroid). Time-boxed like the others so a slow
  // remote DuckDB query can never hang the request; vidaBuildingsBbox never throws (returns [] on any
  // failure), so the fallback arm of timeboxResolve is just a backstop.
  // VIDA: vidaBuildingsComplete() runs the duckdb S3 query to COMPLETION in the background (and caches its rows
  // by rounded bbox) regardless of the request budget — exactly like the MS tile keeps downloading past its
  // budget. The request waits only VIDA_FOOTPRINT_BUDGET_MS; if the cold query isn't done it falls back to []
  // for THIS response, but the query finishes + caches so the next call returns the full set instantly. The
  // vidaPending() check below then flags the partial union `_incomplete` so it is NOT cached.
  const iso3s = iso3CandidatesFromBbox(bs, bw, bn, be);
  // OSM gets a TIGHTER ceiling here (BUILDINGS_OSM_BUDGET_MS) than the footprint route: with the Microsoft cell
  // instant once warm, a slow/flaky Overpass must yield quickly to MS+VIDA rather than holding the whole neighbour
  // response at ~7s (two 3.5s mirror tries). MS + VIDA keep running past their budgets and cache in the background,
  // so a tighter inline wait never loses data — the next load self-heals.
  let [osm, msft, vida, msftExpected] = await Promise.all([
    timeboxResolve<BboxBuilding[] | null>(overpassBuildingsBbox(bs, bw, bn, be), BUILDINGS_OSM_BUDGET_MS, null),
    timeboxResolve<BboxBuilding[] | null>(msftBuildingsBbox(bs, bw, bn, be), MS_FOOTPRINT_BUDGET_MS, null),
    timeboxResolve<BboxBuilding[]>(vidaBuildingsComplete(bs, bw, bn, be, iso3s), VIDA_FOOTPRINT_BUDGET_MS, []),
    msftHasTile(bs, bw, bn, be), // does MS even HAVE a tile here? distinguishes "still warming" from "no coverage"
  ]);
  // SECOND-CHANCE for the COLD FIRST HIT (feat/us-footprints): if the primary pass produced NOTHING usable —
  // OSM flapped down AND MS gave nothing yet — but this is a VIDA market and the VIDA query is still in flight
  // (footer warming, ~12s the first time), returning [] would be the "0 neighbours on the very first visit" the
  // bar forbids. VIDA is the DETERMINISTIC source, so wait a little longer for its in-flight background-complete
  // (shares the same promise → no new work). Converts the only cold-edge (first hit, OSM down, footer not warm)
  // from a 0 into the reliable VIDA floor; bounded by VIDA_SECOND_CHANCE_MS so a stuck read can't hang the request.
  const noPrimaryCoverage = !(Array.isArray(osm) && osm.length) && !(Array.isArray(msft) && msft.length);
  if (noPrimaryCoverage && iso3s.length && !(Array.isArray(vida) && vida.length)) {
    vida = await timeboxResolve<BboxBuilding[]>(vidaBuildingsComplete(bs, bw, bn, be, iso3s), VIDA_SECOND_CHANCE_MS, vida || []);
  }
  // `msft===null` is only TRANSIENT (incomplete) if MS actually HAS a tile here that was still downloading. If
  // MS has no tile at all (msftExpected=false, e.g. ZA/AU), a null is COMPLETE — don't taint the union.
  const msPending = msft === null && msftExpected;
  let out: BuildingsResult;
  // UNIVERSAL COVERAGE ("not all roofs are detected, any region"): UNION OSM + Microsoft instead of OSM
  // winner-take-all. Previously if OSM had ANY building the MS layer was ignored, so buildings OSM was MISSING
  // (but Microsoft HAS) showed no selectable outline. Now OSM wins a duplicate (cleaner rings) and Microsoft
  // ADDS every building OSM lacks; dedup by point-in-polygon (an MS centroid inside an OSM ring = same
  // building) so adjacent/row houses are never wrongly merged.
  // VIDA is the 3rd source (after OSM + Microsoft): it ADDS coverage-gap buildings (ZA/AU etc. where
  // both OSM and MS are empty) that aren't already represented by an OSM or MS footprint. Deduped by the
  // SAME point-in-polygon test so a VIDA building overlapping an existing OSM/MS ring is dropped and
  // adjacent/row houses are never wrongly merged.
  const haveO = Array.isArray(osm) && osm.length > 0;
  const haveM = Array.isArray(msft) && msft.length > 0;
  const haveV = Array.isArray(vida) && vida.length > 0;
  if (haveO || haveM || haveV) {
    const inRing = (pt: LngLat, ring: LngLat[]): boolean => {
      let inside = false; const x = pt[0], y = pt[1];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
        if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
    };
    const merged: BboxBuilding[] = haveO ? (osm as BboxBuilding[]).slice() : [];
    if (haveM) {
      const osmRings = haveO ? (osm as BboxBuilding[]).map((o) => o.ring) : [];
      for (const mb of msft as BboxBuilding[]) { if (osmRings.some((r) => inRing(mb.centroid, r))) continue; merged.push(mb); }
    }
    if (haveV) {
      // Dedup VIDA against everything merged so far (OSM + the MS buildings we added) — append only
      // VIDA buildings whose centroid isn't already inside an existing ring.
      const existingRings = merged.map((b) => b.ring);
      for (const vb of vida) { if (existingRings.some((r) => inRing(vb.centroid, r))) continue; merged.push(vb); }
    }
    const source: BuildingsResult["source"] = haveO ? "osm" : haveM ? "msft" : "vida";
    let attribution = "© OpenStreetMap contributors · © Microsoft Building Footprints (ODbL/CDLA)";
    if (haveV) attribution += " · © Google–Microsoft–OSM Open Buildings / VIDA (CC-BY-4.0)";
    // COLD-FLASH fix: if Microsoft was still WARMING its (~30 MB per-area) tile when its budget expired
    // (msft === null), this UNION is PARTIAL — it carries OSM (and/or VIDA) but is MISSING every building
    // only Microsoft covers (the bulk of the neighbours in many suburbs). Previously this partial was CACHED
    // (non-empty + no _incomplete flag), so the very first cold visit's OSM-only result shadowed the now-warm
    // MS tile for the full 7-day TTL and neighbours never appeared on ANY later visit. Flag it `_incomplete`
    // so the cache write below skips it; the next load re-runs live with the warm tile and returns the full
    // neighbour set. (OSM is flaky, but osm === null with MS present is still complete — only msft === null
    // taints the union, because that's the source whose absence is transient.)
    // VIDA EXTENSION (reliability rebuild): the union is ALSO incomplete if this bbox EXPECTED vida (supported
    // market) but we don't yet hold its non-empty cached result — e.g. the cold S3 query was still running at
    // the budget. Caching that vida-less union would shadow the now-completing query forever (the ZA/AU
    // permanent-empty bug). vidaPending() flags it so the route skips the cache and the next call self-heals.
    // US RELIABILITY (feat/us-footprints): in the US, OSM (Overpass) FLAPS — answers ~half the time, times out
    // the rest — so the union count yo-yos (incl. to 0). The old guard kept the union `_incomplete` while VIDA
    // was still loading, so NO good result ever cached → every visit re-raced flaky Overpass. Dataset facts: OSM
    // and MS are RICH in the US (either alone is a solid set); VIDA is the dependable supplementary floor + the
    // only source for pure-VIDA markets (ZA/AU). Correct cache rule: a union that ALREADY has OSM or MS coverage
    // is good enough to LOCK IN now. We normally honour `msPending` (MS has a tile here but was mid-download — it
    // adds the BULK, so caching an MS-less partial would shadow it: the original cold-flash bug, e.g. Scone UK).
    // EXCEPTION proven by Phoenix/Houston: across much of the US, MS reports a tile (msftHasTile=true) but the tile
    // returns EMPTY/slow indefinitely, so `msPending` stays true FOREVER → the cache was permanently blocked and
    // the count yo-yoed with flaky OSM (4 VIDA-only ↔ 11 osm+vida ↔ 0). Measured: VIDA lands by ~t=12s and is a
    // STABLE non-zero floor thereafter. So once VIDA coverage is in hand (haveReliableVida), the union is
    // dependable and MUST cache even if MS is still "pending" — MS plainly isn't coming. Otherwise cache any
    // settled non-empty OSM/MS union; only a result with neither a reliable VIDA floor nor settled OSM/MS coverage
    // stays `_incomplete` to self-heal. This locks in the first dependable US result and ends the OSM oscillation.
    const vPending = vidaPending(bs, bw, bn, be, iso3s);
    const haveReliableVida = haveV && !vPending;   // VIDA delivered its dependable floor for this bbox
    out = { buildings: merged, source, attribution, _incomplete: haveReliableVida ? false : (msPending || vPending) };
  } else {
    // `_incomplete` = MS was still downloading its cold tile (msft===null) when the budget expired → this
    // empty answer is TRANSIENT (tile warms in bg, next load has it). Don't cache it so the retry self-heals.
    // VIDA EXTENSION: a TRUE empty in a supported market is almost always the cold vida query not-yet-done —
    // flag incomplete so we don't cache a 0 the background query is about to fill (ZA/AU self-heal).
    out = { buildings: [], source: "none", _incomplete: msPending || vidaPending(bs, bw, bn, be, iso3s) };
  }
  // COMPLETE non-empty → long TTL. INCOMPLETE non-empty → short TTL (instant warm reload, upgrades soon via the
  // background self-heal). Incomplete EMPTY and complete-empty both skip the cache (the empty stays live so a
  // warming tile / VIDA self-heal fills it). The `_incomplete` flag is persisted so the read path picks the TTL.
  if (out.buildings.length) diskSetJSON("buildings", gk, { body: out, _t: Date.now(), incomplete: !!out._incomplete });
  return out;
}

/* Fire-and-forget VIDA pre-warm — call once at server startup. The duckdb httpfs range-cache +
   spatial/httpfs extensions are ~9s cold, so the FIRST real ZA/AU request would otherwise blow the
   per-request budget and return 0 neighbours. Run a tiny-bbox query per common gap country to warm the
   connection + range cache before the first user. NEVER blocks startup; never throws. */
export function prewarmVida(): void {
  void (async () => {
    try {
      const t0 = Date.now();
      const conn = await vidaConn(); // pay the ~4s INSTALL/LOAD + S3 config ONCE, up front
      if (!conn) { console.warn("[vida] prewarm: no duckdb conn — VIDA disabled"); return; }
      console.log("[vida] connection warmed in", Date.now() - t0, "ms");
      // One tiny bbox per SUPPORTED market → warms each parquet's footer/row-group index in the httpfs cache so
      // the first real warm query in that country is <1s. Independent (allSettled) so one slow country can't
      // delay the others. Uses vidaBuildingsBbox directly (metadata warm) — these throwaway boxes must NOT
      // pollute the result cache.
      const warm: Array<{ iso3: string; s: number; w: number; n: number; e: number }> = [
        // CAN first (primary live market — keep its warm path fast), then USA whose big footer (30,720
        // row-groups, ~12s) is warmed early so real US requests land at ~5-7s instead of paying it on first hit.
        { iso3: "CAN", s: 43.2540, w: -79.8720, n: 43.2550, e: -79.8710 }, // Hamilton, ON (primary CA market)
        { iso3: "USA", s: 38.8970, w: -77.0370, n: 38.8980, e: -77.0360 }, // Washington, DC (warms USA.parquet footer)
        { iso3: "ZAF", s: -26.1700, w: 28.1300, n: -26.1690, e: 28.1310 }, // Bedfordview, JHB
        { iso3: "AUS", s: -33.8690, w: 151.2090, n: -33.8680, e: 151.2100 }, // Sydney
        { iso3: "GBR", s: 51.5070, w: -0.1280, n: 51.5080, e: -0.1270 }, // London
        { iso3: "IRL", s: 53.3490, w: -6.2610, n: 53.3500, e: -6.2600 }, // Dublin
        { iso3: "NZL", s: -36.8490, w: 174.7630, n: -36.8480, e: 174.7640 }, // Auckland
      ];
      const t1 = Date.now();
      await Promise.allSettled(warm.map((b) => vidaBuildingsBbox(b.s, b.w, b.n, b.e, [b.iso3]).catch((err) => { console.warn("[vida] prewarm bbox failed (", b.iso3, "):", (err as Error)?.message || err); })));
      console.log("[vida] prewarm done — 7 markets in", Date.now() - t1, "ms");
    } catch (e) { console.warn("[vida] prewarm failed:", (e as Error)?.message || e); }
  })();
}

/* ─── Production fallback for addresses Google Solar doesn't cover (NREL PVWatts v8,
   api.data.gov key). Returns expected annual AC kWh for a typical system. Cached. ─── */
const nrelKey = (): string => process.env.NREL_API_KEY || "";
export interface PvwattsResult { annualKwh?: number; kw?: number; source?: string; error?: string }
export async function pvwattsProduction(lat: string, lng: string, kw: number): Promise<PvwattsResult> {
  if (!lat || !lng) return { error: "bad_coords" };
  kw = kw || 6;
  const key = (+lat).toFixed(2) + "," + (+lng).toFixed(2) + "," + kw;
  const cached = diskGetJSON<PvwattsResult>("pvwatts", key);
  if (cached) return cached;
  const NREL = nrelKey();
  if (!NREL) return { error: "no_nrel_key" };
  const r = await fetch(
    "https://developer.nrel.gov/api/pvwatts/v8.json?api_key=" + NREL +
      "&lat=" + lat + "&lon=" + lng + "&system_capacity=" + kw +
      "&azimuth=180&tilt=20&array_type=1&module_type=0&losses=14",
  );
  const j = (await r.json()) as any;
  const ann = j?.outputs?.ac_annual;
  if (typeof ann === "number") {
    const out: PvwattsResult = { annualKwh: Math.round(ann), kw, source: "NREL PVWatts v8" };
    diskSetJSON("pvwatts", key, out);
    return out;
  }
  return { error: "no_pvwatts" };
}

/* ─── Solar API quota protection: buildingInsights + dataLayers are static per
   location, billable, and daily-quota-capped. Cache SUCCESSFUL responses on disk
   keyed by lat/lng rounded to ~5 decimals (≈1.1 m — near-identical loads of the
   same address share one entry). Errors/no_solar are NEVER cached so they retry.
   TTL 30 days (these effectively never change). `cached` flag is for logging /
   X-Cache; it is not part of the upstream JSON body. ─── */
const SOLAR_CACHE_TTL_MS = 30 * 864e5; // 30 days — buildingInsights is static, has no tokens
// dataLayers responses EMBED geoTiff:get URLs whose signed tokens expire in ~hours.
// They must NOT be cached anywhere near 30 days or cached addresses serve stale-token
// URLs that 400 → the client's "Invalid byte order" crash. Cap well under the token life.
const DATALAYERS_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
// Round to 5 dp so coords like 41.123456 / 41.123461 collapse to one cache key.
const geoCacheKey = (lat: string, lng: string): string =>
  (+lat).toFixed(5) + "," + (+lng).toFixed(5);
interface SolarCacheEntry {
  body: string;
  status: number;
  _t: number;
}
function readSolarCache(
  prefix: string,
  key: string,
  ttlMs: number = SOLAR_CACHE_TTL_MS,
): SolarCacheEntry | null {
  const c = diskGetJSON<SolarCacheEntry>(prefix, key);
  if (c && typeof c.body === "string" && c._t && Date.now() - c._t < ttlMs) return c;
  return null;
}

/** Raw Solar buildingInsights passthrough. Returns the upstream text body + ok flag.
 *  Successful responses are disk-cached by rounded lat/lng to protect the billable
 *  Solar quota; errors fall through to a live retry. */
export async function solarInsights(
  lat: string,
  lng: string,
): Promise<{ ok: boolean; status: number; body: string; cached?: boolean }> {
  const key = geoCacheKey(lat, lng);
  const hit = readSolarCache("solar", key);
  if (hit) return { ok: true, status: hit.status || 200, body: hit.body, cached: true };
  const SOLAR = solarKey();
  const r = await fetch(
    "https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=" +
      lat +
      "&location.longitude=" +
      lng +
      "&requiredQuality=LOW&key=" +
      SOLAR,
  );
  const body = await r.text();
  // Cache ONLY successful responses — a 4xx/5xx (incl. quota-exhausted) must retry next time.
  if (r.ok) diskSetJSON("solar", key, { body, status: r.status, _t: Date.now() } as SolarCacheEntry);
  return { ok: r.ok, status: r.status, body, cached: false };
}

/** Raw Solar dataLayers passthrough. Returns the upstream text body + ok flag.
 *  Successful responses are disk-cached by rounded lat/lng (same quota-protection
 *  scheme as solarInsights); errors fall through to a live retry. */
export async function dataLayers(
  lat: string,
  lng: string,
  fresh = false, // bypass cache + re-mint signed geoTiff URLs after a stale-token 400
): Promise<{ ok: boolean; status: number; body: string; cached?: boolean }> {
  const key = geoCacheKey(lat, lng);
  // Short TTL (not the 30d solar TTL): the embedded geoTiff URLs carry signed tokens
  // that expire in hours, so a long-cached datalayers entry hands out dead URLs.
  const hit = fresh ? null : readSolarCache("datalayers", key, DATALAYERS_CACHE_TTL_MS);
  if (hit) return { ok: true, status: hit.status || 200, body: hit.body, cached: true };
  const SOLAR = solarKey();
  const url =
    "https://solar.googleapis.com/v1/dataLayers:get?location.latitude=" +
    lat +
    "&location.longitude=" +
    lng +
    "&radiusMeters=40&view=FULL_LAYERS&requiredQuality=LOW&pixelSizeMeters=0.1&key=" +
    SOLAR;
  const r = await fetch(url);
  const body = await r.text();
  if (r.ok) diskSetJSON("datalayers", key, { body, status: r.status, _t: Date.now() } as SolarCacheEntry);
  return { ok: r.ok, status: r.status, body, cached: false };
}

export type GeoTiffResult =
  | { ok: true; contentType: string; buf: Buffer }
  | { ok: false; status: number; error: string };

/**
 * GeoTIFF proxy: fetch a Solar geoTiff:get URL server-side (appends key) and
 * return bytes. Host-whitelisted to solar.googleapis.com so the key can never
 * be used to proxy arbitrary URLs.
 */
export async function geoTiff(raw: string): Promise<GeoTiffResult> {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return { ok: false, status: 400, error: "bad url" };
  }
  if (target.hostname !== "solar.googleapis.com") {
    return { ok: false, status: 403, error: "host not allowed" };
  }
  target.searchParams.set("key", solarKey());
  const r = await fetch(target.toString());
  if (!r.ok) return { ok: false, status: r.status, error: "upstream " + r.status };
  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: true, contentType: r.headers.get("content-type") || "image/tiff", buf };
}

export type StreetViewResult =
  | { ok: true; buf: Buffer }
  | { ok: false; status: number; error: string };

/** Street View proxy (key hidden server-side) → the "before" photo for the visualizer.
 *  Probes the (free) metadata endpoint FIRST: the Static Street View image API returns
 *  HTTP 200 with a grey "Sorry, we have no imagery here" placeholder for uncovered
 *  locations (it never 4xx's), so a naive `r.ok` check would hand back a placeholder.
 *  Metadata reports status OK / ZERO_RESULTS / NOT_FOUND, letting us treat no-coverage
 *  as a clean miss — both for the "before" photo and the aiRender base fallback. */
export async function streetView(address: string): Promise<StreetViewResult> {
  const SOLAR = solarKey();
  // 1) coverage probe (free, no image billed) — bail cleanly when there is no panorama.
  try {
    const m = await fetch(
      "https://maps.googleapis.com/maps/api/streetview/metadata?location=" +
        encodeURIComponent(address) +
        "&key=" +
        SOLAR,
    );
    const mj = (await m.json()) as { status?: string };
    if (mj.status && mj.status !== "OK") {
      return { ok: false, status: 404, error: "no_coverage:" + mj.status };
    }
  } catch {
    /* metadata probe is best-effort; fall through to the image fetch below */
  }
  const r = await fetch(
    "https://maps.googleapis.com/maps/api/streetview?size=640x640&location=" +
      encodeURIComponent(address) +
      "&key=" +
      SOLAR +
      "&fov=80&pitch=12",
  );
  if (!r.ok) return { ok: false, status: r.status, error: "upstream " + r.status };
  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: true, buf };
}

// ── AI photoreal roof material re-render: capture → Flux Kontext repaint, cached ──
export interface AiRenderResult {
  url?: string;
  provider?: string;
  knowledge?: string;
  tier?: "browse" | "final";
  error?: string;
  detail?: string;
  tried?: string[];
  cached?: boolean;
}

/**
 * @param paid  when false, only `tier="browse"` is honoured and the pricey
 *              gpt-image-1 (openai) provider is skipped — exactly like
 *              serve.mjs's `tier==="browse"` chain filter. The cost gate.
 *
 * TODO(roofquote): integrate server/services/quotequickAiBudget.ts
 * gateDecision()/recordSpend() once the widget passes a calculatorId/owner
 * context. The widget does not yet send owner context, so the full budget
 * integration is deferred; the browse/final tier filter below is the interim
 * cost lever.
 */
export async function aiRender(
  address: string,
  material: string,
  requestedTier: string,
  paid: boolean,
): Promise<AiRenderResult> {
  // Cost gate: an unpaid request can never escalate to the "final" (gpt-image-1) tier.
  const tier: "browse" | "final" = !paid || requestedTier === "browse" ? "browse" : "final";
  // "|v2" bumps the cache key so any disk entries cached BEFORE the durable-rehost fix (which stored
  // soon-to-expire provider urls → 404 → black panel) are skipped, not served (audit-6 P1 invalidation).
  const ck = address + "|" + material + "|" + tier + "|v2";
  if (aiCache.has(ck)) return { cached: true, ...aiCache.get(ck)! };
  {
    const d = diskGetJSON<AiRenderResult>("air", ck);
    if (d) {
      aiCache.set(ck, d);
      return { cached: true, ...d };
    }
  }
  // Base "before" image for the repaint. Preferred source is the oblique 3D aerial
  // (richest framing of the whole roof) — but that needs a headless Chromium, which
  // the prod (Replit publish) runtime does NOT ship. When the capture is unavailable
  // there, fall back to a Google Street View photo, which is a plain signed-URL fetch
  // (no browser) and works in every runtime. This is the documented design
  // ("Street View → Flux Kontext repaint") and is what makes "see it on my house"
  // render in prod. Local/dev (with Chromium) still uses the richer oblique base.
  let dataUri: string;
  let view: BaseView = "oblique";
  try {
    const buf = await captureOblique(address);
    dataUri = "data:image/png;base64," + buf.toString("base64");
  } catch (capErr) {
    // Only fall back for the runtime-has-no-browser case (or any capture failure):
    // try Street View. A street-level photo of the SAME house is a perfectly good
    // img2img base for repainting the visible roof.
    const sv = await streetView(address).catch(
      (e: unknown): StreetViewResult => ({ ok: false, status: 0, error: String((e as Error)?.message || e) }),
    );
    if (!sv.ok) {
      // No oblique capture AND no Street View coverage for this address → degrade
      // gracefully. Return the "AI unavailable" signal (NOT a 500) so the widget
      // keeps its instant swatch-tint fallback.
      return {
        error: "capture_failed",
        detail:
          "no base image: capture(" +
          String((capErr as Error)?.message || capErr) +
          ") + streetview(" +
          (sv.status ? sv.status + " " : "") +
          sv.error +
          ")",
      };
    }
    dataUri = "data:image/jpeg;base64," + sv.buf.toString("base64");
    view = "street";
    log.info("airender base fell back to street view (no headless capture in this runtime)", { address });
  }
  // Property Analysis Agent → House Knowledge Package (cached); injected so the render preserves roof geometry.
  // NOTE: houseKnowledge() also calls captureOblique() internally; in a no-Chromium
  // runtime that simply yields an empty package (best-effort), which is fine.
  let pkg = "";
  try {
    pkg = await houseKnowledge(address);
  } catch {
    /* knowledge is best-effort */
  }
  // failover chain: try each provider until one renders (resilience like our LLM fallback chain)
  const tried: string[] = [];
  const chain = tier === "browse" ? RENDER_CHAIN.filter((x) => x[0] !== "openai") : RENDER_CHAIN; // browse skips the pricey gpt-image-1
  for (const [name, fn] of chain) {
    try {
      const rawUrl = await fn(dataUri, material, pkg, view);
      // Re-host the provider's (possibly ephemeral) url to a stable self-hosted url so later/cached
      // visitors never hit an expired 404 → black panel. On rehost failure, fall back to the raw url.
      const stable = await rehostRenderedImage(ck, rawUrl);
      const url = stable || rawUrl;
      const result: AiRenderResult = { url, provider: name, knowledge: pkg || undefined, tier };
      aiCache.set(ck, result);
      diskSetJSON("air", ck, result);
      return result;
    } catch (e) {
      tried.push(name + ":" + (e as Error).message);
      log.error("render fail", { provider: name, err: (e as Error).message });
    }
  }
  return { error: "all_providers_failed", tried };
}

// ── ROOF-ONLY top-down masked re-render (ported from spikes/roof-quote/serve.mjs) ──
// The GUARANTEED roof-only path (vs the Kontext img2img above, which can edit cars/yard):
//  1. Static-Maps SATELLITE (top-down, exact Web Mercator).
//  2. Building-footprint ring → roof MASK in the SAME pixel space (alignment by construction).
//  3. Flux Fill inpaint — only the masked (roof) pixels can be repainted.
//  4. POST-COMPOSITE the result back through the mask onto the ORIGINAL bytes → every non-roof
//     pixel is provably the original (Flux Fill bleeds outside the mask on its own ~33 meanDiff,
//     so the composite is REQUIRED, not optional).
const TD_ZOOM = 20, TD_SIZE = 640, TD_SCALE = 2; // → 1280×1280 static-map satellite

async function topDownSatellite(lat: number, lng: number): Promise<Buffer> {
  const TILES = tilesKey();
  const url =
    "https://maps.googleapis.com/maps/api/staticmap?center=" + lat + "," + lng +
    "&zoom=" + TD_ZOOM + "&size=" + TD_SIZE + "x" + TD_SIZE + "&scale=" + TD_SCALE +
    "&maptype=satellite&key=" + TILES;
  const r = await fetch(url);
  if (!r.ok) throw new Error("staticmap_" + r.status);
  return Buffer.from(await r.arrayBuffer());
}

// Flux Fill Pro inpaint via Replicate: repaint ONLY the white-mask (roof) pixels.
// guidance≈3 (a Flux guidance scale, NOT a 0-100 %); 60 washed the colour out in testing.
async function fluxFillInpaint(satBuf: Buffer, maskBuf: Buffer, material: string): Promise<Buffer> {
  const REPLICATE = replicateKey();
  if (!REPLICATE) throw new Error("no_replicate_key");
  const prompt =
    "Aerial top-down photo of a house roof. The masked roof is now covered entirely in " + material +
    ". Photorealistic shingle texture, the whole roof surface this exact colour, sharp, with shadows and lighting matching the surrounding aerial photo. Keep the exact same roof shape, ridges, hips and outline.";
  const body = {
    input: {
      image: "data:image/png;base64," + satBuf.toString("base64"),
      mask: "data:image/png;base64," + maskBuf.toString("base64"),
      prompt,
      steps: 50,
      guidance: 3,
      output_format: "png",
      safety_tolerance: 2,
    },
  };
  const rr = await fetch(
    "https://api.replicate.com/v1/models/black-forest-labs/flux-fill-pro/predictions",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" },
      body: JSON.stringify(body),
    },
  );
  let j = (await rr.json()) as {
    status?: string; error?: string; detail?: string; output?: string | string[]; urls?: { get: string };
  };
  let tries = 0;
  while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 60) {
    const pollUrl = j.urls?.get;
    if (!pollUrl) break; // error body (billing/rate-limit) or sync response w/o poll url → handled below
    await new Promise((s) => setTimeout(s, 1500));
    j = (await fetch(pollUrl, { headers: { Authorization: "Bearer " + REPLICATE } }).then((r) =>
      r.json(),
    )) as typeof j;
    tries++;
  }
  if (j.status !== "succeeded") throw new Error("flux_fill_" + (j.error || j.detail || j.status || "failed"));
  const out = Array.isArray(j.output) ? j.output[0] : j.output;
  if (!out) throw new Error("flux_fill_no_output");
  const ab = await fetch(out).then((r) => r.arrayBuffer());
  return Buffer.from(new Uint8Array(ab));
}

// STRONG top-down roof recolor via Flux-KONTEXT-pro (the same engine `aiRender`/`renderReplicate`
// uses). Flux-FILL inpaint recolours WEAKLY — it will not darken a sunlit roof, so metal/black and
// deep terracotta wash out. Kontext, run FULL-FRAME as true img2img, recolours the roof strongly and
// uniformly. We then composite ONLY the footprint-mask region of this result back onto the original
// satellite (see renderRoofOnlyTopDown step 6), so the strong colour lands INSIDE the mask and every
// off-roof pixel stays byte-identical (outsideMax==0 preserved by the mask, exactly as with Fill).
//
// Alignment: Kontext is img2img with a fixed per-image seed → it keeps the frame registered to the
// input, so the roof stays aligned to the footprint mask (which lives in the base's pixel space).
// Output is requested as PNG so compositeThroughMask (pngjs, no JPEG decoder in this build) can read
// the bytes directly. Returns a PNG Buffer aligned to `satBuf`, or throws for the Fill fallback.
async function kontextTopDownRecolor(satBuf: Buffer, material: string): Promise<Buffer> {
  const REPLICATE = replicateKey();
  if (!REPLICATE) throw new Error("no_replicate_key");
  const dataUri = "data:image/png;base64," + satBuf.toString("base64");
  const seed = houseSeed(dataUri); // fixed per-house → stable, keeps the frame registered to the base
  const prompt =
    "Edit THIS exact aerial top-down satellite photo. Recolour the ENTIRE roof of the main house in " +
    "the centre — every slope, plane and facet — fully and uniformly in " + material + ", covering the " +
    "whole roof surface. Leave NO original roof colour showing; the whole roof must read clearly as " +
    material + " even where it is sunlit. Photorealistic roofing texture with shadows and lighting " +
    "matching the aerial. Keep the IDENTICAL house, roof shape, ridges, hips and outline, and every " +
    "other pixel — walls, yard, driveway, trees, vehicles and neighbouring houses — exactly the same. " +
    "Do NOT generate a new or different house or scene; same camera angle, same framing, same lighting.";
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const rr = await fetch(
        "https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-pro/predictions",
        {
          method: "POST",
          headers: { Authorization: "Bearer " + REPLICATE, "Content-Type": "application/json", Prefer: "wait" },
          body: JSON.stringify({
            input: {
              prompt,
              input_image: dataUri,
              output_format: "png", // PNG so compositeThroughMask can read the bytes (no JPEG decoder here)
              safety_tolerance: 2,
              seed,
            },
          }),
        },
      );
      let j = (await rr.json()) as {
        status?: string; error?: string; detail?: string; output?: string | string[]; urls?: { get: string };
      };
      let tries = 0;
      while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 40) {
        const pollUrl = j.urls?.get; // main 93ce4dcb: guard the poll url so error bodies degrade cleanly
        if (!pollUrl) break;
        await new Promise((s) => setTimeout(s, 1500));
        const pr = await fetch(pollUrl, { headers: { Authorization: "Bearer " + REPLICATE } });
        j = (await pr.json()) as typeof j;
        tries++;
      }
      if (j.status !== "succeeded") throw new Error("kontext_" + (j.error || j.detail || j.status || "failed"));
      const out = Array.isArray(j.output) ? j.output[0] : j.output;
      if (!out) throw new Error("kontext_no_output");
      const ab = await fetch(out).then((r) => r.arrayBuffer());
      const buf = Buffer.from(new Uint8Array(ab));
      if (!buf.length) throw new Error("kontext_empty");
      return buf;
    } catch (e) {
      lastErr = e;
      await new Promise((s) => setTimeout(s, 1800));
    }
  }
  throw lastErr;
}

// Full roof-only render for an address+material. Throws a TYPED error the route turns into a
// graceful client signal: "no_footprint" → the client gates to the customer-photo upload path
// (presenting Street View's possibly-wrong house is a trust killer), any other error → the
// client's Kontext fallback.
async function renderRoofOnlyTopDown(
  address: string,
  material: string,
): Promise<{ buf: Buffer; base: Buffer; whiteFrac: number; footprintSource?: string; attribution?: string }> {
  // 1) geocode
  const g = await geocode(address);
  if (!("lat" in g) || typeof g.lat !== "number" || typeof g.lng !== "number") {
    throw new Error("geocode_failed");
  }
  const lat = g.lat, lng = g.lng;
  // 2) footprint ring (OSM→MS→cache) — the mask source. No ring → no roof-only guarantee → caller falls back.
  const fp = await buildingFootprint(String(lat), String(lng));
  if (!fp.ring || fp.ring.length < 3) throw new Error("no_footprint");
  // 3) satellite (cache the base per-address so material flips reuse it)
  let sat = diskGetBuf("tdsat", address);
  if (!sat) {
    sat = await topDownSatellite(lat, lng);
    diskSetBuf("tdsat", address, sat);
  }
  const W = TD_SIZE * TD_SCALE, H = TD_SIZE * TD_SCALE;
  // 4) mask (feather 4px so eave edges are covered; stays roof-only). fp.ring is [lng,lat] GeoJSON order.
  const m = buildRoofMask(fp.ring, lat, lng, TD_ZOOM, W, H, TD_SCALE, 4);
  if (!(m.whiteFrac > 0.002)) throw new Error("mask_empty:" + m.whiteFrac.toFixed(4)); // footprint off-frame → bail
  // 5) recolor. STRONG Flux-KONTEXT full-frame recolor FIRST (Flux-Fill inpaint recolours too weakly —
  //    metal/black won't darken a sunlit roof); fall back to Flux-Fill inpaint only if Kontext throws.
  //    6) composite passthrough through the footprint mask GUARANTEES every non-roof pixel == original
  //    (outsideMax==0) for BOTH engines — the strong colour lands only inside the roof mask.
  let raw: Buffer;
  try {
    raw = await kontextTopDownRecolor(sat, material);
  } catch (e) {
    log.warn("kontext top-down recolor failed, falling back to flux-fill inpaint", {
      err: (e as Error)?.message || String(e),
    });
    raw = await fluxFillInpaint(sat, m.buf, material);
  }
  const comp = compositeThroughMask(sat, raw, m.png);
  return { buf: comp.buf, base: sat, whiteFrac: m.whiteFrac, footprintSource: fp.source, attribution: fp.attribution };
}

// Route-facing result for the top-down roof-only render. `url`/`base` are BARE root-relative
// paths (no /api/roofquote prefix) — the client prepends RQ_BASE (see roof3d.html rdAiOnHouse,
// `RB+j.url`). Mirrors the spike's /airender-topdown response shape exactly.
export interface TopDownResult {
  url?: string;
  base?: string;
  footprintSource?: string;
  attribution?: string;
  whiteFrac?: number;
  roofOnly?: boolean;
  cached?: boolean;
  error?: string;
}

// Cache key shared by aiRenderTopDown + the image/base streamers.
function topDownCacheKey(address: string, material: string): string {
  return "td|" + address + "|" + material + "|v1";
}

/**
 * Top-down roof-only render entrypoint for the route layer. Returns the spike's
 * { url, base, roofOnly:true } shape on success (the client paints the composited
 * "after" + the original satellite "before"), or { error } on failure (the client
 * keeps its swatch-tint / Kontext fallbacks). Disk-cached per (address|material).
 */
export async function aiRenderTopDown(address: string, material: string): Promise<TopDownResult> {
  if (!address) return { error: "no_address" };
  const ck = topDownCacheKey(address, material);
  const cached = diskGetJSON<TopDownResult>("tdmeta", ck);
  if (cached && diskGetBuf("tdimg", ck)) return { cached: true, ...cached };
  try {
    const r = await renderRoofOnlyTopDown(address, material);
    diskSetBuf("tdimg", ck, r.buf); // composited (after) image
    diskSetBuf("tdbase", address, r.base); // original satellite (before) image — per-address
    const meta: TopDownResult = {
      url: "/airender-topdown-img?key=" + encodeURIComponent(ck),
      base: "/airender-topdown-base?address=" + encodeURIComponent(address),
      footprintSource: r.footprintSource,
      attribution: r.attribution,
      whiteFrac: r.whiteFrac,
      roofOnly: true,
    };
    diskSetJSON("tdmeta", ck, meta);
    return meta;
  } catch (e) {
    // Honest typed failure so the client can keep its fallbacks (the client special-cases
    // "no_footprint" to gate to the customer-photo upload path; any other error → Kontext).
    const msg = (e as Error)?.message || String(e);
    log.warn("airender-topdown failed (client falls back)", { err: msg });
    return { error: msg };
  }
}

// Byte readers for the top-down streaming routes (server/routes layer).
export function readTopDownImage(address: string, material: string): Buffer | null {
  return diskGetBuf("tdimg", topDownCacheKey(address, material));
}
export function readTopDownImageByKey(ck: string): Buffer | null {
  return diskGetBuf("tdimg", ck);
}
export function readTopDownBase(address: string): Buffer | null {
  return diskGetBuf("tdbase", address);
}

/**
 * Customer-photo upload render. The user uploads THEIR OWN house photo → we repaint the roof
 * material onto it. An arbitrary oblique upload has no exact roof mask, so this uses the
 * prompt-preservation Kontext chain (street-view prompt variant), NOT the hard top-down mask —
 * a documented limitation; the top-down satellite path is the roof-only-guaranteed one.
 * Returns { url } on success or { error } on failure. (Ported from spike /airender-upload.)
 */
export async function aiRenderUpload(dataUri: string, material: string): Promise<{ url?: string; provider?: string; source?: string; error?: string; tried?: string[] }> {
  if (!dataUri || !dataUri.startsWith("data:image/")) return { error: "no_image" };
  const tried: string[] = [];
  for (const [name, fn] of RENDER_CHAIN) {
    try {
      const rawUrl = await fn(dataUri, material, "", "street");
      // Re-host the (possibly ephemeral) provider url so the <img> never 404s later. The cache
      // key is the posted-image hash + material so identical re-uploads hit the byte cache.
      const ck = "upload|" + houseSeed(dataUri) + "|" + material + "|v1";
      const stable = await rehostRenderedImage(ck, rawUrl);
      return { url: stable || rawUrl, provider: name, source: "upload" };
    } catch (e) {
      tried.push(name + ":" + (e as Error).message);
      log.error("upload render fail", { provider: name, err: (e as Error).message });
    }
  }
  return { error: "all_providers_failed", tried };
}
