/**
 * ContentFlow Sprint 19 — WordPress smoke test.
 *
 * Verifies that WordPress publishing works against a real (test)
 * staging site. Triple-gated:
 *   CONTENTFLOW_REAL_API_SMOKE=1   master gate
 *   ALLOW_REAL_POSTS=1             required for actual POST
 *   DRY_RUN=1                      validates URL + auth without posting
 *
 * Operator-supplied env (test destination, NOT a customer site):
 *   SMOKE_WP_URL                  https://staging.example.com
 *   SMOKE_WP_USERNAME             admin
 *   SMOKE_WP_APP_PASSWORD         xxxx xxxx xxxx xxxx
 *
 * Usage:
 *   CONTENTFLOW_REAL_API_SMOKE=1 DRY_RUN=1 npx tsx scripts/contentflow-smoke-wordpress.ts
 *   CONTENTFLOW_REAL_API_SMOKE=1 ALLOW_REAL_POSTS=1 npx tsx scripts/contentflow-smoke-wordpress.ts
 */

import { log, err, runSmoke, preflight, isDryRun } from "./lib/smokeReport";

const SCRIPT = "wordpress";

async function main(): Promise<void> {
  const skip = preflight(SCRIPT, { requirePublicPost: true });
  if (skip) {
    const { recordResult } = await import("./lib/smokeReport");
    recordResult(SCRIPT, skip);
    log(SCRIPT, "skipped:", skip.message);
    return;
  }

  await runSmoke(SCRIPT, SCRIPT, async () => {
    const url = process.env.SMOKE_WP_URL;
    const user = process.env.SMOKE_WP_USERNAME;
    const pw = process.env.SMOKE_WP_APP_PASSWORD;

    if (!url || !user || !pw) {
      return {
        status: "blocked",
        message: "missing SMOKE_WP_URL / SMOKE_WP_USERNAME / SMOKE_WP_APP_PASSWORD",
        manual_steps: [
          "Provision a test WordPress staging site (NOT a customer site).",
          "Create an Application Password under Users → Profile.",
          "Set SMOKE_WP_URL=https://staging.example.com",
          "Set SMOKE_WP_USERNAME=<admin user>",
          "Set SMOKE_WP_APP_PASSWORD=<generated app password>",
        ],
      };
    }

    if (!/^https:\/\/.+/i.test(url)) {
      return {
        status: "blocked",
        message: "SMOKE_WP_URL must be HTTPS — the WordPress publisher refuses non-https targets",
        manual_steps: ["Use an https:// URL for the staging site."],
      };
    }

    /* Step 1: GET /wp-json — verify the URL is a WP site. */
    const auth = "Basic " + Buffer.from(`${user}:${pw}`).toString("base64");
    const root = url.replace(/\/$/, "");
    log(SCRIPT, `probing ${root}/wp-json (auth provided)`);
    let probeRes: Response;
    try {
      probeRes = await fetch(`${root}/wp-json`, {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e: any) {
      return {
        status: "failed",
        message: `wp-json unreachable: ${e?.message || e}`,
        manual_steps: ["Verify URL is correct and reachable. Check DNS / firewall."],
      };
    }
    if (!probeRes.ok) {
      const body = await probeRes.text().catch(() => "");
      return {
        status: "failed",
        message: `wp-json returned ${probeRes.status}: ${body.slice(0, 200)}`,
        details: { http_status: probeRes.status },
      };
    }

    /* Step 2: GET /wp-json/wp/v2/users/me — verify auth. */
    log(SCRIPT, "probing /wp-json/wp/v2/users/me");
    let meRes: Response;
    try {
      meRes = await fetch(`${root}/wp-json/wp/v2/users/me`, {
        headers: { Authorization: auth },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e: any) {
      return { status: "failed", message: `auth probe failed: ${e?.message || e}` };
    }
    if (meRes.status === 401 || meRes.status === 403) {
      return {
        status: "failed",
        message: `auth rejected (${meRes.status}) — username + app password incorrect`,
        details: { http_status: meRes.status },
        manual_steps: [
          "Generate a fresh Application Password under Users → Profile.",
          "Make sure the username matches.",
        ],
      };
    }
    if (!meRes.ok) {
      const body = await meRes.text().catch(() => "");
      return {
        status: "failed",
        message: `users/me returned ${meRes.status}: ${body.slice(0, 200)}`,
        details: { http_status: meRes.status },
      };
    }
    const me = await meRes.json().catch(() => ({} as any));
    log(SCRIPT, `auth ok — user_id=${me.id ?? "?"} roles=${(me.roles ?? []).join(",")}`);

    if (isDryRun()) {
      return {
        status: "ok",
        message: "DRY_RUN: URL reachable + auth verified; skipped post creation",
        details: { http_status: 200, user_id: me.id ?? null, roles: me.roles ?? [] },
      };
    }

    /* Step 3: POST a status=draft post — never publish during smoke
     * unless ALLOW_REAL_POSTS=1 (already gated by preflight). Even so,
     * keep it status=draft so it's invisible to the public. */
    const title = `[CF SMOKE] sprint19 ${new Date().toISOString()}`;
    const body = `<p>This is a ContentFlow Sprint 19 smoke test post. It is created as a DRAFT and is safe to delete.</p>`;
    log(SCRIPT, `creating draft post: ${title}`);
    let postRes: Response;
    try {
      postRes = await fetch(`${root}/wp-json/wp/v2/posts`, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, content: body, status: "draft" }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e: any) {
      return { status: "failed", message: `post create failed: ${e?.message || e}` };
    }
    const postBody = await postRes.text().catch(() => "");
    if (!postRes.ok) {
      return {
        status: "failed",
        message: `post creation returned ${postRes.status}: ${postBody.slice(0, 200)}`,
        details: { http_status: postRes.status },
      };
    }
    let parsed: any = {};
    try { parsed = JSON.parse(postBody); } catch {}
    log(SCRIPT, `draft created post_id=${parsed.id ?? "?"} status=${parsed.status ?? "?"}`);

    return {
      status: "ok",
      message: `WP draft created (id=${parsed.id ?? "?"}); operator should delete this draft after verification`,
      details: {
        http_status: postRes.status,
        post_id: parsed.id ?? null,
        wp_status: parsed.status ?? null,
        title,
      },
      manual_steps: [
        `Open ${root}/wp-admin/edit.php and delete the smoke-test draft.`,
      ],
    };
  });
}

main().catch((e) => {
  err(SCRIPT, "fatal:", e?.message || e);
  process.exit(0); /* Never propagate failure exit — report carries status. */
});
