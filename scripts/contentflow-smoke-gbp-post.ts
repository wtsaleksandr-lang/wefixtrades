/**
 * ContentFlow Sprint 19 — GBP local-post smoke test.
 *
 * Verifies that a Google access token can:
 *   1. Resolve the test location via /v4/{location}
 *   2. POST a local post (createLocalPost) — gated by ALLOW_REAL_POSTS
 *
 * Triple-gated:
 *   CONTENTFLOW_REAL_API_SMOKE=1   master
 *   ALLOW_REAL_POSTS=1             required for create
 *   DRY_RUN=1                      stops after location verify
 *
 * Operator-supplied:
 *   SMOKE_GBP_LOCATION_NAME    accounts/{accountId}/locations/{locationId}
 *   SMOKE_GBP_ACCESS_TOKEN     OAuth access token (will need refresh logic in prod)
 *   SMOKE_GBP_API_BASE         optional, defaults to https://mybusiness.googleapis.com
 *
 * Usage:
 *   CONTENTFLOW_REAL_API_SMOKE=1 DRY_RUN=1 npx tsx scripts/contentflow-smoke-gbp-post.ts
 *   CONTENTFLOW_REAL_API_SMOKE=1 ALLOW_REAL_POSTS=1 npx tsx scripts/contentflow-smoke-gbp-post.ts
 */

import { log, err, runSmoke, preflight, isDryRun } from "./lib/smokeReport";

const SCRIPT = "gbp_post";

async function main(): Promise<void> {
  const skip = preflight(SCRIPT, { requirePublicPost: true });
  if (skip) {
    const { recordResult } = await import("./lib/smokeReport");
    recordResult(SCRIPT, skip);
    log(SCRIPT, "skipped:", skip.message);
    return;
  }

  await runSmoke(SCRIPT, SCRIPT, async () => {
    const locationName = process.env.SMOKE_GBP_LOCATION_NAME;
    const token = process.env.SMOKE_GBP_ACCESS_TOKEN;
    const apiBase = process.env.SMOKE_GBP_API_BASE || "https://mybusiness.googleapis.com";

    if (!locationName || !token) {
      return {
        status: "blocked",
        message: "missing SMOKE_GBP_LOCATION_NAME / SMOKE_GBP_ACCESS_TOKEN",
        manual_steps: [
          "Provision OR identify a TEST GBP location (NOT a customer location).",
          "Run the OAuth flow to obtain a fresh access token (1h lifetime).",
          "Set SMOKE_GBP_LOCATION_NAME=accounts/{accountId}/locations/{locationId}",
          "Set SMOKE_GBP_ACCESS_TOKEN=<oauth access token>",
        ],
      };
    }

    if (!/^accounts\/[^/]+\/locations\/[^/]+$/.test(locationName)) {
      return {
        status: "blocked",
        message: "SMOKE_GBP_LOCATION_NAME must match accounts/{a}/locations/{b}",
      };
    }

    /* Step 1 — verify location is reachable. */
    log(SCRIPT, `GET /v4/${locationName}`);
    let locRes: Response;
    try {
      locRes = await fetch(`${apiBase}/v4/${locationName}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e: any) {
      return { status: "failed", message: `location lookup unreachable: ${e?.message || e}` };
    }
    if (locRes.status === 401 || locRes.status === 403) {
      return {
        status: "failed",
        message: `auth rejected (${locRes.status}) — token expired or wrong scope`,
        details: { http_status: locRes.status },
        manual_steps: [
          "Re-issue access token (Google access tokens last 1 hour).",
          "Verify scope includes business.manage.",
        ],
      };
    }
    if (!locRes.ok) {
      const body = await locRes.text().catch(() => "");
      return {
        status: "failed",
        message: `location lookup returned ${locRes.status}: ${body.slice(0, 200)}`,
        details: { http_status: locRes.status },
      };
    }
    const loc: any = await locRes.json().catch(() => ({}));
    log(SCRIPT, `location ok name=${loc.name ?? "?"} title=${loc.locationName ?? loc.title ?? "?"}`);

    if (isDryRun()) {
      return {
        status: "ok",
        message: "DRY_RUN: location reachable + token valid; skipped localPosts create",
        details: { location: loc.name ?? null, title: loc.locationName ?? loc.title ?? null },
      };
    }

    /* Step 2 — POST a local post. */
    const summary = `[CF SMOKE] Sprint 19 smoke test ${new Date().toISOString()} — safe to delete.`;
    log(SCRIPT, `POST /v4/${locationName}/localPosts`);
    let postRes: Response;
    try {
      postRes = await fetch(`${apiBase}/v4/${locationName}/localPosts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          languageCode: "en",
          summary,
          topicType: "STANDARD",
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e: any) {
      return { status: "failed", message: `local post create failed: ${e?.message || e}` };
    }
    const postBody = await postRes.text().catch(() => "");
    if (!postRes.ok) {
      return {
        status: "failed",
        message: `local post create returned ${postRes.status}: ${postBody.slice(0, 200)}`,
        details: { http_status: postRes.status },
      };
    }
    let parsed: any = {};
    try { parsed = JSON.parse(postBody); } catch {}
    log(SCRIPT, `local post created name=${parsed.name ?? "?"}`);

    return {
      status: "ok",
      message: `created GBP local post: ${parsed.name ?? "?"}`,
      details: {
        http_status: postRes.status,
        local_post_name: parsed.name ?? null,
        location: loc.name ?? null,
      },
      manual_steps: [
        "Open the location's Google Business Profile manager and delete the smoke-test post.",
      ],
    };
  });
}

main().catch((e) => {
  err(SCRIPT, "fatal:", e?.message || e);
  process.exit(0);
});
