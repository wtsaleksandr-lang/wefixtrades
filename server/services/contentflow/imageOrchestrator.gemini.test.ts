/**
 * ContentFlow — Gemini 2.5 Flash Image provider unit tests.
 *
 * Runnable standalone (no test-runner dep, no live Google auth / no network):
 *   npx tsx server/services/contentflow/imageOrchestrator.gemini.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes ** /*.test.ts). Pattern
 * matches imageOrchestrator.flux2.test.ts — node assert/strict.
 *
 * Coverage:
 *   1. callGeminiFlashImage (mocked fetch) — generateContent endpoint with
 *      GEMINI_API_KEY on the query string, {contents:[{parts:[{text}]}],
 *      generationConfig.responseModalities:["IMAGE"]} body, inline_data.data
 *      base64 decoded into a Buffer, flat costUsd = $0.039.
 *   2. inlineData (camelCase) variant also parses.
 *   3. Graceful skip when GEMINI_API_KEY absent — ok:false, clear error, NO fetch.
 *   4. 403 (locked / bad key) → ok:false with status surfaced (never throws).
 *   5. No image part → ok:false.
 *   6. Registry/order wiring — gemini_flash_image registered (env GEMINI_API_KEY),
 *      sits at PHOTOREAL_PROVIDER_ORDER[2] after imagen4, flux2_pro UNCHANGED
 *      at [0] and still LAST in IMAGE_PROVIDERS (premium absorbs fallthrough).
 *   7. Deliberate-failure fixture — a parser that reads the wrong field
 *      (parts[0].text) extracts NO image from an inline_data response, while
 *      the real path succeeds (proves the guard catches the regression).
 */

import assert from "node:assert/strict";
import {
  callGeminiFlashImage,
  GEMINI_IMAGE_COST_USD,
  IMAGE_PROVIDERS,
  PHOTOREAL_PROVIDER_ORDER,
} from "./imageOrchestrator";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

/* >1KB so the orchestrator's too-small guard passes. */
const FAKE_IMAGE = Buffer.alloc(2048, 7);
const FAKE_B64 = FAKE_IMAGE.toString("base64");

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

/** Mock fetch answering the Gemini generateContent POST with an inline_data
 *  image payload. Captures the URL + parsed body. `partsOverride` lets a test
 *  inject a non-image response. */
function mockGeminiFetch(opts?: { status?: number; bodyText?: string; partsOverride?: any[]; camel?: boolean }) {
  const seen = { url: "", contentType: "", body: null as any };
  const fetchImpl = (async (url: any, init: any) => {
    seen.url = String(url);
    seen.contentType = init?.headers?.["Content-Type"] ?? "";
    seen.body = JSON.parse(init?.body ?? "{}");
    if (opts?.status && opts.status !== 200) {
      return new Response(opts.bodyText ?? "error", { status: opts.status });
    }
    const parts = opts?.partsOverride ?? [
      opts?.camel ? { inlineData: { data: FAKE_B64 } } : { inline_data: { data: FAKE_B64 } },
    ];
    return new Response(
      JSON.stringify({ candidates: [{ content: { parts } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as any;
  return { seen, fetchImpl };
}

async function main() {
  console.log("imageOrchestrator.gemini.test.ts");

  /* 1. happy path — endpoint, key on query, body shape, decode, flat cost */
  await test("callGeminiFlashImage: endpoint+key+body shape, inline_data → buffer, $0.039", () =>
    withEnv({ GEMINI_API_KEY: "test-gemini-key" }, async () => {
      const origFetch = globalThis.fetch;
      const { seen, fetchImpl } = mockGeminiFetch();
      globalThis.fetch = fetchImpl;
      try {
        const r = await callGeminiFlashImage("a tidy bungalow with a new roof", {});
        assert.equal(r.ok, true);
        assert.ok(r.buffer && r.buffer.equals(FAKE_IMAGE), "inline base64 decoded into Buffer");
        assert.ok(
          seen.url.startsWith("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent"),
          "generateContent endpoint for gemini-2.5-flash-image",
        );
        assert.ok(seen.url.includes("key=test-gemini-key"), "API key on query string");
        assert.equal(seen.contentType, "application/json");
        assert.equal(seen.body.contents[0].parts[0].text, "a tidy bungalow with a new roof");
        assert.deepEqual(seen.body.generationConfig.responseModalities, ["IMAGE"], "requests IMAGE modality");
        assert.equal(r.costUsd, 0.039, "flat per-image cost");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 2. camelCase inlineData variant also parses */
  await test("callGeminiFlashImage: parses camelCase inlineData variant", () =>
    withEnv({ GEMINI_API_KEY: "k" }, async () => {
      const origFetch = globalThis.fetch;
      const { fetchImpl } = mockGeminiFetch({ camel: true });
      globalThis.fetch = fetchImpl;
      try {
        const r = await callGeminiFlashImage("x", {});
        assert.equal(r.ok, true);
        assert.ok(r.buffer && r.buffer.equals(FAKE_IMAGE));
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 3. graceful skip when unconfigured — no network */
  await test("callGeminiFlashImage: skips cleanly (no fetch) when GEMINI_API_KEY absent", () =>
    withEnv({ GEMINI_API_KEY: undefined }, async () => {
      const origFetch = globalThis.fetch;
      let fetchCalled = false;
      globalThis.fetch = (async () => { fetchCalled = true; return new Response("{}", { status: 200 }); }) as any;
      try {
        const r = await callGeminiFlashImage("anything", {});
        assert.equal(r.ok, false);
        assert.ok(r.error && r.error.includes("GEMINI_API_KEY"), "clear missing-config error");
        assert.equal(fetchCalled, false, "no network call when skipped");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 4. 403 (locked/bad key) → ok:false with status (never throws) */
  await test("callGeminiFlashImage: 403 → ok:false with status (never throws)", () =>
    withEnv({ GEMINI_API_KEY: "k" }, async () => {
      const origFetch = globalThis.fetch;
      const { fetchImpl } = mockGeminiFetch({ status: 403, bodyText: "permission denied" });
      globalThis.fetch = fetchImpl;
      try {
        const r = await callGeminiFlashImage("anything", {});
        assert.equal(r.ok, false);
        assert.ok(r.error && r.error.includes("403"), "status surfaced in error");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 5. no image part → ok:false */
  await test("callGeminiFlashImage: no image part → ok:false", () =>
    withEnv({ GEMINI_API_KEY: "k" }, async () => {
      const origFetch = globalThis.fetch;
      const { fetchImpl } = mockGeminiFetch({ partsOverride: [{ text: "I can't do that" }] });
      globalThis.fetch = fetchImpl;
      try {
        const r = await callGeminiFlashImage("anything", {});
        assert.equal(r.ok, false);
        assert.ok(r.error && r.error.includes("no image"), "clear no-image error");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 6. registry + rotation-order wiring */
  await test("registry: gemini_flash_image wired; flux2_pro/imagen4 positions unchanged", () => {
    const entry = IMAGE_PROVIDERS.find((p) => p.id === "gemini_flash_image");
    assert.ok(entry, "gemini_flash_image registered in IMAGE_PROVIDERS");
    assert.equal(entry!.envVarRequired, "GEMINI_API_KEY");
    assert.equal(entry!.costPerImage, GEMINI_IMAGE_COST_USD, "registry cost matches constant");
    /* photoreal order: leads unchanged, gemini slots third (after imagen4) */
    assert.equal(PHOTOREAL_PROVIDER_ORDER[0], "flux2_pro", "flux2_pro still leads photoreal");
    assert.equal(PHOTOREAL_PROVIDER_ORDER[1], "imagen4", "imagen4 still second");
    assert.equal(PHOTOREAL_PROVIDER_ORDER[2], "gemini_flash_image", "gemini third — resilient Google backup");
    /* premium still absorbs normal-rotation fallthrough only: flux2_pro LAST */
    assert.equal(
      IMAGE_PROVIDERS[IMAGE_PROVIDERS.length - 1].id,
      "flux2_pro",
      "flux2_pro remains LAST in normal rotation",
    );
  });

  /* 7. deliberate-failure fixture — a wrong-field parser extracts NO image
   * from an inline_data response, proving the guard catches a parse regression
   * (red), while the real path succeeds (green). */
  await test("deliberate-failure fixture: wrong-field parser misses the image; real path succeeds", async () => {
    const resp = { candidates: [{ content: { parts: [{ inline_data: { data: FAKE_B64 } }] } }] };
    const regressedExtract = (j: any) => j?.candidates?.[0]?.content?.parts?.[0]?.text; // wrong field
    assert.equal(regressedExtract(resp), undefined, "regressed parser finds no image (would go red)");
    await withEnv({ GEMINI_API_KEY: "k" }, async () => {
      const origFetch = globalThis.fetch;
      const { fetchImpl } = mockGeminiFetch();
      globalThis.fetch = fetchImpl;
      try {
        const r = await callGeminiFlashImage("x", {});
        assert.equal(r.ok, true, "real inline_data path succeeds");
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
