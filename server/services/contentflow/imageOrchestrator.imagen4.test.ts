/**
 * ContentFlow — Imagen 4 provider (Vertex AI) unit tests.
 *
 * Runnable standalone (no test-runner dep, no live GCP auth / no network):
 *   npx tsx server/services/contentflow/imageOrchestrator.imagen4.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes ** /*.test.ts). Pattern
 * matches referenceReplication.test.ts — node assert/strict.
 *
 * Coverage:
 *   1. mapDimsToImagen4Params — dimensions → nearest supported aspect
 *      ratio + 1K/2K sample size.
 *   2. callImagen4 (mocked auth + fetch) returns the orchestrator's
 *      standard ProviderResult shape: ok + Buffer from the base64
 *      prediction + per-call costUsd ($0.04 standard / $0.06 ultra).
 *   3. Photoreal requests hit imagen-4.0-ultra-generate-001; default hits
 *      imagen-4.0-generate-001 — asserted via the endpoint URL + the
 *      request's aspectRatio/sampleImageSize parameters.
 *   4. Graceful skip when project id is absent — ok:false, clear error,
 *      NO fetch performed (rotation falls through).
 *   5. Registry wiring — "imagen4" present in IMAGE_PROVIDERS and FIRST
 *      in PHOTOREAL_PROVIDER_ORDER (photoreal default until Flux 2 lands).
 */

import assert from "node:assert/strict";
import {
  callImagen4,
  mapDimsToImagen4Params,
  IMAGEN4_COST_MICRO_USD,
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
const FAKE_TOKEN = async () => "fake-vertex-token";

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

async function main() {
  console.log("imageOrchestrator.imagen4.test.ts");

  /* 1. dimension → aspect/size mapping */
  await test("mapDimsToImagen4Params: nearest aspect + 1K/2K size", () => {
    assert.deepEqual(mapDimsToImagen4Params(1024, 1024), { aspectRatio: "1:1", sampleImageSize: "1K" });
    /* 1536x1024 = 1.5 — closer to 4:3 (1.333) than 16:9 (1.778) on log
     * scale; 1536 exceeds 4:3's 1K width (1280) → 2K */
    assert.deepEqual(mapDimsToImagen4Params(1536, 1024), { aspectRatio: "4:3", sampleImageSize: "2K" });
    assert.deepEqual(mapDimsToImagen4Params(1024, 1536), { aspectRatio: "3:4", sampleImageSize: "2K" });
    assert.deepEqual(mapDimsToImagen4Params(1920, 1080), { aspectRatio: "16:9", sampleImageSize: "2K" });
    /* 720x1280 fits inside a 9:16 1K sample (768x1408) → 1K is enough */
    assert.deepEqual(mapDimsToImagen4Params(720, 1280), { aspectRatio: "9:16", sampleImageSize: "1K" });
    assert.deepEqual(mapDimsToImagen4Params(768, 1024), { aspectRatio: "3:4", sampleImageSize: "1K" });
    /* degenerate input falls back to square */
    assert.equal(mapDimsToImagen4Params(0, 0).aspectRatio, "1:1");
  });

  /* 2. standard model — mocked predict response → standard shape + cost */
  await test("callImagen4: standard model maps response → buffer + $0.04 cost", () =>
    withEnv({ GOOGLE_IMAGEN_PROJECT_ID: "test-project", GOOGLE_VEO_PROJECT_ID: undefined, GOOGLE_IMAGEN_REGION: undefined }, async () => {
      const origFetch = globalThis.fetch;
      let urlSeen = "";
      let bodySeen: any = null;
      globalThis.fetch = (async (url: any, init: any) => {
        urlSeen = String(url);
        bodySeen = JSON.parse(init?.body ?? "{}");
        return new Response(
          JSON.stringify({ predictions: [{ bytesBase64Encoded: FAKE_IMAGE.toString("base64"), mimeType: "image/png" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as any;
      try {
        const r = await callImagen4("a plumber fixing a sink", { size: "1024x1024" }, { getAccessToken: FAKE_TOKEN });
        assert.equal(r.ok, true);
        assert.ok(r.buffer && r.buffer.equals(FAKE_IMAGE), "base64 prediction decoded into Buffer");
        assert.equal(r.costUsd, IMAGEN4_COST_MICRO_USD["imagen-4.0-generate-001"] / 1_000_000);
        assert.equal(r.costUsd, 0.04, "standard = 40,000 micro-USD = $0.04");
        assert.ok(urlSeen.includes("imagen-4.0-generate-001:predict"), "standard model endpoint");
        assert.ok(urlSeen.includes("us-central1-aiplatform.googleapis.com"), "default region us-central1");
        assert.ok(urlSeen.includes("/projects/test-project/"), "project id from env");
        assert.equal(bodySeen.instances[0].prompt, "a plumber fixing a sink");
        assert.equal(bodySeen.parameters.sampleCount, 1);
        assert.equal(bodySeen.parameters.aspectRatio, "1:1");
        assert.equal(bodySeen.parameters.sampleImageSize, "1K");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 3. photoreal → ultra model + $0.06 + landscape mapping */
  await test("callImagen4: photoreal uses ultra model + $0.06 + mapped aspect", () =>
    withEnv({ GOOGLE_IMAGEN_PROJECT_ID: undefined, GOOGLE_VEO_PROJECT_ID: "veo-project" }, async () => {
      const origFetch = globalThis.fetch;
      let urlSeen = "";
      let bodySeen: any = null;
      globalThis.fetch = (async (url: any, init: any) => {
        urlSeen = String(url);
        bodySeen = JSON.parse(init?.body ?? "{}");
        return new Response(
          JSON.stringify({ predictions: [{ bytesBase64Encoded: FAKE_IMAGE.toString("base64") }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as any;
      try {
        const r = await callImagen4(
          "storefront photo",
          { photoreal: true, dimensions: { width: 1920, height: 1080 } },
          { getAccessToken: FAKE_TOKEN },
        );
        assert.equal(r.ok, true);
        assert.equal(r.costUsd, IMAGEN4_COST_MICRO_USD["imagen-4.0-ultra-generate-001"] / 1_000_000);
        assert.equal(r.costUsd, 0.06, "ultra = 60,000 micro-USD = $0.06");
        assert.ok(urlSeen.includes("imagen-4.0-ultra-generate-001:predict"), "ultra model endpoint");
        assert.ok(urlSeen.includes("/projects/veo-project/"), "falls back to GOOGLE_VEO_PROJECT_ID");
        assert.equal(bodySeen.parameters.aspectRatio, "16:9");
        assert.equal(bodySeen.parameters.sampleImageSize, "2K");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 4. graceful skip when unconfigured — no network call */
  await test("callImagen4: skips cleanly (no fetch) when project id absent", () =>
    withEnv({ GOOGLE_IMAGEN_PROJECT_ID: undefined, GOOGLE_VEO_PROJECT_ID: undefined }, async () => {
      const origFetch = globalThis.fetch;
      let fetchCalled = false;
      globalThis.fetch = (async () => {
        fetchCalled = true;
        return new Response("{}", { status: 200 });
      }) as any;
      try {
        const r = await callImagen4("anything", {});
        assert.equal(r.ok, false);
        assert.ok(r.error && r.error.includes("GOOGLE_IMAGEN_PROJECT_ID"), "clear missing-config error");
        assert.equal(fetchCalled, false, "no network call when skipped");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 4b. provider error surfaces (rotation falls through, never throws) */
  await test("callImagen4: non-200 → ok:false with status (never throws)", () =>
    withEnv({ GOOGLE_IMAGEN_PROJECT_ID: "test-project" }, async () => {
      const origFetch = globalThis.fetch;
      globalThis.fetch = (async () => new Response("quota exceeded", { status: 429 })) as any;
      try {
        const r = await callImagen4("anything", {}, { getAccessToken: FAKE_TOKEN });
        assert.equal(r.ok, false);
        assert.ok(r.error && r.error.includes("429"), "status surfaced in error");
      } finally {
        globalThis.fetch = origFetch;
      }
    }));

  /* 5. registry + photoreal-order wiring */
  await test("registry: imagen4 entry exists; FIRST in PHOTOREAL_PROVIDER_ORDER", () => {
    const entry = IMAGE_PROVIDERS.find((p) => p.id === "imagen4");
    assert.ok(entry, "imagen4 registered in IMAGE_PROVIDERS");
    assert.equal(entry!.costPerImage, 0.04);
    assert.deepEqual(entry!.envVarAnyOf, ["GOOGLE_IMAGEN_PROJECT_ID", "GOOGLE_VEO_PROJECT_ID"]);
    assert.equal(
      PHOTOREAL_PROVIDER_ORDER[0],
      "imagen4",
      "imagen4 leads photoreal rotation (default until Flux 2 lands)",
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
