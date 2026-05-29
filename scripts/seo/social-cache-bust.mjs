#!/usr/bin/env node
/**
 * Wave 124 — Social cache busters (post-deploy follow-up to Wave 91 IndexNow).
 *
 * After a deploy that changes OG metadata, social platforms will serve their
 * old cached preview cards (title, description, hero image) until they decide
 * to re-scrape. This is the standard "I updated my page but LinkedIn / FB
 * still shows the old screenshot" complaint.
 *
 * We push a fresh re-scrape against the surfaces that expose APIs, and for
 * the UI-only surfaces we print a clickable inspector link in the deploy log
 * so a human can refresh on demand.
 *
 *   Facebook    — Graph API endpoint `?id=<URL>&scrape=true`. Requires app
 *                 credentials (`FACEBOOK_APP_ID` + `FACEBOOK_APP_SECRET`).
 *                 Soft-skips if unset.
 *   Twitter / X — no public re-scrape API; cards-dev validator was retired.
 *                 We log the per-URL inspector link Alex can click manually.
 *   LinkedIn    — no public re-scrape API. Same treatment: clickable
 *                 inspector link per URL.
 *
 * Exit behaviour: always exit 0. Soft-fork from start-prod.sh after the
 * IndexNow ping, same pattern. Cache busting is best-effort — never blocks
 * a deploy.
 *
 * Manual run:
 *   node scripts/seo/social-cache-bust.mjs [url1 url2 ...]
 *
 * If invoked with no args, defaults to the same high-value URL set IndexNow
 * pushes. Kept in sync by intent — duplicated here so this script can run
 * independently when indexnow-ping.mjs changes.
 */

const TAG = "[social-cache-bust]";
const FB_GRAPH_VERSION = "v18.0";

/* URLs we re-scrape on every deploy. Matches indexnow-ping.mjs DEFAULT_URLS
 * by intent. Keep in sync when one or the other changes. */
const DEFAULT_URLS = [
  "https://wefixtrades.com/",
  "https://wefixtrades.com/sms-consent-disclosure",
  "https://wefixtrades.com/privacy",
  "https://wefixtrades.com/terms",
  "https://wefixtrades.com/products/tradeline",
  "https://wefixtrades.com/products/quickquotepro",
  "https://wefixtrades.com/products/mapguard",
  "https://wefixtrades.com/products/reputationshield",
  "https://wefixtrades.com/products/contentflow",
  "https://wefixtrades.com/products/rankflow",
  "https://wefixtrades.com/products/socialsync",
  "https://wefixtrades.com/pricing",
  "https://wefixtrades.com/about",
  "https://wefixtrades.com/wefixtrades-vs-jobber",
  "https://wefixtrades.com/wefixtrades-vs-housecall-pro",
  "https://wefixtrades.com/wefixtrades-vs-servicetitan",
  "https://wefixtrades.com/free-tools",
  "https://wefixtrades.com/case-studies",
  "https://wefixtrades.com/contact",
];

function softExit(message) {
  console.log(`${TAG} ${message}`);
  process.exit(0);
}

/* ─── Facebook — Graph API re-scrape ─────────────────────────────────────
 * POST graph.facebook.com/<ver>/?id=<URL>&scrape=true&access_token=<token>
 * The "id" is the URL; the access token can be an App Access Token of the
 * form `<APP_ID>|<APP_SECRET>` (no separate token-mint call needed).
 *
 * Response shape on success:
 *   { "id": "<URL>", "url": "<URL>", "type": "website", ... }
 * On rate-limit:
 *   { "error": { "code": 32 | 4, "message": "..." } }
 *
 * We log per-URL outcome but never fail the script.
 */
async function bustFacebook(urls) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    console.log(
      `${TAG} facebook: skipped — FACEBOOK_APP_ID / FACEBOOK_APP_SECRET not set`,
    );
    return;
  }

  const token = `${appId}|${appSecret}`;
  let ok = 0;
  let failed = 0;

  for (const url of urls) {
    const endpoint =
      `https://graph.facebook.com/${FB_GRAPH_VERSION}/` +
      `?id=${encodeURIComponent(url)}&scrape=true&access_token=${encodeURIComponent(token)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        ok += 1;
      } else {
        failed += 1;
        const body = await res.text().catch(() => "");
        console.warn(
          `${TAG} facebook: ${url} http=${res.status} body=${body.slice(0, 160)}`,
        );
      }
    } catch (err) {
      clearTimeout(timer);
      failed += 1;
      console.warn(`${TAG} facebook: ${url} network=${err?.message || err}`);
    }
  }

  console.log(
    `${TAG} facebook: ${ok}/${urls.length} re-scraped, ${failed} failed`,
  );
}

/* ─── Twitter / X — log inspector URLs ────────────────────────────────────
 * No public re-scrape API. Twitter's old cards-dev validator was retired
 * in 2026. The X "Card Preview" tool inside ads.twitter.com is account-
 * gated. We surface the per-URL inspector link so Alex can click manually
 * when a major page changes.
 */
function bustTwitter(urls) {
  // Twitter's current preview surface — query-string takes the URL to preview.
  console.log(
    `${TAG} twitter: no public re-scrape API. Manual refresh links:`,
  );
  for (const url of urls) {
    const inspector =
      "https://cards-dev.twitter.com/validator?url=" + encodeURIComponent(url);
    console.log(`${TAG}   ${inspector}`);
  }
}

/* ─── LinkedIn — log inspector URLs ───────────────────────────────────────
 * Post Inspector at linkedin.com/post-inspector accepts a URL via query
 * string. Same treatment as Twitter — surface the link.
 */
function bustLinkedIn(urls) {
  console.log(
    `${TAG} linkedin: no public re-scrape API. Manual refresh links:`,
  );
  for (const url of urls) {
    const inspector =
      "https://www.linkedin.com/post-inspector/inspect/" + encodeURIComponent(url);
    console.log(`${TAG}   ${inspector}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const urls = argv.length > 0 ? argv : DEFAULT_URLS;

  console.log(`${TAG} busting social caches for ${urls.length} URL(s)…`);

  // Facebook is the only platform with an API. Do it first.
  await bustFacebook(urls);
  // Twitter + LinkedIn — surface the manual links.
  bustTwitter(urls);
  bustLinkedIn(urls);

  console.log(`${TAG} done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`${TAG} fatal: ${err?.message || err}`);
  // Even programmer errors must not block a deploy.
  process.exit(0);
});
