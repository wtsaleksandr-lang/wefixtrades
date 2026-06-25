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

const log = createLogger("RoofQuote");

// ── lazy env readers ────────────────────────────────────────────────────────
const solarKey = (): string =>
  process.env.ROOFQUOTE_SOLAR_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
const replicateKey = (): string => process.env.REPLICATE_API_TOKEN || "";
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
        output?: string | string[];
        urls?: { get: string };
      };
      let tries = 0;
      while (j.status && !["succeeded", "failed", "canceled"].includes(j.status) && tries < 40) {
        await new Promise((s) => setTimeout(s, 1500));
        const pr = await fetch(j.urls!.get, { headers: { Authorization: "Bearer " + REPLICATE } });
        j = (await pr.json()) as typeof j;
        tries++;
      }
      if (j.status !== "succeeded") throw new Error("replicate_" + (j.error || j.status || "failed"));
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
const RENDER_CHAIN: Array<[string, RenderFn]> = [
  ["openai", renderOpenAI],
  ["replicate", renderReplicate],
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

export async function captureOblique(address: string): Promise<Buffer> {
  if (captureCache.has(address)) return captureCache.get(address)!;
  {
    const d = diskGetBuf("cap", address);
    if (d) {
      captureCache.set(address, d);
      return d;
    }
  }
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
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => (window as any).__roofReady === true)) break;
      await sleep(1000);
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
    captureCache.set(address, buf);
    diskSetBuf("cap", address, buf);
    return buf;
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
function scanMsftTile(srcStream: NodeJS.ReadableStream, lat: number, lng: number): Promise<LngLat[] | null> {
  return new Promise((resolve) => {
    const { mLat, mLng } = fpMetres(lat);
    let found: LngLat[] | null = null, best: LngLat[] | null = null, bestD = Infinity, done = false;
    const gun = zlib.createGunzip();
    const rl = readline.createInterface({ input: srcStream.pipe(gun), crlfDelay: Infinity });
    const finish = (val: LngLat[] | null) => {
      if (done) return; done = true;
      try { rl.close(); } catch { /* already closed */ }
      try { (srcStream as any).destroy?.(); } catch { /* best-effort */ }
      resolve(val);
    };
    srcStream.on("error", () => finish(null));
    gun.on("error", () => finish(null));
    rl.on("line", (line) => {
      if (done || !line) return;
      let f: any; try { f = JSON.parse(line); } catch { return; }
      const g = f && f.geometry; if (!g) return;
      const raw = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null;
      if (!raw || raw.length < 4) return;
      const open = fpOpenRing((raw as number[][]).map((c) => [c[0], c[1]] as LngLat));
      if (open.length < 3) return;
      if (fpRingArea(open, lat) < 8) return;
      if (fpPointInRing([lng, lat], open)) { found = open; finish(open); return; }
      const c = fpCentroid(open);
      let dEdge = Infinity; for (const p of open) { const dv = Math.hypot((p[0] - lng) * mLng, (p[1] - lat) * mLat); if (dv < dEdge) dEdge = dv; }
      const d = Math.min(Math.hypot((c[0] - lng) * mLng, (c[1] - lat) * mLat), dEdge);
      if (d < bestD) { bestD = d; best = open; }
    });
    rl.on("close", () => { if (done) return; finish(found || (best && bestD <= 60 ? best : null)); });
  });
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
  const idx = await loadMsftIndex();
  const qk = lngLatToQuadkey(lat, lng, 9);
  const url = idx[qk];
  if (!url) return null;
  const tileFile = path.join(cacheDir(), "msfttile-" + qk + ".gz");
  if (!existsSync(tileFile)) {
    const ok = await downloadMsftTile(url, tileFile);
    if (!ok) return null;
  }
  try {
    const ring = await scanMsftTile(createReadStream(tileFile), lat, lng);
    if (ring && ring.length >= 3) return ring;
  } catch {
    try { unlinkSync(tileFile); } catch { /* noop */ }
  }
  return null;
}

export interface FootprintCandidate { ring: LngLat[]; source: "osm" | "msft" | "cache"; attribution: string; }
export interface FootprintResult { ring?: LngLat[]; source: "osm" | "msft" | "cache" | "none"; attribution?: string; error?: string; candidates?: FootprintCandidate[]; }

// (fix6 latency) How long the route will WAIT for the Microsoft tile before responding with whatever
// it has (OSM). The msftFootprint promise is NOT aborted past this budget — Node keeps it running so
// its downloadMsftTile() finishes and writes the .gz to the disk tile cache in the BACKGROUND, making
// the NEXT request for that dense-metro tile instant. Dense z9 tiles (Phoenix/Denver ~100-130 MB)
// cost 15-25 s cold; that no longer stalls the caller.
const MS_FOOTPRINT_BUDGET_MS = 6500;
const OSM_FOOTPRINT_BUDGET_MS = 8000;   // overall route ceiling: even if Overpass stalls (its [timeout:25] is too long), bail at 8s → route ≤~8s
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
  const cached = diskGetJSON<{ body: FootprintResult; _t: number }>("footprint", key);
  if (cached && cached._t && Date.now() - cached._t < 30 * 864e5) return cached.body;
  // (fix4 #1) Fetch OSM AND Microsoft in PARALLEL and return EVERY candidate, so the CLIENT can register
  // each to Google's roof reference and keep the best-aligned one — instead of "first source wins", which
  // on 4521 T St took the 16.9 m-off Microsoft ring over the 0.19 m OSM ring. overpassFootprint /
  // msftFootprint each swallow their own network/parse errors (return null), so no outer .catch() is
  // needed (no-silent-catch guard). Cascade order (OSM>MS>cache) is preserved in the top-level fields.
  // (fix6) MS is TIME-BOXED via timeboxMsft so a slow cold tile can't block the response: in time → it's
  // a candidate (best-aligned selection intact); slow → respond with OSM now, MS finishes + caches in bg.
  const [osm, msft] = await Promise.all([
    timeboxResolve<LngLat[] | null>(overpassFootprint(la, ln), OSM_FOOTPRINT_BUDGET_MS, null),
    timeboxMsft(la, ln),
  ]);
  const candidates: FootprintCandidate[] = [];
  if (osm && osm.length >= 3) candidates.push({ ring: osm, source: "osm", attribution: "© OpenStreetMap contributors" });
  if (msft && msft.length >= 3) candidates.push({ ring: msft, source: "msft", attribution: "© Microsoft Building Footprints (ODbL/CDLA)" });
  if (!candidates.length) {
    const c = cacheFootprint(la, ln);
    if (c && c.length >= 3) candidates.push({ ring: c, source: "cache", attribution: "© Microsoft / national building footprints" });
  }
  // msPending: MS was still warming when the budget expired, so this set is INCOMPLETE (missing MS).
  // We DON'T persist an OSM-only set in that case — a cache hit would permanently shadow the MS tile
  // caching in the background; instead the next request re-runs, finds the warm tile, and caches then.
  const msPending = !msft;
  if (!candidates.length) return { source: "none", candidates: [] };
  const primary = candidates[0];
  const out: FootprintResult = { ring: primary.ring, source: primary.source, attribution: primary.attribution, candidates };
  // Only cache when a real source (OSM/MS) hit AND the candidate set is COMPLETE (MS not still pending).
  if (!msPending && candidates.some((c) => c.source === "osm" || c.source === "msft")) diskSetJSON("footprint", key, { body: out, _t: Date.now() });
  return out;
}

/* ─── MULTI-building footprints within a map-view bbox (Select-Your-Roof neighbour layer) ───
   Returns EVERY building polygon inside the visible map bounds so the client can draw neighbouring
   houses as selectable outlines. Mirrors spikes/roof-quote/serve.mjs buildingsInBbox. OSM (Overpass
   way[building] over the bbox) first; the Microsoft z9 tile is scanned as a cold-area fallback. Empty
   {buildings:[]} is a valid answer (the client degrades to single-building). Disk-cached by rounded bbox. */
export interface BboxBuilding { id: string; ring: LngLat[]; centroid: LngLat; area: number; source: "osm" | "msft"; }
export interface BuildingsResult { buildings: BboxBuilding[]; source: "osm" | "msft" | "none"; attribution?: string; error?: string; }
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
async function overpassBuildingsBbox(bs: number, bw: number, bn: number, be: number): Promise<BboxBuilding[] | null> {
  const body = "data=" + encodeURIComponent('[out:json][timeout:25];way["building"](' + bs + "," + bw + "," + bn + "," + be + ");out geom;");
  const headers = { "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "WeFixTrades-RoofQuote/1.0 (roof footprint lookup; contact support@wefixtrades.com)" };
  const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep, { method: "POST", headers, body });
      if (!r.ok) continue;
      const j = (await r.json()) as any;
      return ringsFromOverpassEls(j.elements, (bs + bn) / 2);
    } catch { /* try next endpoint */ }
  }
  return null;
}
function scanMsftTileBbox(srcStream: NodeJS.ReadableStream, bs: number, bw: number, bn: number, be: number): Promise<BboxBuilding[]> {
  return new Promise((resolve) => {
    const out: BboxBuilding[] = [], lat0 = (bs + bn) / 2; let done = false;
    const gun = zlib.createGunzip();
    const rl = readline.createInterface({ input: srcStream.pipe(gun), crlfDelay: Infinity });
    const finish = () => { if (done) return; done = true; try { rl.close(); } catch { /* closed */ } try { (srcStream as any).destroy?.(); } catch { /* noop */ } resolve(out); };
    srcStream.on("error", finish); gun.on("error", finish);
    rl.on("line", (line) => {
      if (done || !line) return;
      if (out.length >= 400) { finish(); return; }
      let f: any; try { f = JSON.parse(line); } catch { return; }
      const g = f && f.geometry; if (!g) return;
      const raw = g.type === "Polygon" ? g.coordinates[0] : g.type === "MultiPolygon" ? g.coordinates[0][0] : null;
      if (!raw || raw.length < 4) return;
      const open = fpOpenRing((raw as number[][]).map((c) => [c[0], c[1]] as LngLat));
      if (open.length < 3) return;
      if (fpRingArea(open, lat0) < 8) return;
      const c = fpCentroid(open);
      if (c[1] < bs || c[1] > bn || c[0] < bw || c[0] > be) return;
      out.push({ id: "msft/" + c[0].toFixed(6) + "," + c[1].toFixed(6), ring: open, centroid: c, area: fpRingArea(open, lat0), source: "msft" });
    });
    rl.on("close", finish);
  });
}
async function msftBuildingsBbox(bs: number, bw: number, bn: number, be: number): Promise<BboxBuilding[] | null> {
  const lat = (bs + bn) / 2, lng = (bw + be) / 2;
  const idx = await loadMsftIndex();
  const qk = lngLatToQuadkey(lat, lng, 9);
  const url = idx[qk];
  if (!url) return null;
  const tileFile = path.join(cacheDir(), "msfttile-" + qk + ".gz");
  if (!existsSync(tileFile)) { const ok = await downloadMsftTile(url, tileFile); if (!ok) return null; }
  try { return await scanMsftTileBbox(createReadStream(tileFile), bs, bw, bn, be); }
  catch { return null; }
}
export async function buildingsInBbox(bboxStr: string): Promise<BuildingsResult> {
  const parts = String(bboxStr || "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !isFinite(n))) return { buildings: [], source: "none", error: "bad_bbox" };
  let [bs, bw, bn, be] = bboxClamp(parts[0], parts[1], parts[2], parts[3]);
  const gk = [bs, bw, bn, be].map((n) => n.toFixed(4)).join(",");
  const cached = diskGetJSON<{ body: BuildingsResult; _t: number }>("buildings", gk);
  if (cached && cached.body && cached._t && Date.now() - cached._t < 7 * 864e5) return cached.body;
  // OSM is fast + clean where it exists; time-box it so a stalled Overpass can't hang the route.
  const osm = await timeboxResolve<BboxBuilding[] | null>(overpassBuildingsBbox(bs, bw, bn, be), OSM_FOOTPRINT_BUDGET_MS, null);
  let out: BuildingsResult;
  if (Array.isArray(osm) && osm.length) {
    out = { buildings: osm, source: "osm", attribution: "© OpenStreetMap contributors" };
  } else {
    // OSM empty / unreachable → cold-area fallback to the Microsoft tile (time-boxed; tile may warm in bg).
    const msft = await timeboxResolve<BboxBuilding[] | null>(msftBuildingsBbox(bs, bw, bn, be), MS_FOOTPRINT_BUDGET_MS, null);
    out = (Array.isArray(msft) && msft.length)
      ? { buildings: msft, source: "msft", attribution: "© Microsoft Building Footprints (ODbL/CDLA)" }
      : { buildings: [], source: "none" };
  }
  if (out.buildings.length) diskSetJSON("buildings", gk, { body: out, _t: Date.now() });
  return out;
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
