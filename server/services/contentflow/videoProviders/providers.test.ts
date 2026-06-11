/**
 * ContentFlow Phase 2 — video render provider tests (WP3 guard).
 *
 * Runnable standalone (no test-runner dep, no live DB / no API key):
 *   npx tsx server/services/contentflow/videoProviders/providers.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes ** /*.test.ts). Pattern
 * matches referenceReplication.test.ts — node assert/strict, mocked fetch,
 * mocked Vertex auth (injected token getter, no google-auth-library call).
 *
 * Coverage:
 *   1. Veo submit posts the correct :predictLongRunning body (narration
 *      embedded in prompt + generateAudio, duration clamp 4|6|8, 720p
 *      default / 1080p only at 8s, aspectRatio, storageUri from bucket env)
 *      and persists the operation name as operationRef.
 *   2. Veo poll uses POST :fetchPredictOperation {operationName} and maps
 *      running / done(url|bytes) / failed.
 *   3. Op done with NO payload → failed, retryable:false.
 *   4. 429 / RESOURCE_EXHAUSTED → retryable:true; 4xx auth/validation →
 *      retryable:false (both providers, submit + poll).
 *   5. Missing env → isConfigured()=false, submit/poll fail without
 *      throwing and WITHOUT any network call.
 *   6. VIDEO_COST_OVERRIDES_JSON honored (per-clip micro-USD, keyed by
 *      provider id); malformed JSON ignored → per-second defaults.
 *   7. Kling fal-queue contract: Key auth, prompt-only text-to-video body,
 *      generate_audio:false, status→result poll; image-to-video endpoint
 *      override without an image → unconfigured (worker falls back to Veo).
 *   8. Registry: VIDEO_PROVIDER_ORDER override, graceful env-skip,
 *      pickProviderForScene inflight cap (default 4) + capability gating.
 *   9. Deliberate-failure fixture: a regressed retryability classifier
 *      that treats 429 as permanent MUST fail the same assertion the real
 *      classifier passes — proving this guard catches that regression.
 */

import assert from "node:assert/strict";
import {
  costOverrideMicroUsdPerClip,
  isRetryableHttpFailure,
  PROVIDER_HTTP_TIMEOUT_MS,
} from "./types";
import {
  createVeoProvider,
  buildVeoPrompt,
  clampVeoDurationSec,
  VEO_DEFAULT_COST_MICRO_USD_PER_SEC,
} from "./veo";
import {
  createKlingProvider,
  clampKlingDurationSec,
  isImageRequiredEndpoint,
  KLING_DEFAULT_ENDPOINT,
  KLING_DEFAULT_COST_MICRO_USD_PER_SEC,
} from "./kling";
import {
  DEFAULT_MAX_INFLIGHT_PER_PROVIDER,
  getConfiguredProviders,
  getProviderOrder,
  maxInflightPerProvider,
  pickProviderForScene,
} from "./index";

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

/* ─── Env sandbox ──────────────────────────────────────────────────── */

const ENV_KEYS = [
  "GOOGLE_IMAGEN_PROJECT_ID",
  "GOOGLE_VEO_PROJECT_ID",
  "GOOGLE_APPLICATION_CREDENTIALS_JSON",
  "VEO_MODEL_ID",
  "VEO_RESOLUTION",
  "GOOGLE_VIDEO_GCS_BUCKET",
  "FAL_KEY",
  "KLING_FAL_ENDPOINT",
  "VIDEO_PROVIDER_ORDER",
  "VIDEO_MAX_INFLIGHT_PER_PROVIDER",
  "VIDEO_COST_OVERRIDES_JSON",
] as const;

function setEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
}

/* ─── fetch mock ───────────────────────────────────────────────────── */

interface MockCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
}

interface MockReply {
  status?: number;
  json?: unknown;
  text?: string;
}

const realFetch = globalThis.fetch;

function mockFetch(handler: (call: MockCall) => MockReply): MockCall[] {
  const calls: MockCall[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawHeaders)) headers[k.toLowerCase()] = String(v);
    let body: any = null;
    if (typeof init?.body === "string" && init.body.length > 0) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call: MockCall = { url, method: init?.method ?? "GET", headers, body };
    calls.push(call);
    const reply = handler(call);
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply.json ?? {},
      text: async () => reply.text ?? JSON.stringify(reply.json ?? {}),
    } as unknown as Response;
  }) as typeof fetch;
  return calls;
}

function restoreFetch(): void {
  globalThis.fetch = realFetch;
}

const fixedToken = async () => "test-token";

const VEO_ENV = {
  GOOGLE_IMAGEN_PROJECT_ID: "test-proj",
} as const;

const OP_NAME =
  "projects/test-proj/locations/us-central1/publishers/google/models/veo-3.1-generate-preview/operations/op-123";

/* ─── Main ─────────────────────────────────────────────────────────── */

async function main() {
  console.log("videoProviders/providers.test.ts");

  /* ── 1. Veo submit body ─────────────────────────────────────────── */

  await test("veo submit posts correct predictLongRunning body (narration + audio + storageUri)", async () => {
    setEnv({ ...VEO_ENV, GOOGLE_VIDEO_GCS_BUCKET: "gs://test-bucket/" });
    const calls = mockFetch(() => ({ json: { name: OP_NAME } }));
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    const result = await veo.submit({
      prompt: "A plumber repairs a copper pipe under a sink",
      durationSec: 5,
      aspectRatio: "9:16",
      narration: "Call WeFix Plumbing today",
      requestId: "req-1",
    });
    assert.equal(result.status, "submitted");
    assert.equal((result as any).operationRef, OP_NAME);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.method, "POST");
    assert.ok(
      call.url ===
        "https://us-central1-aiplatform.googleapis.com/v1/projects/test-proj/locations/us-central1/publishers/google/models/veo-3.1-generate-preview:predictLongRunning",
      `unexpected url: ${call.url}`,
    );
    assert.equal(call.headers["authorization"], "Bearer test-token");
    const prompt: string = call.body.instances[0].prompt;
    assert.ok(prompt.includes("A plumber repairs a copper pipe"), "scene prompt missing");
    assert.ok(prompt.includes("Call WeFix Plumbing today"), "narration not embedded in prompt");
    const params = call.body.parameters;
    assert.equal(params.sampleCount, 1);
    assert.equal(params.durationSeconds, 6, "5s should clamp UP to 6 (allowed: 4|6|8)");
    assert.equal(params.resolution, "720p");
    assert.equal(params.aspectRatio, "9:16");
    assert.equal(params.generateAudio, true, "narration present → generateAudio true");
    assert.ok(
      String(params.storageUri).startsWith("gs://test-bucket/contentflow/veo/req-1/"),
      `storageUri should target the configured bucket, got ${params.storageUri}`,
    );
    restoreFetch();
  });

  await test("veo submit without narration → generateAudio false, no storageUri when bucket unset", async () => {
    setEnv({ ...VEO_ENV });
    const calls = mockFetch(() => ({ json: { name: OP_NAME } }));
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    const result = await veo.submit({
      prompt: "Sparks fly as an electrician wires a panel",
      durationSec: 8,
      aspectRatio: "16:9",
      requestId: "req-2",
    });
    assert.equal(result.status, "submitted");
    const params = calls[0].body.parameters;
    assert.equal(params.generateAudio, false);
    assert.equal(params.durationSeconds, 8);
    assert.equal("storageUri" in params, false, "no bucket env → no storageUri");
    assert.equal(calls[0].body.instances[0].prompt, "Sparks fly as an electrician wires a panel");
    restoreFetch();
  });

  await test("veo 1080p only honored at 8s; VEO_MODEL_ID override respected", async () => {
    setEnv({ ...VEO_ENV, VEO_RESOLUTION: "1080p", VEO_MODEL_ID: "veo-3.1-generate-001" });
    const calls = mockFetch(() => ({ json: { name: OP_NAME } }));
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    await veo.submit({ prompt: "p", durationSec: 8, aspectRatio: "16:9", requestId: "r" });
    await veo.submit({ prompt: "p", durationSec: 6, aspectRatio: "16:9", requestId: "r" });
    assert.equal(calls[0].body.parameters.resolution, "1080p");
    assert.equal(calls[1].body.parameters.resolution, "720p", "1080p requires 8s clips");
    assert.ok(calls[0].url.includes("/models/veo-3.1-generate-001:predictLongRunning"));
    restoreFetch();
  });

  await test("veo duration clamp: 4|6|8 only, rounding UP so narration fits", () => {
    assert.equal(clampVeoDurationSec(3), 4);
    assert.equal(clampVeoDurationSec(4), 4);
    assert.equal(clampVeoDurationSec(5), 6);
    assert.equal(clampVeoDurationSec(6), 6);
    assert.equal(clampVeoDurationSec(7), 8);
    assert.equal(clampVeoDurationSec(8), 8);
    assert.equal(clampVeoDurationSec(12), 8);
    assert.equal(buildVeoPrompt("scene", null), "scene");
    assert.ok(buildVeoPrompt("scene", "hello").includes('"hello"'));
  });

  /* ── 2. Veo poll ────────────────────────────────────────────────── */

  await test("veo poll POSTs :fetchPredictOperation with operationName; not-done → running", async () => {
    setEnv({ ...VEO_ENV });
    const calls = mockFetch(() => ({ json: { name: OP_NAME } }));
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    const result = await veo.poll(OP_NAME);
    assert.deepEqual(result, { status: "running" });
    const call = calls[0];
    assert.equal(call.method, "POST", "Vertex Veo poll is POST :fetchPredictOperation, not GET");
    assert.ok(call.url.endsWith(":fetchPredictOperation"), `unexpected poll url: ${call.url}`);
    assert.equal(call.body.operationName, OP_NAME);
    restoreFetch();
  });

  await test("veo poll done → videoUrl from gcsUri; bytesBase64Encoded → Buffer", async () => {
    setEnv({ ...VEO_ENV });
    let reply: MockReply = {
      json: { name: OP_NAME, done: true, response: { videos: [{ gcsUri: "gs://b/clip.mp4" }] } },
    };
    mockFetch(() => reply);
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    const done = await veo.poll(OP_NAME);
    assert.equal(done.status, "done");
    assert.equal((done as any).videoUrl, "gs://b/clip.mp4");

    const bytes = Buffer.from("fake-mp4-bytes");
    reply = {
      json: {
        name: OP_NAME,
        done: true,
        response: { videos: [{ bytesBase64Encoded: bytes.toString("base64") }] },
      },
    };
    const doneBytes = await veo.poll(OP_NAME);
    assert.equal(doneBytes.status, "done");
    assert.ok(Buffer.isBuffer((doneBytes as any).videoBytes));
    assert.equal((doneBytes as any).videoBytes.toString(), "fake-mp4-bytes");
    restoreFetch();
  });

  /* ── 3. Done with no payload → permanent failure ────────────────── */

  await test("veo op done with NO payload → failed, retryable:false", async () => {
    setEnv({ ...VEO_ENV });
    mockFetch(() => ({
      json: { name: OP_NAME, done: true, response: { raiMediaFilteredCount: 1, videos: [] } },
    }));
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    const result = await veo.poll(OP_NAME);
    assert.equal(result.status, "failed");
    assert.equal((result as any).retryable, false, "re-polling a finished op can never succeed");
    restoreFetch();
  });

  /* ── 4. Retryability classification ─────────────────────────────── */

  await test("429 → retryable:true; 400/401 → retryable:false (veo submit + poll)", async () => {
    setEnv({ ...VEO_ENV });
    let status = 429;
    mockFetch(() => ({ status, text: "rate limited" }));
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    const req = { prompt: "p", durationSec: 4, aspectRatio: "16:9" as const, requestId: "r" };

    const throttledSubmit = await veo.submit(req);
    assert.equal(throttledSubmit.status, "failed");
    assert.equal((throttledSubmit as any).retryable, true, "429 submit must be retryable");
    const throttledPoll = await veo.poll(OP_NAME);
    assert.equal(throttledPoll.status, "failed");
    assert.equal((throttledPoll as any).retryable, true, "429 poll must be retryable");

    status = 400;
    const badSubmit = await veo.submit(req);
    assert.equal((badSubmit as any).retryable, false, "validation 400 must be permanent");
    status = 401;
    const badPoll = await veo.poll(OP_NAME);
    assert.equal((badPoll as any).retryable, false, "auth 401 must be permanent");
    restoreFetch();
  });

  await test("veo op-level RESOURCE_EXHAUSTED error → retryable:true; op-level INVALID_ARGUMENT → false", async () => {
    setEnv({ ...VEO_ENV });
    let reply: MockReply = {
      json: { name: OP_NAME, done: true, error: { code: 8, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } },
    };
    mockFetch(() => reply);
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    const exhausted = await veo.poll(OP_NAME);
    assert.equal(exhausted.status, "failed");
    assert.equal((exhausted as any).retryable, true);

    reply = {
      json: { name: OP_NAME, done: true, error: { code: 3, status: "INVALID_ARGUMENT", message: "bad prompt" } },
    };
    const invalid = await veo.poll(OP_NAME);
    assert.equal((invalid as any).retryable, false);
    restoreFetch();
  });

  /* ── 5. Missing env → unconfigured, no throw, no network ────────── */

  await test("missing env → isConfigured false; submit/poll fail w/o throwing or fetching", async () => {
    setEnv({});
    const calls = mockFetch(() => ({ json: {} }));
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    const kling = createKlingProvider();
    assert.equal(veo.isConfigured(), false);
    assert.equal(kling.isConfigured(), false);
    assert.ok(veo.configurationGap?.()?.includes("GOOGLE_IMAGEN_PROJECT_ID"));
    assert.ok(kling.configurationGap?.()?.includes("FAL_KEY"));

    const veoSubmit = await veo.submit({ prompt: "p", durationSec: 4, aspectRatio: "16:9", requestId: "r" });
    assert.equal(veoSubmit.status, "failed");
    assert.equal((veoSubmit as any).retryable, false);
    const klingPoll = await kling.poll("abc");
    assert.equal(klingPoll.status, "failed");
    assert.equal((klingPoll as any).retryable, false);
    assert.equal(calls.length, 0, "unconfigured providers must not hit the network");
    assert.equal(getConfiguredProviders().length, 0);
    restoreFetch();
  });

  /* ── 6. Cost overrides ──────────────────────────────────────────── */

  await test("cost defaults: veo $0.40/s, kling $0.084/s (micro-USD per clip)", () => {
    setEnv({ ...VEO_ENV, FAL_KEY: "fk" });
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    const kling = createKlingProvider();
    assert.equal(veo.costMicroUsdPerClip(6), 6 * VEO_DEFAULT_COST_MICRO_USD_PER_SEC);
    assert.equal(veo.costMicroUsdPerClip(5), 6 * VEO_DEFAULT_COST_MICRO_USD_PER_SEC, "cost follows clamped duration");
    assert.equal(kling.costMicroUsdPerClip(5), 5 * KLING_DEFAULT_COST_MICRO_USD_PER_SEC);
    assert.equal(veo.costMicroUsdPerClip(6), 2_400_000, "$2.40 for a 6s quality clip");
    assert.equal(kling.costMicroUsdPerClip(5), 420_000, "$0.42 for a 5s silent clip");
  });

  await test("VIDEO_COST_OVERRIDES_JSON honored per provider id; malformed JSON ignored", () => {
    setEnv({
      ...VEO_ENV,
      FAL_KEY: "fk",
      VIDEO_COST_OVERRIDES_JSON: '{"veo_31": 1234567}',
    });
    const veo = createVeoProvider({ getAccessToken: fixedToken });
    const kling = createKlingProvider();
    assert.equal(veo.costMicroUsdPerClip(4), 1_234_567, "override is flat per clip");
    assert.equal(veo.costMicroUsdPerClip(8), 1_234_567, "override ignores duration");
    assert.equal(kling.costMicroUsdPerClip(5), 420_000, "non-overridden provider keeps default");
    assert.equal(costOverrideMicroUsdPerClip("kling_30"), null);

    process.env.VIDEO_COST_OVERRIDES_JSON = "{not json";
    assert.equal(costOverrideMicroUsdPerClip("veo_31"), null, "malformed JSON must not throw");
    assert.equal(veo.costMicroUsdPerClip(4), 4 * VEO_DEFAULT_COST_MICRO_USD_PER_SEC);

    process.env.VIDEO_COST_OVERRIDES_JSON = '{"veo_31": -5}';
    assert.equal(costOverrideMicroUsdPerClip("veo_31"), null, "negative override ignored");
  });

  /* ── 7. Kling fal queue contract ────────────────────────────────── */

  await test("kling submit posts prompt-only t2v body with Key auth + generate_audio:false", async () => {
    setEnv({ FAL_KEY: "fk-123" });
    const calls = mockFetch(() => ({
      json: {
        request_id: "fal-req-1",
        status_url: "https://queue.fal.run/fal-ai/kling-video/requests/fal-req-1/status",
        response_url: "https://queue.fal.run/fal-ai/kling-video/requests/fal-req-1",
      },
    }));
    const kling = createKlingProvider();
    assert.equal(kling.isConfigured(), true);
    const result = await kling.submit({
      prompt: "A roofer nails shingles at golden hour",
      durationSec: 6,
      aspectRatio: "9:16",
      narration: "ignored — kling has no native narration",
      requestId: "req-9",
    });
    assert.equal(result.status, "submitted");
    const call = calls[0];
    assert.equal(call.url, KLING_DEFAULT_ENDPOINT);
    assert.ok(call.url.includes("text-to-video"), "default endpoint must be the prompt-only t2v variant");
    assert.equal(call.headers["authorization"], "Key fk-123");
    assert.equal(call.body.prompt, "A roofer nails shingles at golden hour");
    assert.equal(call.body.duration, "6", "fal duration is a string enum");
    assert.equal(call.body.aspect_ratio, "9:16");
    assert.equal(call.body.generate_audio, false, "fal defaults audio ON ($0.126/s) — must be disabled");
    assert.equal("start_image_url" in call.body, false);
    const ref = JSON.parse((result as any).operationRef);
    assert.equal(ref.requestId, "fal-req-1");
    assert.ok(ref.statusUrl.endsWith("/status"));
    restoreFetch();
  });

  await test("kling poll: IN_PROGRESS → running; COMPLETED → result fetch → videoUrl", async () => {
    setEnv({ FAL_KEY: "fk-123" });
    const ref = JSON.stringify({
      requestId: "fal-req-1",
      statusUrl: "https://queue.fal.run/fal-ai/kling-video/requests/fal-req-1/status",
      responseUrl: "https://queue.fal.run/fal-ai/kling-video/requests/fal-req-1",
    });
    let queueStatus = "IN_PROGRESS";
    const calls = mockFetch((call) =>
      call.url.endsWith("/status")
        ? { json: { status: queueStatus } }
        : { json: { video: { url: "https://fal.media/files/clip.mp4" } } },
    );
    const kling = createKlingProvider();
    assert.deepEqual(await kling.poll(ref), { status: "running" });
    queueStatus = "IN_QUEUE";
    assert.deepEqual(await kling.poll(ref), { status: "running" });
    queueStatus = "COMPLETED";
    const done = await kling.poll(ref);
    assert.equal(done.status, "done");
    assert.equal((done as any).videoUrl, "https://fal.media/files/clip.mp4");
    assert.equal(calls.filter((c) => !c.url.endsWith("/status")).length, 1, "result fetched only on COMPLETED");
    restoreFetch();
  });

  await test("kling 429 → retryable:true; completed-no-payload → permanent; bare-ref fallback works", async () => {
    setEnv({ FAL_KEY: "fk-123" });
    let mode: "throttle" | "empty" = "throttle";
    mockFetch((call) => {
      if (mode === "throttle") return { status: 429, text: "too many requests" };
      return call.url.endsWith("/status") ? { json: { status: "COMPLETED" } } : { json: {} };
    });
    const kling = createKlingProvider();
    /* bare request id (no JSON ref) must derive fal queue URLs. */
    const throttled = await kling.poll("fal-req-2");
    assert.equal(throttled.status, "failed");
    assert.equal((throttled as any).retryable, true);
    mode = "empty";
    const empty = await kling.poll("fal-req-2");
    assert.equal(empty.status, "failed");
    assert.equal((empty as any).retryable, false, "completed-but-empty can never succeed on retry");
    restoreFetch();
  });

  await test("kling i2v endpoint override without an image → unconfigured + permanent submit failure", async () => {
    setEnv({
      FAL_KEY: "fk-123",
      KLING_FAL_ENDPOINT: "fal-ai/kling-video/v3/standard/image-to-video",
    });
    const calls = mockFetch(() => ({ json: { request_id: "x" } }));
    const kling = createKlingProvider();
    assert.equal(isImageRequiredEndpoint("https://queue.fal.run/fal-ai/kling-video/v3/standard/image-to-video"), true);
    assert.equal(isImageRequiredEndpoint(KLING_DEFAULT_ENDPOINT), false);
    assert.equal(kling.isConfigured(), false, "i2v endpoint + no first-frame image → not usable");
    assert.ok(kling.configurationGap?.()?.includes("image-to-video"));
    const result = await kling.submit({ prompt: "p", durationSec: 5, aspectRatio: "16:9", requestId: "r" });
    assert.equal(result.status, "failed");
    assert.equal((result as any).retryable, false);
    assert.equal(calls.length, 0);

    /* With a first-frame image the i2v endpoint IS usable via submit. */
    const withImage = await kling.submit({
      prompt: "p",
      durationSec: 5,
      aspectRatio: "16:9",
      requestId: "r",
      imageUrl: "https://example.com/frame.jpg",
    });
    assert.equal(withImage.status, "submitted");
    assert.equal(calls[0].body.start_image_url, "https://example.com/frame.jpg");
    assert.equal("aspect_ratio" in calls[0].body, false, "i2v schema has no aspect_ratio — image drives it");
    restoreFetch();
  });

  await test("kling duration clamps to fal 3-15s enum", () => {
    assert.equal(clampKlingDurationSec(1), 3);
    assert.equal(clampKlingDurationSec(4.4), 4);
    assert.equal(clampKlingDurationSec(8), 8);
    assert.equal(clampKlingDurationSec(20), 15);
  });

  /* ── 8. Registry: order, env-skip, inflight caps ────────────────── */

  await test("default order [veo_31, kling_30]; VIDEO_PROVIDER_ORDER reorders; unknown ids dropped", () => {
    setEnv({ ...VEO_ENV, FAL_KEY: "fk" });
    assert.deepEqual(getProviderOrder(), ["veo_31", "kling_30"]);
    assert.deepEqual(getConfiguredProviders().map((p) => p.id), ["veo_31", "kling_30"]);

    process.env.VIDEO_PROVIDER_ORDER = "kling_30,veo_31";
    assert.deepEqual(getConfiguredProviders().map((p) => p.id), ["kling_30", "veo_31"]);

    process.env.VIDEO_PROVIDER_ORDER = "sora_99, kling_30";
    assert.deepEqual(getProviderOrder(), ["kling_30"], "unknown ids dropped, valid ones kept");

    process.env.VIDEO_PROVIDER_ORDER = "sora_99";
    assert.deepEqual(getProviderOrder(), ["veo_31", "kling_30"], "all-invalid override → default order");
  });

  await test("getConfiguredProviders skips unconfigured providers gracefully", () => {
    setEnv({ FAL_KEY: "fk" }); // no Google project → veo skipped
    assert.deepEqual(getConfiguredProviders().map((p) => p.id), ["kling_30"]);
    setEnv({ ...VEO_ENV }); // no FAL_KEY → kling skipped
    assert.deepEqual(getConfiguredProviders().map((p) => p.id), ["veo_31"]);
  });

  await test("pickProviderForScene honors inflight cap (default 4) + capability gating", () => {
    setEnv({ ...VEO_ENV, FAL_KEY: "fk" });
    assert.equal(maxInflightPerProvider(), DEFAULT_MAX_INFLIGHT_PER_PROVIDER);
    const scene = { durationSec: 6, aspectRatio: "16:9" as const };

    assert.equal(pickProviderForScene(scene, {})?.id, "veo_31", "headroom everywhere → first in order");
    assert.equal(pickProviderForScene(scene, { veo_31: 4 })?.id, "kling_30", "veo at default cap → kling");
    assert.equal(pickProviderForScene(scene, { veo_31: 4, kling_30: 4 }), null, "all capped → null");

    process.env.VIDEO_MAX_INFLIGHT_PER_PROVIDER = "2";
    assert.equal(maxInflightPerProvider(), 2);
    assert.equal(pickProviderForScene(scene, { veo_31: 2 })?.id, "kling_30");
    assert.equal(pickProviderForScene(scene, { veo_31: 1 })?.id, "veo_31");
    assert.equal(pickProviderForScene(scene, { veo_31: 1 }, 1)?.id, "kling_30", "explicit cap override wins");

    process.env.VIDEO_MAX_INFLIGHT_PER_PROVIDER = "zero"; // invalid → default
    assert.equal(maxInflightPerProvider(), DEFAULT_MAX_INFLIGHT_PER_PROVIDER);

    /* capability gating: veo cannot do 1:1 → kling picked */
    assert.equal(pickProviderForScene({ durationSec: 6, aspectRatio: "1:1" }, {})?.id, "kling_30");
    /* clip too long for veo (8s max) → kling (15s max) */
    assert.equal(pickProviderForScene({ durationSec: 12, aspectRatio: "16:9" }, {})?.id, "kling_30");
    /* longer than every provider → null */
    assert.equal(pickProviderForScene({ durationSec: 20, aspectRatio: "16:9" }, {}), null);
  });

  /* ── 9. Deliberate-failure fixture ──────────────────────────────── */

  await test("DELIBERATE-FAILURE FIXTURE: regressed classifier treating 429 as permanent fails red", () => {
    /* The exact contract the worker depends on: 429/RESOURCE_EXHAUSTED is
     * transient (scene goes back to planned w/ backoff), validation 4xx is
     * permanent. A regression here would silently kill scenes on rate
     * limits — this assertion block is what catches it. */
    const assertRetryContract = (classify: (status: number, body?: string) => boolean) => {
      assert.equal(classify(429), true, "429 must be retryable");
      assert.equal(classify(500, ""), true, "5xx must be retryable");
      assert.equal(classify(403, "RESOURCE_EXHAUSTED: quota"), true, "RESOURCE_EXHAUSTED must be retryable");
      assert.equal(classify(400), false, "validation 400 must be permanent");
      assert.equal(classify(401), false, "auth 401 must be permanent");
    };

    /* Real classifier passes the contract. */
    assertRetryContract(isRetryableHttpFailure);

    /* Regressed fixture — a poll that treats 429 as permanent — MUST fail
     * the same contract (proves the guard catches the regression). */
    const regressedClassifier = (status: number, _body?: string): boolean => {
      if (status >= 500) return true;
      return false; // BUG: 429 + RESOURCE_EXHAUSTED treated as permanent
    };
    assert.throws(
      () => assertRetryContract(regressedClassifier),
      /429 must be retryable/,
      "the contract assertions must catch a 429-as-permanent regression",
    );
  });

  await test("HTTP timeout ceiling is 15s (design risk #3: Replit restarts vs long ops)", () => {
    assert.equal(PROVIDER_HTTP_TIMEOUT_MS, 15_000);
  });

  /* ── Summary ───────────────────────────────────────────────────── */

  setEnv({});
  restoreFetch();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
