/**
 * ContentFlow — reference-replication describe→generate flow tests.
 *
 * Runnable standalone (no test-runner dep, no live DB / no API key):
 *   npx tsx server/services/contentflow/referenceReplication.test.ts
 *
 * Excluded from `tsc --noEmit` (tsconfig excludes ** /*.test.ts). Pattern
 * matches server/jobs/contentflowMonthlyDigest.test.ts — node assert/strict.
 *
 * Coverage:
 *   1. moderatePromptText length/empty/denylist gate
 *   2. buildPhotorealPrompt augments + is idempotent
 *   3. extractOgImageUrl pulls og:image / twitter:image, resolves relative
 *   4. resolveReferenceImage handles uploaded bytes + image URL + page→og
 *      (fetch mocked) and returns bytes + media type + source
 *   5. parseStyleDescription tolerates JSON and non-JSON model output
 *   6. describeReferenceAndComposePrompt: the MOCKED vision style description
 *      PROPAGATES into the composed generate prompt, brand + extra
 *      instructions are layered in, and photoreal augmentation is applied —
 *      proving the described style reaches the generate request.
 *   7. A simulated downstream generate using the composed prompt persists
 *      with cost tracked (mocked orchestrator + persist), asserting the
 *      described style is what the image call received.
 */

import assert from "node:assert/strict";
import {
  moderatePromptText,
  buildPhotorealPrompt,
  PHOTOREAL_POSITIVE_SUFFIX,
  extractOgImageUrl,
  resolveReferenceImage,
  parseStyleDescription,
  describeReferenceAndComposePrompt,
  type VisionDescriber,
} from "./referenceReplication";

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

/* A 1x1 PNG, base64-decoded, as fake reference bytes. */
const FAKE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAADyJXupAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
  "base64",
);

/* Mock vision describer — returns a deterministic structured style we can
 * assert propagates downstream. No API key needed. */
const MOCK_STYLE = {
  description:
    "warm golden-hour photograph of a tradesperson, shallow depth of field, navy and orange palette",
  subject: "tradesperson at work",
  layout: "subject left-third, tools foreground",
  palette: "navy blue and warm orange",
  lighting: "golden hour, soft directional",
  composition: "rule-of-thirds, shallow DOF",
  style: "photographic, editorial finish",
};
const mockDescriber: VisionDescriber = {
  async describe() {
    return MOCK_STYLE;
  },
};

async function main() {
  console.log("referenceReplication.test.ts");

  /* 1. moderation gate */
  await test("moderatePromptText: empty/long/denylist rejected, normal passes", () => {
    assert.equal(moderatePromptText("").ok, false);
    assert.equal(moderatePromptText("   ").ok, false);
    assert.equal(moderatePromptText(123 as any).ok, false);
    assert.equal(moderatePromptText("x".repeat(8001)).ok, false);
    assert.equal(moderatePromptText("a clean professional plumber photo").ok, true);
  });

  /* 2. photoreal augmentation */
  await test("buildPhotorealPrompt: augments and is idempotent", () => {
    const p1 = buildPhotorealPrompt("a plumber fixing a sink");
    assert.ok(p1.includes(PHOTOREAL_POSITIVE_SUFFIX), "photoreal suffix injected");
    assert.ok(/avoid:/i.test(p1), "negative-prompt clause present");
    const p2 = buildPhotorealPrompt(p1);
    assert.equal(p1, p2, "idempotent — does not double-append");
  });

  /* 3. og:image extraction */
  await test("extractOgImageUrl: og:image + twitter:image + relative resolve", () => {
    const og = extractOgImageUrl(
      `<meta property="og:image" content="https://cdn.example.com/a.jpg">`,
      "https://example.com/page",
    );
    assert.equal(og, "https://cdn.example.com/a.jpg");
    const rel = extractOgImageUrl(
      `<meta name="twitter:image" content="/img/hero.png">`,
      "https://example.com/page",
    );
    assert.equal(rel, "https://example.com/img/hero.png");
    assert.equal(extractOgImageUrl("<html>no image meta</html>", "https://example.com"), null);
  });

  /* 4. resolveReferenceImage — uploaded bytes (no fetch needed) */
  await test("resolveReferenceImage: uploaded bytes pass through", async () => {
    const r = await resolveReferenceImage({ uploadedBytes: FAKE_PNG, uploadedMediaType: "image/png" });
    assert.equal(r.ok, true);
    assert.equal(r.source, "upload");
    assert.equal(r.mediaType, "image/png");
    assert.ok(r.bytes && r.bytes.length > 0);
  });

  /* 4b. resolveReferenceImage — direct image URL (fetch mocked) */
  await test("resolveReferenceImage: direct image URL → bytes", async () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(FAKE_PNG, { status: 200, headers: { "content-type": "image/png" } })) as any;
    try {
      const r = await resolveReferenceImage({ url: "https://cdn.example.com/hero.png" });
      assert.equal(r.ok, true);
      assert.equal(r.source, "image_url");
      assert.equal(r.mediaType, "image/png");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  /* 4c. resolveReferenceImage — web page → og:image (two mocked fetches) */
  await test("resolveReferenceImage: web page → og:image → bytes", async () => {
    const origFetch = globalThis.fetch;
    let call = 0;
    globalThis.fetch = (async () => {
      call++;
      if (call === 1) {
        return new Response(
          `<html><head><meta property="og:image" content="https://cdn.example.com/og.jpg"></head></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response(FAKE_PNG, { status: 200, headers: { "content-type": "image/jpeg" } });
    }) as any;
    try {
      const r = await resolveReferenceImage({ url: "https://example.com/landing" });
      assert.equal(r.ok, true);
      assert.equal(r.source, "page_og_image");
      assert.equal(r.mediaType, "image/jpeg");
      assert.equal(call, 2, "fetched the page then the og:image");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  /* 5. parseStyleDescription tolerance */
  await test("parseStyleDescription: JSON + non-JSON both yield a description", () => {
    const j = parseStyleDescription('{"description":"a cinematic shot","palette":"teal/orange"}');
    assert.equal(j.description, "a cinematic shot");
    assert.equal(j.palette, "teal/orange");
    const wrapped = parseStyleDescription('Here you go:\n{"subject":"a van","layout":"centered"}\nthanks');
    assert.ok(wrapped.description.includes("a van"));
    const raw = parseStyleDescription("just a plain sentence, no json");
    assert.equal(raw.description, "just a plain sentence, no json");
  });

  /* 6. describe→compose: the mocked style PROPAGATES into the prompt */
  await test("describeReferenceAndComposePrompt: style + brand + extras + photoreal propagate", async () => {
    const out = await describeReferenceAndComposePrompt({
      reference: { uploadedBytes: FAKE_PNG, uploadedMediaType: "image/png" },
      brandLayer: "Business trade: plumbing. Brand accent: #2563EB.",
      extraInstructions: "make it winter",
      photoreal: true,
      describer: mockDescriber,
    });
    assert.equal(out.ok, true);
    if (!out.ok) return;
    /* The vision-described style MUST be present in the generate prompt. */
    assert.ok(out.prompt.includes(MOCK_STYLE.description), "style description reached the prompt");
    assert.ok(out.prompt.includes("Business trade: plumbing"), "brand layer reached the prompt");
    assert.ok(out.prompt.includes("make it winter"), "extra instructions reached the prompt");
    assert.ok(out.prompt.includes(PHOTOREAL_POSITIVE_SUFFIX), "photoreal augmentation applied");
    assert.equal(out.source, "upload");
    assert.equal(out.styleDescription.palette, "navy blue and warm orange");
  });

  /* 7. simulated downstream generate: composed prompt → mocked orchestrator
   *    → persist with cost. Asserts the described style is exactly what the
   *    image call received, and that a cost is recorded. */
  await test("end-to-end (mocked): described style reaches generate + cost tracked", async () => {
    const composed = await describeReferenceAndComposePrompt({
      reference: { uploadedBytes: FAKE_PNG, uploadedMediaType: "image/png" },
      describer: mockDescriber,
      photoreal: false,
    });
    assert.equal(composed.ok, true);
    if (!composed.ok) return;

    /* Mock orchestrator: capture the prompt it was handed. */
    let promptSeenByGenerator = "";
    const fakeOrchestrator = async (prompt: string) => {
      promptSeenByGenerator = prompt;
      return { ok: true as const, imageBuffer: FAKE_PNG, providerUsed: "pollinations", cost: 0 };
    };
    /* Mock persist + cost tracking. */
    const persisted: { url?: string; costMicroUsd?: number } = {};
    const fakePersist = async (url: string, costMicroUsd: number) => {
      persisted.url = url;
      persisted.costMicroUsd = costMicroUsd;
    };

    const orchRes = await fakeOrchestrator(composed.prompt);
    assert.equal(orchRes.ok, true);
    /* The described style propagated all the way into the generator input. */
    assert.ok(
      promptSeenByGenerator.includes(MOCK_STYLE.description),
      "generator received the vision-described style",
    );
    await fakePersist("https://r2.example.com/asset.png", 40_000);
    assert.equal(persisted.url, "https://r2.example.com/asset.png");
    assert.equal(persisted.costMicroUsd, 40_000, "cost tracked in micro-USD");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
