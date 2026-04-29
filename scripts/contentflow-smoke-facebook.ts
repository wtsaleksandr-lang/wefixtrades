/**
 * ContentFlow Sprint 19 — Facebook Page smoke test.
 *
 * Verifies that a Facebook Page Access Token can:
 *   1. Pass the Graph API /debug_token check (token shape + expiry)
 *   2. Resolve the Page identity via GET /{page-id}
 *   3. Optionally publish a TEXT-ONLY status to the Page (gated)
 *
 * Triple-gated:
 *   CONTENTFLOW_REAL_API_SMOKE=1   master
 *   ALLOW_REAL_POSTS=1             required for actual /feed POST
 *   DRY_RUN=1                      stops after token + page checks
 *
 * Operator-supplied (test page only — NOT a customer page):
 *   SMOKE_FB_PAGE_ID
 *   SMOKE_FB_PAGE_TOKEN     (Page Access Token, not user token)
 *   SMOKE_FB_GRAPH_VERSION  optional, defaults to v19.0
 *
 * Usage:
 *   CONTENTFLOW_REAL_API_SMOKE=1 DRY_RUN=1 npx tsx scripts/contentflow-smoke-facebook.ts
 *   CONTENTFLOW_REAL_API_SMOKE=1 ALLOW_REAL_POSTS=1 npx tsx scripts/contentflow-smoke-facebook.ts
 */

import { log, err, runSmoke, preflight, isDryRun } from "./lib/smokeReport";

const SCRIPT = "facebook";

async function main(): Promise<void> {
  const skip = preflight(SCRIPT, { requirePublicPost: true });
  if (skip) {
    const { recordResult } = await import("./lib/smokeReport");
    recordResult(SCRIPT, skip);
    log(SCRIPT, "skipped:", skip.message);
    return;
  }

  await runSmoke(SCRIPT, SCRIPT, async () => {
    const pageId = process.env.SMOKE_FB_PAGE_ID;
    const token = process.env.SMOKE_FB_PAGE_TOKEN;
    const version = process.env.SMOKE_FB_GRAPH_VERSION || "v19.0";
    const graph = `https://graph.facebook.com/${version}`;

    if (!pageId || !token) {
      return {
        status: "blocked",
        message: "missing SMOKE_FB_PAGE_ID / SMOKE_FB_PAGE_TOKEN",
        manual_steps: [
          "In Meta App dashboard, generate a Page Access Token for a TEST page (NOT a customer page).",
          "Set SMOKE_FB_PAGE_ID=<numeric id of test page>",
          "Set SMOKE_FB_PAGE_TOKEN=<page access token>",
        ],
      };
    }

    /* Step 1 — debug_token. Reveals expiry + scopes without a side-effect. */
    log(SCRIPT, "probing /debug_token (no side effects)");
    let debugRes: Response;
    try {
      const u = new URL(`${graph}/debug_token`);
      u.searchParams.set("input_token", token);
      u.searchParams.set("access_token", token);
      debugRes = await fetch(u.toString(), { signal: AbortSignal.timeout(15_000) });
    } catch (e: any) {
      return { status: "failed", message: `debug_token unreachable: ${e?.message || e}` };
    }
    const debugBody: any = await debugRes.json().catch(() => ({}));
    if (!debugRes.ok || debugBody?.error) {
      return {
        status: "failed",
        message: `debug_token rejected: ${debugBody?.error?.message ?? `HTTP ${debugRes.status}`}`,
        details: { http_status: debugRes.status, error_code: debugBody?.error?.code ?? null },
      };
    }
    const tokenData = debugBody?.data ?? {};
    const expiresAt = tokenData.expires_at ? new Date(tokenData.expires_at * 1000).toISOString() : null;
    const scopes: string[] = Array.isArray(tokenData.scopes) ? tokenData.scopes : [];
    log(SCRIPT, `token type=${tokenData.type ?? "?"} app_id=${tokenData.app_id ?? "?"} expires_at=${expiresAt ?? "never"} scopes=${scopes.length}`);

    if (tokenData.is_valid === false) {
      return {
        status: "failed",
        message: `token is_valid=false: ${tokenData.error?.message ?? "unknown"}`,
        details: { token_type: tokenData.type ?? null },
      };
    }

    /* Step 2 — GET /{page-id}. Verifies page is reachable + token has access. */
    log(SCRIPT, `probing /${pageId}`);
    let pageRes: Response;
    try {
      const u = new URL(`${graph}/${pageId}`);
      u.searchParams.set("fields", "id,name,category");
      u.searchParams.set("access_token", token);
      pageRes = await fetch(u.toString(), { signal: AbortSignal.timeout(15_000) });
    } catch (e: any) {
      return { status: "failed", message: `page lookup unreachable: ${e?.message || e}` };
    }
    const pageBody: any = await pageRes.json().catch(() => ({}));
    if (!pageRes.ok || pageBody?.error) {
      return {
        status: "failed",
        message: `page lookup rejected: ${pageBody?.error?.message ?? `HTTP ${pageRes.status}`}`,
        details: { http_status: pageRes.status, error_code: pageBody?.error?.code ?? null },
        manual_steps: [
          "Verify SMOKE_FB_PAGE_ID matches the page the token was issued for.",
          "Re-generate the Page Access Token if the app permissions changed recently.",
        ],
      };
    }
    log(SCRIPT, `page id=${pageBody.id} name="${pageBody.name}"`);

    if (isDryRun()) {
      return {
        status: "ok",
        message: "DRY_RUN: token valid + page reachable; skipped /feed POST",
        details: {
          token_type: tokenData.type ?? null,
          token_expires_at: expiresAt,
          token_scopes_count: scopes.length,
          page_id: pageBody.id,
          page_name: pageBody.name,
        },
      };
    }

    /* Step 3 — POST text-only status to /{page-id}/feed.
     * No image (image gates on R2 + IG, separate scripts). Text-only is
     * the cheapest way to confirm publish path works against real Graph. */
    const message = `[CF SMOKE] Sprint 19 smoke test ${new Date().toISOString()} — please ignore + delete.`;
    log(SCRIPT, `posting text-only status to /${pageId}/feed`);
    let postRes: Response;
    try {
      const u = new URL(`${graph}/${pageId}/feed`);
      u.searchParams.set("access_token", token);
      postRes = await fetch(u.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, published: true }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e: any) {
      return { status: "failed", message: `feed POST failed: ${e?.message || e}` };
    }
    const postBody: any = await postRes.json().catch(() => ({}));
    if (!postRes.ok || postBody?.error) {
      return {
        status: "failed",
        message: `feed POST rejected: ${postBody?.error?.message ?? `HTTP ${postRes.status}`}`,
        details: {
          http_status: postRes.status,
          error_code: postBody?.error?.code ?? null,
          error_subcode: postBody?.error?.error_subcode ?? null,
        },
      };
    }
    log(SCRIPT, `published id=${postBody.id ?? "?"}`);

    return {
      status: "ok",
      message: `published text-only status to test page; remote_post_id=${postBody.id ?? "?"}`,
      details: {
        http_status: postRes.status,
        remote_post_id: postBody.id ?? null,
        page_id: pageBody.id,
        page_name: pageBody.name,
        token_expires_at: expiresAt,
      },
      manual_steps: [
        `Delete the smoke-test post on the FB page (search for "[CF SMOKE]") after verification.`,
      ],
    };
  });
}

main().catch((e) => {
  err(SCRIPT, "fatal:", e?.message || e);
  process.exit(0);
});
