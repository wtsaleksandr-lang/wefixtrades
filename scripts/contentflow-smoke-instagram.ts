/**
 * ContentFlow Sprint 19 — Instagram Business smoke test.
 *
 * IG publishing requires:
 *   1. A token that can read the IG Business account (linked to a FB Page)
 *   2. A PUBLIC image URL (Meta fetches the image; localhost won't work)
 *   3. Two-step publish: create media container, then POST /media_publish
 *
 * Triple-gated:
 *   CONTENTFLOW_REAL_API_SMOKE=1   master
 *   ALLOW_REAL_POSTS=1             required for media_publish
 *   DRY_RUN=1                      stops after token + account + container
 *
 * Operator-supplied:
 *   SMOKE_IG_USER_ID         (Business account id, NOT page id)
 *   SMOKE_IG_TOKEN           (long-lived user token w/ instagram_basic + instagram_content_publish)
 *   SMOKE_IG_IMAGE_URL       (PUBLIC https URL of a 1024x1024 jpg/png — see manual)
 *   SMOKE_FB_GRAPH_VERSION   optional, defaults to v19.0
 *
 * Usage:
 *   CONTENTFLOW_REAL_API_SMOKE=1 DRY_RUN=1 npx tsx scripts/contentflow-smoke-instagram.ts
 *   CONTENTFLOW_REAL_API_SMOKE=1 ALLOW_REAL_POSTS=1 npx tsx scripts/contentflow-smoke-instagram.ts
 */

import { log, err, runSmoke, preflight, isDryRun } from "./lib/smokeReport";

const SCRIPT = "instagram";

async function pollContainerStatus(graph: string, containerId: string, token: string): Promise<{ status: string; raw: any }> {
  /* IG often needs a few seconds for image fetch + processing. */
  for (let i = 0; i < 8; i++) {
    const u = new URL(`${graph}/${containerId}`);
    u.searchParams.set("fields", "status_code,status");
    u.searchParams.set("access_token", token);
    let r: Response;
    try {
      r = await fetch(u.toString(), { signal: AbortSignal.timeout(15_000) });
    } catch {
      await new Promise((res) => setTimeout(res, 2000));
      continue;
    }
    const body: any = await r.json().catch(() => ({}));
    const code = body?.status_code ?? body?.status;
    if (code === "FINISHED") return { status: "FINISHED", raw: body };
    if (code === "ERROR" || code === "EXPIRED") return { status: code, raw: body };
    await new Promise((res) => setTimeout(res, 2000));
  }
  return { status: "TIMEOUT", raw: null };
}

async function main(): Promise<void> {
  const skip = preflight(SCRIPT, { requirePublicPost: true });
  if (skip) {
    const { recordResult } = await import("./lib/smokeReport");
    recordResult(SCRIPT, skip);
    log(SCRIPT, "skipped:", skip.message);
    return;
  }

  await runSmoke(SCRIPT, SCRIPT, async () => {
    const igUserId = process.env.SMOKE_IG_USER_ID;
    const token = process.env.SMOKE_IG_TOKEN;
    const imageUrl = process.env.SMOKE_IG_IMAGE_URL;
    const version = process.env.SMOKE_FB_GRAPH_VERSION || "v19.0";
    const graph = `https://graph.facebook.com/${version}`;

    if (!igUserId || !token) {
      return {
        status: "blocked",
        message: "missing SMOKE_IG_USER_ID / SMOKE_IG_TOKEN",
        manual_steps: [
          "Test IG must be a Business account linked to a test FB Page.",
          "Issue a long-lived user token with instagram_basic + instagram_content_publish.",
          "Set SMOKE_IG_USER_ID=<numeric IG Business account id>",
          "Set SMOKE_IG_TOKEN=<long-lived token>",
        ],
      };
    }

    /* Step 1 — verify IG account is reachable. */
    log(SCRIPT, `probing /${igUserId}`);
    let acctRes: Response;
    try {
      const u = new URL(`${graph}/${igUserId}`);
      u.searchParams.set("fields", "id,username,account_type");
      u.searchParams.set("access_token", token);
      acctRes = await fetch(u.toString(), { signal: AbortSignal.timeout(15_000) });
    } catch (e: any) {
      return { status: "failed", message: `IG account probe unreachable: ${e?.message || e}` };
    }
    const acctBody: any = await acctRes.json().catch(() => ({}));
    if (!acctRes.ok || acctBody?.error) {
      return {
        status: "failed",
        message: `IG account lookup rejected: ${acctBody?.error?.message ?? `HTTP ${acctRes.status}`}`,
        details: { http_status: acctRes.status, error_code: acctBody?.error?.code ?? null },
      };
    }
    log(SCRIPT, `IG account id=${acctBody.id} username=${acctBody.username ?? "?"} type=${acctBody.account_type ?? "?"}`);

    if (!imageUrl) {
      return {
        status: "blocked",
        message: "missing SMOKE_IG_IMAGE_URL — IG requires a public image URL (cannot use localhost)",
        details: { ig_user_id: acctBody.id, ig_username: acctBody.username ?? null },
        manual_steps: [
          "Upload a square 1024x1024 jpg/png to a public URL (R2, S3, public CDN).",
          "Set SMOKE_IG_IMAGE_URL=<https://...>",
        ],
      };
    }
    if (!/^https:\/\//.test(imageUrl)) {
      return {
        status: "blocked",
        message: "SMOKE_IG_IMAGE_URL must be HTTPS",
        manual_steps: ["Use an https:// URL for the test image."],
      };
    }

    /* Step 2 — create media container. */
    const caption = `[CF SMOKE] Sprint 19 smoke test ${new Date().toISOString()} — please ignore + delete.`;
    log(SCRIPT, `creating media container with image_url`);
    let containerRes: Response;
    try {
      const u = new URL(`${graph}/${igUserId}/media`);
      u.searchParams.set("access_token", token);
      containerRes = await fetch(u.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, caption }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e: any) {
      return { status: "failed", message: `media container failed: ${e?.message || e}` };
    }
    const containerBody: any = await containerRes.json().catch(() => ({}));
    if (!containerRes.ok || containerBody?.error || !containerBody?.id) {
      return {
        status: "failed",
        message: `media container rejected: ${containerBody?.error?.message ?? `HTTP ${containerRes.status}`}`,
        details: { http_status: containerRes.status, error_code: containerBody?.error?.code ?? null },
      };
    }
    const containerId = String(containerBody.id);
    log(SCRIPT, `container_id=${containerId}; polling for FINISHED`);
    const status = await pollContainerStatus(graph, containerId, token);
    log(SCRIPT, `container status=${status.status}`);
    if (status.status !== "FINISHED") {
      return {
        status: "failed",
        message: `media container did not reach FINISHED (got ${status.status})`,
        details: { container_id: containerId, last_status: status.status },
      };
    }

    if (isDryRun()) {
      return {
        status: "ok",
        message: "DRY_RUN: account verified + container FINISHED; skipped media_publish",
        details: {
          ig_user_id: acctBody.id,
          ig_username: acctBody.username ?? null,
          container_id: containerId,
        },
      };
    }

    /* Step 3 — media_publish (the actual public post). */
    log(SCRIPT, `POST /media_publish with creation_id=${containerId}`);
    let pubRes: Response;
    try {
      const u = new URL(`${graph}/${igUserId}/media_publish`);
      u.searchParams.set("access_token", token);
      u.searchParams.set("creation_id", containerId);
      pubRes = await fetch(u.toString(), { method: "POST", signal: AbortSignal.timeout(20_000) });
    } catch (e: any) {
      return { status: "failed", message: `media_publish failed: ${e?.message || e}` };
    }
    const pubBody: any = await pubRes.json().catch(() => ({}));
    if (!pubRes.ok || pubBody?.error || !pubBody?.id) {
      return {
        status: "failed",
        message: `media_publish rejected: ${pubBody?.error?.message ?? `HTTP ${pubRes.status}`}`,
        details: {
          http_status: pubRes.status,
          error_code: pubBody?.error?.code ?? null,
          error_subcode: pubBody?.error?.error_subcode ?? null,
        },
      };
    }
    log(SCRIPT, `published id=${pubBody.id}`);

    return {
      status: "ok",
      message: `published to IG test account; remote_post_id=${pubBody.id}`,
      details: {
        http_status: pubRes.status,
        remote_post_id: pubBody.id,
        container_id: containerId,
        ig_user_id: acctBody.id,
        ig_username: acctBody.username ?? null,
      },
      manual_steps: [`Delete the smoke-test post on the IG account after verification.`],
    };
  });
}

main().catch((e) => {
  err(SCRIPT, "fatal:", e?.message || e);
  process.exit(0);
});
