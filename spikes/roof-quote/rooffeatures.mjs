// rooffeatures.mjs — Gemini-vision roof FEATURE detection (locates the things the
// Solar API does NOT enumerate: chimneys, vents, skylights, dormers + roof type).
// Standalone ES module. Never throws from the public API.
//
// node:assert is a static import (not a top-level `await import`) so the server
// bundler (esbuild → CJS) can include this module — top-level await is rejected
// for CJS output. Node-only, used only by the inline self-test; the browser
// never imports this file.
import assert from "node:assert/strict";

const GEMINI_MODEL = "gemini-2.5-flash";
const VALID_ROOF_TYPES = new Set([
  "gable", "hip", "flat", "gambrel", "complex", "unknown",
]);
const FEATURE_KEYS = ["chimneys", "vents", "skylights", "dormers"];

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested offline)
// ---------------------------------------------------------------------------

/** Empty/safe result shape. */
function emptyResult(extra = {}) {
  return {
    roofType: "unknown",
    chimneys: [],
    vents: [],
    skylights: [],
    dormers: [],
    counts: { chimneys: 0, vents: 0, skylights: 0, dormers: 0 },
    ok: false,
    ...extra,
  };
}

/** Detect mime type from a Buffer's magic bytes. Returns null if unknown. */
export function detectMimeType(buf) {
  if (!buf || buf.length < 4) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "image/png";
  }
  return null;
}

/** Clamp a value to [0,1]; returns null if not a finite number. */
function clamp01(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Normalize a raw feature array into [{nx,ny}] with clamped coords. */
function normalizeFeatureArray(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const nx = clamp01(item.nx);
    const ny = clamp01(item.ny);
    if (nx === null || ny === null) continue;
    out.push({ nx, ny });
  }
  return out;
}

/** Extract the first balanced {...} JSON object from arbitrary text. */
function extractJsonObject(text) {
  if (typeof text !== "string") return null;
  // Strip common markdown code fences first.
  let s = text.replace(/```(?:json)?/gi, "").replace(/```/g, "");
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse Gemini's raw text into the final result shape.
 * Pure + offline-testable. On any failure returns the safe empty shape (ok:false).
 */
export function parseFeatures(rawText) {
  const jsonStr = extractJsonObject(rawText);
  if (jsonStr === null) {
    return emptyResult({ error: "no JSON object found in response" });
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return emptyResult({ error: "JSON parse failed: " + e.message });
  }
  if (!parsed || typeof parsed !== "object") {
    return emptyResult({ error: "parsed value is not an object" });
  }

  let roofType = typeof parsed.roofType === "string"
    ? parsed.roofType.toLowerCase().trim()
    : "unknown";
  if (!VALID_ROOF_TYPES.has(roofType)) roofType = "unknown";

  const result = {
    roofType,
    chimneys: normalizeFeatureArray(parsed.chimneys),
    vents: normalizeFeatureArray(parsed.vents),
    skylights: normalizeFeatureArray(parsed.skylights),
    dormers: normalizeFeatureArray(parsed.dormers),
    ok: true,
  };
  result.counts = {
    chimneys: result.chimneys.length,
    vents: result.vents.length,
    skylights: result.skylights.length,
    dormers: result.dormers.length,
  };
  return result;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const PROMPT = `You are an expert roof surveyor analyzing an aerial/oblique image of houses.

Focus ONLY on the MAIN house, which is the largest house centered in the image.
IGNORE all neighbouring houses, sheds, garages detached from the main house, cars, and trees.

Tasks:
1. Classify the main house's roof type as exactly one of: gable, hip, flat, gambrel, complex, unknown.
2. Locate these roof features ON THE MAIN HOUSE ONLY:
   - chimneys (brick/metal stacks rising above the roof)
   - vents (small pipe/box roof vents, turbines, ridge vents)
   - skylights (flush glass panels set into the roof slope)
   - dormers (roofed projections with a window breaking the roof plane)

For EACH feature give its position as normalized image fractions:
nx = x / image_width, ny = y / image_height, each between 0 and 1.

Return ONLY compact minified JSON, no prose, no markdown, with EXACTLY this shape:
{"roofType":"hip","chimneys":[{"nx":0.51,"ny":0.42}],"vents":[],"skylights":[],"dormers":[]}

If a feature category is absent, use an empty array. Do not invent features.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function detectRoofFeatures(imageBuffer, geminiApiKey, opts = {}) {
  try {
    if (!Buffer.isBuffer(imageBuffer)) {
      return emptyResult({ error: "imageBuffer must be a Buffer" });
    }
    if (typeof geminiApiKey !== "string" || geminiApiKey.length === 0) {
      return emptyResult({ error: "geminiApiKey required" });
    }
    const mimeType = detectMimeType(imageBuffer);
    if (!mimeType) {
      return emptyResult({ error: "unsupported image format (expect JPEG/PNG)" });
    }

    const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 60_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=` +
      encodeURIComponent(geminiApiKey);

    const body = {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: imageBuffer.toString("base64") } },
            { text: PROMPT },
          ],
        },
      ],
    };

    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return emptyResult({ error: `HTTP ${resp.status}: ${txt.slice(0, 300)}` });
    }

    const json = await resp.json();
    const text =
      json?.candidates?.[0]?.content?.parts
        ?.map((p) => (typeof p?.text === "string" ? p.text : ""))
        .join("") ?? "";

    if (!text) {
      return emptyResult({ error: "empty response text from model" });
    }
    return parseFeatures(text);
  } catch (e) {
    const msg = e && e.name === "AbortError" ? "request timed out" : (e?.message || String(e));
    return emptyResult({ error: msg });
  }
}

// ---------------------------------------------------------------------------
// Self-test (runs on `node rooffeatures.mjs`). Offline — no API call.
// ---------------------------------------------------------------------------

function isMainModule() {
  try {
    const url = new URL(import.meta.url);
    const argv1 = process.argv[1] ? new URL("file://" + process.argv[1].replace(/\\/g, "/")).pathname : "";
    return url.pathname.toLowerCase() === argv1.toLowerCase() ||
      decodeURIComponent(url.pathname).toLowerCase().endsWith("rooffeatures.mjs");
  } catch {
    return false;
  }
}

if (isMainModule() && process.argv[1] && process.argv[1].toLowerCase().includes("rooffeatures")) {
  let passed = 0;
  let failed = 0;
  const test = (name, fn) => {
    try {
      fn();
      passed++;
    } catch (e) {
      failed++;
      console.error(`FAIL: ${name}\n      ${e.message}`);
    }
  };

  // (a) clean JSON string
  test("parses clean JSON", () => {
    const r = parseFeatures(
      '{"roofType":"hip","chimneys":[{"nx":0.5,"ny":0.4}],"vents":[{"nx":0.2,"ny":0.3}],"skylights":[],"dormers":[]}'
    );
    assert.equal(r.ok, true);
    assert.equal(r.roofType, "hip");
    assert.equal(r.chimneys.length, 1);
    assert.deepEqual(r.chimneys[0], { nx: 0.5, ny: 0.4 });
    assert.equal(r.vents.length, 1);
  });

  // (b) JSON wrapped in ```json fences
  test("parses JSON inside markdown fences", () => {
    const raw = "```json\n{\"roofType\":\"gable\",\"chimneys\":[],\"vents\":[],\"skylights\":[{\"nx\":0.1,\"ny\":0.9}],\"dormers\":[]}\n```";
    const r = parseFeatures(raw);
    assert.equal(r.ok, true);
    assert.equal(r.roofType, "gable");
    assert.equal(r.skylights.length, 1);
  });

  // (c) JSON with extra prose around it
  test("parses JSON with surrounding prose", () => {
    const raw =
      "Sure! Here is the analysis of the main house:\n" +
      '{"roofType":"flat","chimneys":[{"nx":0.6,"ny":0.5}],"vents":[],"skylights":[],"dormers":[{"nx":0.4,"ny":0.4}]}\n' +
      "Let me know if you need more detail.";
    const r = parseFeatures(raw);
    assert.equal(r.ok, true);
    assert.equal(r.roofType, "flat");
    assert.equal(r.dormers.length, 1);
  });

  // (d) out-of-range nx/ny clamps to [0,1]
  test("clamps out-of-range coordinates", () => {
    const r = parseFeatures(
      '{"roofType":"complex","chimneys":[{"nx":1.7,"ny":-0.3},{"nx":0.5,"ny":2.0}],"vents":[],"skylights":[],"dormers":[]}'
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.chimneys[0], { nx: 1, ny: 0 });
    assert.deepEqual(r.chimneys[1], { nx: 0.5, ny: 1 });
  });

  // (e) malformed text → safe empty shape ok:false
  test("malformed text returns safe empty shape", () => {
    const r = parseFeatures("the roof has a chimney but no json here");
    assert.equal(r.ok, false);
    assert.equal(r.roofType, "unknown");
    assert.deepEqual(r.chimneys, []);
    assert.deepEqual(r.counts, { chimneys: 0, vents: 0, skylights: 0, dormers: 0 });
    assert.ok(typeof r.error === "string");
  });

  // counts derive from array lengths
  test("counts derive from array lengths", () => {
    const r = parseFeatures(
      '{"roofType":"hip","chimneys":[{"nx":0.1,"ny":0.1},{"nx":0.2,"ny":0.2}],"vents":[{"nx":0.3,"ny":0.3}],"skylights":[],"dormers":[{"nx":0.4,"ny":0.4}]}'
    );
    assert.equal(r.counts.chimneys, 2);
    assert.equal(r.counts.vents, 1);
    assert.equal(r.counts.skylights, 0);
    assert.equal(r.counts.dormers, 1);
    assert.equal(r.counts.chimneys, r.chimneys.length);
  });

  // unknown roof type normalizes to "unknown"
  test("invalid roofType normalizes to unknown", () => {
    const r = parseFeatures('{"roofType":"pyramid","chimneys":[],"vents":[],"skylights":[],"dormers":[]}');
    assert.equal(r.roofType, "unknown");
    assert.equal(r.ok, true);
  });

  // entries missing nx/ny are dropped
  test("drops feature entries lacking valid coords", () => {
    const r = parseFeatures(
      '{"roofType":"hip","chimneys":[{"nx":0.5},{"foo":1},{"nx":0.2,"ny":0.2}],"vents":[],"skylights":[],"dormers":[]}'
    );
    assert.equal(r.chimneys.length, 1);
    assert.deepEqual(r.chimneys[0], { nx: 0.2, ny: 0.2 });
  });

  // mime detection: JPEG
  test("detects JPEG magic bytes", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    assert.equal(detectMimeType(buf), "image/jpeg");
  });

  // mime detection: PNG
  test("detects PNG magic bytes", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    assert.equal(detectMimeType(buf), "image/png");
  });

  // mime detection: unknown
  test("returns null for unknown magic bytes", () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    assert.equal(detectMimeType(buf), null);
  });

  // Deliberate-failure fixture: proves the parser test is real.
  // We assert that a KNOWN-GOOD parse does NOT equal a wrong expectation.
  test("deliberate-failure fixture proves test harness is real", () => {
    const r = parseFeatures('{"roofType":"hip","chimneys":[{"nx":0.5,"ny":0.4}],"vents":[],"skylights":[],"dormers":[]}');
    // This SHOULD pass: count is genuinely 1, not 99. If the parser were broken
    // (e.g. always returned empty), this assertion would fail and surface it.
    assert.notEqual(r.counts.chimneys, 99);
    assert.equal(r.counts.chimneys, 1);
    let threw = false;
    try {
      // A wrong expectation must actually throw — confirms assert is wired.
      assert.equal(r.roofType, "flat");
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "expected a wrong assertion to throw");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}
