/**
 * ContentFlow — FLUX.2 pro provider (fal.ai) unit tests.
 *
 * Runnable standalone (no test-runner dep, no live fal auth / no network):
 *   npx tsx server/services/contentflow/imageOrchestrator.flux2.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes ** /*.test.ts). Pattern
 * matches imageOrchestrator.imagen4.test.ts — node assert/strict.
 *
 * Coverage:
 *   1. mapDimsToFlux2Size — pass-through of custom dims, 4MP total clamp
 *      (aspect preserved), multiples of 16, degenerate-input fallback.
 *   2. computeFlux2CostUsd — MP-based pricing: 1MP=$0.03, 2MP=$0.045,
 *      4MP=$0.075; sub-1MP floors at $0.03.
 *   3. callFlux2Pro (mocked fetch) — `Authorization: Key …` header,
 *      {prompt, image_size:{width,height}, num_images:1} body, images[0].url
 *      downloaded into a Buffer, per-call costUsd from OUTPUT megapixels.
 *   4. Graceful skip when FAL_KEY absent — ok:false, clear error, NO fetch.
 *   5. 429 → ok:false with status surfaced (standard rotation fallthrough).
 *   6. Registry/order wiring — flux2_pro FIRST in PHOTOREAL_PROVIDER_ORDER
 *      (imagen4 second), LAST in IMAGE_PROVIDERS (normal rotation absorbs
 *      fallthrough only), qualityScore above imagen4's.
 *   7. Deliberate-failure fixture — a regressed cost function that ignores
 *      megapixels FAILS this suite's cost expectations (proves the guard
 *      catches the regression, not merely that it runs).
 */

import assert from "node:assert/strict";
import {
  callFlux2Pro,
  computeFlux2CostUsd,
  mapDimsToFlux2Size,
  FLUX2_BASE_COST_USD,
  FLUX2_EXTRA_MP_COST_USD,
  FLUX2_MAX_TOTAL_PIXELS,
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

/* Fake image payload >1KB so the orchestrator's too-small guard passes. */
const FAKE_IMAGE = Buffer.alloc(2048, 7);

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

/** Mock fetch that answers the fal run POST with a JSON images[] payload
 *  and the follow-up image-url GET with raw bytes. Captures what was sent. */
function mockFalFetch(imageMeta: { url: string; width?: number; height?: number }, opts?: { status?: number; bodyText?: string }) {
  const seen = { url: "", authHeader: "", contentType: "", body: null as any, imageUrlFetched: "" };
  const fetchImpl = (async (url: any, init: any) => {
    const u = String(url);
    if (u.startsWith("https://fal.run/")) {
      seen.url = u;
      seen.authHeader = init?.headers?.Authorization ?? "";
      seen.contentType = init?.headers?.["Content-Type"] ?? "";
      seen.body = JSON.parse(init?.body ?? "{}");
      if (opts?.status && opts.status !== 200) {
        return new Response(opts.bodyText ?? "error", { status: opts.status });
      }
      return new Response(
        JSON.stringify({ images: [imageMeta], prompt: seen.body?.prompt }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    seen.imageUrlFetched = u;
    return new Response(new Uint8Array(FAKE_IMAGE), { status: 200, headers: { "content-type": "image/png" } });
  }) as any;
  return { seen, fetchImpl };
}

async function main() {
  console.log("imageOrchestrator.flux2.test.ts");

  /* 1. dimension mapping — custom dims, 4MP clamp, multiples of 16 */
  await test("mapDimsToFlux2Size: pass-through, 4MP clamp, multiples of 16", () => {
    /* in-range multiples of 16 pass through untouched */
    assert.deepEqual(mapDimsToFlux2Size(1024, 1024), { width: 1024, height: 1024 });
    assert.deepEqual(mapDimsToFlux2Size(1920, 1088), { width: 1920, height: 1088 });
    /* non-multiple-of-16 floors to the grid */
    assert.deepEqual(mapDimsToFlux2Size(1000, 1000), { width: 992, height: 992 });
    /* over the 4MP cap → scaled down proportionally, still on the grid */
    const big = mapDimsToFlux2Size(4096, 4096); // 16.8MP requested
    assert.ok(big.width * big.height <= FLUX2_MAX_TOTAL_PIXELS, "total pixels ≤ 4MP");
    assert.equal(big.width % 16, 0);
    assert.equal(big.height % 16, 0);
    assert.equal(big.width, big.height, "square aspect preserved");
    /* wide ratio survives the clamp with aspect roughly preserved */
    const wide = mapDimsToFlux2Size(3840, 2160); // 8.3MP, 16:9
    assert.ok(wide.width * wide.height <= FLUX2_MAX_TOTAL_PIXELS);
    assert.ok(Math.abs(wide.width / wide.height - 16 / 9) < 0.05, "≈16:9 after clamp");
    /* extreme ratio with min-side floor still respects the cap */
    const extreme = mapDimsToFlux2Size(100_000, 100);
    assert.ok(extreme.width * extreme.height <= FLUX2_MAX_TOTAL_PIXELS, "backstop holds cap");
    assert.ok(extreme.height >= 256 && extreme.width >= 256, "min side 256");
    /* degenerate input falls back to 1024 square */
    assert.deepEqual(mapDimsToFlux2Size(0, 0), { width: 1024, height: 1024 });
  });

  /* 2. MP-based cost math */
  await test("computeFlux2CostUsd: 1MP=$0.03, 2MP=$0.045, 4MP=$0.075, sub-1MP floors", () => {
    assert.equal(computeFlux2CostUsd(1000, 1000), 0.03, "1MP = base $0.03");
    assert.equal(computeFlux2CostUsd(2000, 1000), 0.045, "2MP = $0.03 + $0.015");
    assert.equal(computeFlux2CostUsd(2000, 2000), 0.075, "4MP = $0.03 + 3×$0.015");
    assert.equal(computeFlux2CostUsd(500, 500), 0.03, "0.25MP floors at base");
    /* fractional MP prorated linearly */
    const c = computeFlux2CostUsd(1500, 1000); // 1.5MP
    assert.ok(Math.abs(c - (0.03 + 0.015 * 0.5)) < 1e-9, "1.5MP = $0.0375");
    /* constants the math is built from (registry comment contract) */
    assert.equal(FLUX2_BASE_COST_USD, 0.03);
    assert.equal(FLUX2_EXTRA_MP_COST_USD, 0.015);
  });

  /* 3. happy path — auth header, body shape, url download, output-MP cost */
  await test("callFlux2Pro: Key auth + body shape + images[0].url → buffer + output-MP cost", () =>
    withEnv({ FAL_KEY: "test-fal-key" }, async () => {
      const origFetch = globalThis.fetch;
      const { seen, fetchImpl } = mockFalFetch({ url: "https://v3.fal.media/files/abc/out.png", width: 2000, height: 1000 });
      globalThis.fetch = fetchImpl;
      try {
        const r = await callFlux2Pro("a roofer on a tile roof at golden hour", { dimensions: { width: 2048, height: 1024 } });
        assert.equal(r.ok, true);
        assert.ok(r.buffer && r.buffer.equals(FAKE_IMAGE), "image url downloaded into Buffer");
        assert.equal(seen.url, "https://fal.run/fal-ai/flux-2-pro", "direct run endpoint");
        assert.equal(seen.authHeader, "Key test-fal-key", "fal Key auth scheme (not Bearer)");
        assert.equal(seen.contentType, "application/json");
        assert.equal(seen.body.prompt, "a roofer on a tile roof at golden hour");
        assert.deepEqual(seen.body.image_size, { width: 2048, height: 1024 }, "custom dims pass through");
        assert.equal(seen.body.num_images, 1);
        assert.equal(seen.imageUrlFetched, "https://v3.fal.media/files/abc/out.png");
        /* cost from the OUTPUT dims fal reported (2000x1000 = 2MP) */
        assert.equal(r.costUsd, 0.045, "costUsd computed from response width/height");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 3b. response without dims → cost falls back to requested (mapped) dims */
  await test("callFlux2Pro: missing response dims → cost from requested mapped dims", () =>
    withEnv({ FAL_KEY: "test-fal-key" }, async () => {
      const origFetch = globalThis.fetch;
      const { fetchImpl } = mockFalFetch({ url: "https://v3.fal.media/files/abc/out2.png" });
      globalThis.fetch = fetchImpl;
      try {
        const r = await callFlux2Pro("storefront", { dimensions: { width: 1990, height: 1990 } });
        assert.equal(r.ok, true);
        /* 1990x1990 floors to 1984x1984 = 3.936MP → $0.03 + $0.015×2.936 */
        const expected = 0.03 + 0.015 * ((1984 * 1984) / 1_000_000 - 1);
        assert.ok(Math.abs((r.costUsd ?? 0) - expected) < 1e-9, "fallback cost from mapped request dims");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 4. graceful skip when unconfigured — no network call */
  await test("callFlux2Pro: skips cleanly (no fetch) when FAL_KEY absent", () =>
    withEnv({ FAL_KEY: undefined }, async () => {
      const origFetch = globalThis.fetch;
      let fetchCalled = false;
      globalThis.fetch = (async () => {
        fetchCalled = true;
        return new Response("{}", { status: 200 });
      }) as any;
      try {
        const r = await callFlux2Pro("anything", {});
        assert.equal(r.ok, false);
        assert.ok(r.error && r.error.includes("FAL_KEY"), "clear missing-config error");
        assert.equal(fetchCalled, false, "no network call when skipped");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 5. 429 → ok:false with status (standard fallthrough, never throws) */
  await test("callFlux2Pro: 429 → ok:false with status (never throws)", () =>
    withEnv({ FAL_KEY: "test-fal-key" }, async () => {
      const origFetch = globalThis.fetch;
      const { fetchImpl } = mockFalFetch({ url: "unused" }, { status: 429, bodyText: "rate limited" });
      globalThis.fetch = fetchImpl;
      try {
        const r = await callFlux2Pro("anything", {});
        assert.equal(r.ok, false);
        assert.ok(r.error && r.error.includes("429"), "status surfaced in error");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 6. registry + rotation-order wiring */
  await test("registry: flux2_pro FIRST in photoreal order, LAST in normal rotation", () => {
    const entry = IMAGE_PROVIDERS.find((p) => p.id === "flux2_pro");
    assert.ok(entry, "flux2_pro registered in IMAGE_PROVIDERS");
    assert.equal(entry!.costPerImage, 0.03, "registry base = first-MP price");
    assert.equal(entry!.envVarRequired, "FAL_KEY");
    const imagen4 = IMAGE_PROVIDERS.find((p) => p.id === "imagen4")!;
    assert.ok(entry!.qualityScore > imagen4.qualityScore, "photoreal primary outranks imagen4");
    assert.equal(PHOTOREAL_PROVIDER_ORDER[0], "flux2_pro", "flux2_pro leads photoreal rotation");
    assert.equal(PHOTOREAL_PROVIDER_ORDER[1], "imagen4", "imagen4 second (on-image-TEXT specialist)");
    assert.equal(
      IMAGE_PROVIDERS[IMAGE_PROVIDERS.length - 1].id,
      "flux2_pro",
      "LAST in normal rotation — premium absorbs fallthrough only, free tiers first",
    );
  });

  /* 7. deliberate-failure fixture — a regressed cost function that ignores
   * megapixels must FAIL the cost expectations above. This proves the
   * guard catches the regression (red), not merely that it executes. */
  await test("deliberate-failure fixture: MP-blind cost function fails the cost assertions", () => {
    const regressedCost = (_w: number, _h: number) => FLUX2_BASE_COST_USD; // ignores MP
    let caught = 0;
    try { assert.equal(regressedCost(2000, 1000), 0.045); } catch { caught++; }
    try { assert.equal(regressedCost(2000, 2000), 0.075); } catch { caught++; }
    assert.equal(caught, 2, "both multi-MP expectations went red against the regressed fixture");
    /* and the REAL function passes the same expectations */
    assert.equal(computeFlux2CostUsd(2000, 1000), 0.045);
    assert.equal(computeFlux2CostUsd(2000, 2000), 0.075);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
