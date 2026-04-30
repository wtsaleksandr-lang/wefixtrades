/**
 * ContentFlow — Sprint 12 verification.
 *
 * Image attachment for Google Business Profile local posts. Sprint 11
 * shipped FB/IG image generation + R2 upload; Sprint 12 extends the
 * same pipeline to GBP posts and threads `image_url` through the
 * publisher's `media` field.
 *
 *   P12-1  generateForDraft populates media_plan.image_url for a
 *          kind='google_post' / target_platform='google_business' draft
 *   P12-2  GBP publisher attaches `media:[{mediaFormat:"PHOTO", sourceUrl}]`
 *          when image_url is present (verified via dev-mock recorder)
 *   P12-3  HARD REQ — image-gen failure does NOT block GBP publish
 *          (FAIL_IMG_500 → text-only GBP post still goes through)
 *   P12-4  brand prompt layer (clients.metadata.image_brand) applies
 *          to GBP image generation just like FB/IG
 *   P12-5  idempotency — re-call generateForDraft on a GBP draft that
 *          already has image_url is a no-op
 *   P12-6  scope guarantee — kind != social_post/carousel_post/google_post
 *          is still rejected (defends against accidental over-broadening)
 *
 * Pre-conditions on Replit:
 *   IMAGE_API_BASE_OVERRIDE, GBP_POST_API_BASE_OVERRIDE both set.
 */

import { test as baseTest, expect, type APIRequestContext } from "@playwright/test";
import { STORAGE_STATE_PATH } from "./global-setup";
import { pool } from "../../../server/db";
import { encryptToken } from "../../../server/services/socialSync/tokenEncryption";
import { generateForDraft } from "../../../server/services/contentflow/imageGenerationService";
import { getAdapter } from "../../../server/services/contentflow/adapters/registry";

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

type SuiteFixtures = { adminApi: APIRequestContext };
const test = baseTest.extend<{}, SuiteFixtures>({
  adminApi: [
    async ({ playwright }, use) => {
      const ctx = await playwright.request.newContext({
        baseURL: BASE_URL,
        storageState: STORAGE_STATE_PATH,
        extraHTTPHeaders: { "x-test-bypass-rate-limit": "1" },
      });
      await use(ctx);
      await ctx.dispose();
    },
    { scope: "worker" },
  ],
});

function testId() {
  return `pw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

async function provisionGbpClient(adminApi: APIRequestContext, brandJson: object | null = null): Promise<{ clientId: number }> {
  const id = testId();
  const cRes = await adminApi.post("/api/admin/crm/clients", {
    data: {
      business_name: `Sprint 12 Test ${id}`,
      contact_name: "Sprint12 Tester",
      contact_email: `test-${id}@example.com`,
      contact_phone: "415-555-1212",
      trade_type: "electrician",
      status: "lead",
      source: "manual",
    },
  });
  expect(cRes.ok()).toBeTruthy();
  const clientId = (await cRes.json()).id;
  if (brandJson) {
    await pool.query(
      `UPDATE clients SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{image_brand}', $2::jsonb) WHERE id = $1`,
      [clientId, JSON.stringify(brandJson)],
    );
  }
  /* Insert GBP connection so the publisher can resolve credentials. */
  const gbpToken = encryptToken("sprint12-gbp-token");
  await pool.query(
    `INSERT INTO socialsync_platform_connections
       (client_id, platform, connection_status, external_account_id, external_page_id,
        token_ref, token_expires_at, last_validated_at, metadata)
     VALUES ($1, 'google_business', 'connected', 'accounts/test',
             'accounts/test/locations/sprint12-${id}', $2,
             NOW() + interval '1 hour', NOW(), '{}'::jsonb)`,
    [clientId, gbpToken],
  );
  return { clientId };
}

async function createGbpDraft(
  clientId: number,
  promptText: string,
  postText: string,
  opts: { preExistingImageUrl?: string; explicitKind?: string } = {},
): Promise<{ postId: number; draftId: number }> {
  const mediaPlan: Record<string, any> = { type: "image", prompt: promptText };
  if (opts.preExistingImageUrl) {
    mediaPlan.image_url = opts.preExistingImageUrl;
    mediaPlan.public_image_url = opts.preExistingImageUrl;
  }
  const postRes = await pool.query(
    `INSERT INTO socialsync_posts (client_id, platform, post_text, status, media_plan, hashtags, quality_score, created_at, updated_at)
     VALUES ($1, 'google_business', $2, 'ready', $3::jsonb, '[]'::jsonb, 90, NOW(), NOW())
     RETURNING id`,
    [clientId, postText, JSON.stringify(mediaPlan)],
  );
  const postId = postRes.rows[0].id;
  const kind = opts.explicitKind ?? "google_post";
  /* Pre-set queue_status='queued' on metadata.gbp_post so the queue worker
   * is willing to claim immediately if the spec invokes /__dev/wp-queue/run. */
  const draftMeta = { media_plan: mediaPlan, gbp_post: { queue_status: "queued", attempts: 0, scheduled_for: null } };
  const draftRes = await pool.query(
    `INSERT INTO content_drafts (client_id, kind, surface, body, status, target_platform, metadata,
       linked_social_post_id, auto_approved, admin_approved_at, created_by, created_at, updated_at)
     VALUES ($1, $2, 'socialsync', $3, 'approved', 'google_business', $4::jsonb,
             $5, true, NOW(), 'system', NOW(), NOW())
     RETURNING id`,
    [clientId, kind, postText, JSON.stringify(draftMeta), postId],
  );
  return { postId, draftId: draftRes.rows[0].id };
}

async function readDraftMeta(draftId: number): Promise<any> {
  const { rows } = await pool.query(`SELECT metadata FROM content_drafts WHERE id = $1`, [draftId]);
  return rows[0]?.metadata ?? null;
}

async function fetchGbpRecorder(adminApi: APIRequestContext): Promise<any[]> {
  const r = await adminApi.get(`/api/__dev/gbp-post-mock/__inspect/recent`);
  if (!r.ok()) return [];
  const body = await r.json();
  return Array.isArray(body.recent) ? body.recent : [];
}

test.describe.configure({ mode: "serial" });

test.describe("ContentFlow Sprint 12 — GBP image attachment", () => {
  test.afterAll(async () => {
    try {
      const { rows } = await pool.query(`SELECT id FROM clients WHERE business_name LIKE 'Sprint 12 Test %'`);
      for (const row of rows) {
        const cid = row.id;
        await pool.query(`DELETE FROM content_approvals WHERE draft_id IN (SELECT id FROM content_drafts WHERE client_id = $1)`, [cid]);
        await pool.query(`DELETE FROM content_drafts WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM socialsync_posts WHERE client_id = $1`, [cid]);
        await pool.query(`DELETE FROM socialsync_profiles WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM socialsync_platform_connections WHERE client_id = $1`, [cid]).catch(() => {});
        await pool.query(`DELETE FROM clients WHERE id = $1`, [cid]);
      }
    } catch (err: any) {
      console.warn(`[sprint12 afterAll]`, err.message);
    }
  });

  test("P12-1 — generateForDraft populates media_plan.image_url for a GBP draft", async ({ adminApi }) => {
    const { clientId } = await provisionGbpClient(adminApi);
    const { draftId } = await createGbpDraft(
      clientId,
      "P12-1 GBP image gen test",
      "Sprint 12 P12-1 GBP image happy path",
    );

    const result = await generateForDraft(draftId);
    expect(result.ok, `generateForDraft failed: ${JSON.stringify(result)}`).toBe(true);
    expect(result.image_url).toBeTruthy();

    const meta = await readDraftMeta(draftId);
    expect(meta?.media_plan?.image_url, "image_url must land on the GBP draft").toBeTruthy();
    expect(meta?.image_generation_status).toBe("succeeded");
  });

  test("P12-2 — GBP publisher attaches media[].sourceUrl when image_url present", async ({ adminApi }) => {
    const { clientId } = await provisionGbpClient(adminApi);
    /* Provision a GBP draft already populated with image_url so we can
     * isolate the publisher's media-attachment behavior from the
     * image-gen step. */
    const knownImageUrl = "https://example-test.invalid/sprint12-p12-2-image.png";
    const { draftId } = await createGbpDraft(
      clientId,
      "P12-2 publisher media payload test",
      "Sprint 12 P12-2 unique-summary-marker",
      { preExistingImageUrl: knownImageUrl },
    );

    /* Drive the queue worker once to dispatch the GBP draft. */
    const runRes = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    expect(runRes.ok(), `worker run failed: ${await runRes.text()}`).toBeTruthy();

    /* Verify the dev mock recorder saw a request with media[]. */
    const recorder = await fetchGbpRecorder(adminApi);
    const matching = recorder.find((r) => typeof r.body?.summary === "string" && r.body.summary.includes("P12-2 unique-summary-marker"));
    expect(matching, `recorder did not capture P12-2 publish (n=${recorder.length})`).toBeTruthy();
    expect(Array.isArray(matching!.body.media), "publisher must send media[] array").toBe(true);
    expect(matching!.body.media[0].mediaFormat).toBe("PHOTO");
    expect(matching!.body.media[0].sourceUrl).toBe(knownImageUrl);

    /* Draft should now be published. */
    const { rows } = await pool.query(`SELECT status, metadata FROM content_drafts WHERE id = $1`, [draftId]);
    expect(rows[0].status).toBe("published");
    expect((rows[0].metadata as any)?.gbp_post?.posted_at).toBeTruthy();
  });

  test("P12-3 — HARD REQ: image-gen failure does NOT block GBP publish (text-only fallback)", async ({ adminApi }) => {
    const { clientId } = await provisionGbpClient(adminApi);
    /* FAIL_IMG_500 in the prompt forces the image API to return 500. */
    const { draftId } = await createGbpDraft(
      clientId,
      "FAIL_IMG_500 P12-3 force image API failure",
      "Sprint 12 P12-3 text-only-fallback marker",
    );

    const imageRes = await generateForDraft(draftId);
    expect(imageRes.ok).toBe(false);
    expect(imageRes.reason).toBe("api_failed");

    /* Crucially: the draft must still be approved and the queue must
     * still publish it (text-only). Drive the worker. */
    const runRes = await adminApi.post(`/api/admin/contentflow/__dev/wp-queue/run`);
    expect(runRes.ok()).toBeTruthy();

    const meta = await readDraftMeta(draftId);
    expect(meta?.media_plan?.image_url, "no image_url after API failure").toBeFalsy();
    expect(meta?.image_generation_status).toBe("failed");

    const recorder = await fetchGbpRecorder(adminApi);
    const matching = recorder.find((r) => typeof r.body?.summary === "string" && r.body.summary.includes("P12-3 text-only-fallback marker"));
    expect(matching, "GBP publish must still fire even when image gen failed").toBeTruthy();
    /* media should be ABSENT or null — not a populated array. */
    const mediaField = matching!.body.media;
    expect(!Array.isArray(mediaField) || mediaField.length === 0, "no media when image gen failed").toBe(true);

    const { rows } = await pool.query(`SELECT status FROM content_drafts WHERE id = $1`, [draftId]);
    expect(rows[0].status, "draft published text-only").toBe("published");
  });

  test("P12-4 — brand prompt layer applies to GBP image generation", async ({ adminApi }) => {
    const brand = {
      primary_color: "#C0FFEE",
      secondary_color: "#BADA55",
      style_keywords: ["bright", "trustworthy"],
      location_cue: "Sprint12_brand_locale",
    };
    const { clientId } = await provisionGbpClient(adminApi, brand);
    const { draftId } = await createGbpDraft(
      clientId,
      "P12-4 brand-layer GBP test",
      "Sprint 12 P12-4 brand-layer marker",
    );

    const result = await generateForDraft(draftId);
    expect(result.ok).toBe(true);
    expect(result.prompt_used, "service must echo prompt_used for verification").toBeTruthy();
    expect(result.prompt_used!.includes(brand.primary_color!), "primary_color hex in prompt").toBe(true);
    expect(result.prompt_used!.includes(brand.secondary_color!), "secondary_color hex in prompt").toBe(true);
    expect(result.prompt_used!.includes("Sprint12_brand_locale"), "location_cue in prompt").toBe(true);
    expect(result.prompt_used!.includes("trustworthy"), "style keyword in prompt").toBe(true);
  });

  test("P12-5 — idempotency: re-call on a GBP draft with image_url is a no-op", async ({ adminApi }) => {
    const { clientId } = await provisionGbpClient(adminApi);
    const { draftId } = await createGbpDraft(
      clientId,
      "P12-5 idempotency GBP test",
      "Sprint 12 P12-5 idempotency marker",
      { preExistingImageUrl: "https://example-test.invalid/p12-5-already-set.png" },
    );

    const result = await generateForDraft(draftId);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("skipped_already_has_image");

    const meta = await readDraftMeta(draftId);
    expect(meta?.media_plan?.image_url).toBe("https://example-test.invalid/p12-5-already-set.png");
  });

  test("P12-6 — scope guarantee: kind='article' / 'review_reply' still rejected", async ({ adminApi }) => {
    /* Article drafts must NOT trigger image generation (Sprint 11/12 scope).
     * Defends against accidental over-broadening of kind allowlist. */
    const { clientId } = await provisionGbpClient(adminApi);
    const { rows } = await pool.query(
      `INSERT INTO content_drafts (client_id, kind, surface, body, status, target_platform, metadata, created_by, created_at, updated_at)
       VALUES ($1, 'article', 'rankflow', 'P12-6 article body', 'draft', 'rankflow', '{"media_plan":{"prompt":"x"}}'::jsonb, 'system', NOW(), NOW())
       RETURNING id`,
      [clientId],
    );
    const r1 = await generateForDraft(rows[0].id);
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe("skipped_kind");

    /* review_reply too. */
    const { rows: r2rows } = await pool.query(
      `INSERT INTO content_drafts (client_id, kind, surface, body, status, target_platform, metadata, created_by, created_at, updated_at)
       VALUES ($1, 'review_reply', 'reputationshield', 'P12-6 reply', 'draft', 'google_business', '{"media_plan":{"prompt":"x"}}'::jsonb, 'system', NOW(), NOW())
       RETURNING id`,
      [clientId],
    );
    const r2 = await generateForDraft(r2rows[0].id);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("skipped_kind");

    /* Adapter registry remains intact — sanity check Sprint 10 didn't drift. */
    expect(getAdapter("gbp_post").type).toBe("gbp_post");
  });
});
