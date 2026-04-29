/**
 * ContentFlow Sprint 19 — GBP review-reply smoke test.
 *
 * Verifies that a Google access token can:
 *   1. Fetch a specific review on a test location
 *   2. PUT a reply to that review (gated by ALLOW_REAL_POSTS)
 *
 * Triple-gated:
 *   CONTENTFLOW_REAL_API_SMOKE=1   master
 *   ALLOW_REAL_POSTS=1             required for PUT
 *   DRY_RUN=1                      stops after fetch
 *
 * Operator-supplied:
 *   SMOKE_GBP_REVIEW_NAME      accounts/{a}/locations/{b}/reviews/{c}
 *   SMOKE_GBP_ACCESS_TOKEN     OAuth access token
 *   SMOKE_GBP_API_BASE         optional, defaults to https://mybusiness.googleapis.com
 *
 * Usage:
 *   CONTENTFLOW_REAL_API_SMOKE=1 DRY_RUN=1 npx tsx scripts/contentflow-smoke-gbp-review-reply.ts
 *   CONTENTFLOW_REAL_API_SMOKE=1 ALLOW_REAL_POSTS=1 npx tsx scripts/contentflow-smoke-gbp-review-reply.ts
 */

import { log, err, runSmoke, preflight, isDryRun } from "./lib/smokeReport";

const SCRIPT = "gbp_review_reply";

async function main(): Promise<void> {
  const skip = preflight(SCRIPT, { requirePublicPost: true });
  if (skip) {
    const { recordResult } = await import("./lib/smokeReport");
    recordResult(SCRIPT, skip);
    log(SCRIPT, "skipped:", skip.message);
    return;
  }

  await runSmoke(SCRIPT, SCRIPT, async () => {
    const reviewName = process.env.SMOKE_GBP_REVIEW_NAME;
    const token = process.env.SMOKE_GBP_ACCESS_TOKEN;
    const apiBase = process.env.SMOKE_GBP_API_BASE || "https://mybusiness.googleapis.com";

    if (!reviewName || !token) {
      return {
        status: "blocked",
        message: "missing SMOKE_GBP_REVIEW_NAME / SMOKE_GBP_ACCESS_TOKEN",
        manual_steps: [
          "Identify a real review on the TEST GBP location (you'll need at least one review to test against).",
          "Set SMOKE_GBP_REVIEW_NAME=accounts/{a}/locations/{b}/reviews/{c}",
          "Set SMOKE_GBP_ACCESS_TOKEN=<oauth access token>",
        ],
      };
    }

    if (!/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/.test(reviewName)) {
      return {
        status: "blocked",
        message: "SMOKE_GBP_REVIEW_NAME must match accounts/{a}/locations/{b}/reviews/{c}",
      };
    }

    /* Step 1 — fetch the review. */
    log(SCRIPT, `GET /v4/${reviewName}`);
    let revRes: Response;
    try {
      revRes = await fetch(`${apiBase}/v4/${reviewName}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e: any) {
      return { status: "failed", message: `review fetch unreachable: ${e?.message || e}` };
    }
    if (revRes.status === 401 || revRes.status === 403) {
      return {
        status: "failed",
        message: `auth rejected (${revRes.status}) — token expired or wrong scope`,
        details: { http_status: revRes.status },
      };
    }
    if (!revRes.ok) {
      const body = await revRes.text().catch(() => "");
      return {
        status: "failed",
        message: `review fetch returned ${revRes.status}: ${body.slice(0, 200)}`,
        details: { http_status: revRes.status },
      };
    }
    const review: any = await revRes.json().catch(() => ({}));
    const star = review.starRating ?? "?";
    const hasReply = !!review.reviewReply?.comment;
    log(SCRIPT, `review ok stars=${star} alreadyReplied=${hasReply}`);

    if (isDryRun()) {
      return {
        status: "ok",
        message: `DRY_RUN: review fetched (stars=${star}, already_replied=${hasReply}); skipped reply PUT`,
        details: { review_name: reviewName, star_rating: star, already_replied: hasReply },
      };
    }

    /* Step 2 — PUT reply. */
    const comment = `[CF SMOKE] Thank you — this is a test reply created by ContentFlow Sprint 19 smoke. Please ignore + remove if visible.`;
    log(SCRIPT, `PUT /v4/${reviewName}/reply`);
    let putRes: Response;
    try {
      putRes = await fetch(`${apiBase}/v4/${reviewName}/reply`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e: any) {
      return { status: "failed", message: `reply PUT failed: ${e?.message || e}` };
    }
    const putBody = await putRes.text().catch(() => "");
    if (!putRes.ok) {
      return {
        status: "failed",
        message: `reply PUT returned ${putRes.status}: ${putBody.slice(0, 200)}`,
        details: { http_status: putRes.status },
      };
    }
    log(SCRIPT, `reply posted to review`);

    return {
      status: "ok",
      message: "reply posted to test review",
      details: { http_status: putRes.status, review_name: reviewName, star_rating: star },
      manual_steps: ["Delete the test reply via Google Business Profile manager."],
    };
  });
}

main().catch((e) => {
  err(SCRIPT, "fatal:", e?.message || e);
  process.exit(0);
});
