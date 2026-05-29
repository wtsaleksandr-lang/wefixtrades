#!/usr/bin/env node
/**
 * Wave 91 — IndexNow ping.
 *
 * IndexNow is the modern protocol Bing / Yandex / Naver (and Cloudflare,
 * Seznam, IndexNow.org members) all honour: instead of waiting for the
 * sitemap-discovery cycle, you tell them "I just updated these URLs,
 * please re-crawl them now."
 *
 * Mechanism:
 *   1. We hold a key (the UUID-ish file at client/public/<key>.txt). The
 *      key file's content MUST be the key value, served at the site root.
 *      That proves we own the host. The current key is `IN_KEY` below;
 *      change it by generating a fresh UUID + writing it to a new file
 *      + updating IN_KEY + IN_KEY_LOCATION.
 *   2. We POST a small JSON payload to api.indexnow.org listing the URLs
 *      we want re-crawled.
 *   3. IndexNow forwards to every participating engine.
 *
 * When to run:
 *   - After every prod deploy that materially changes prerendered HTML.
 *     `npm run build` produces the static templates; once `npm start`
 *     boots, fork this script the same way register-sitemap-bing.mjs is
 *     forked from start-prod.sh.
 *   - After publishing a new blog post / case study / product page.
 *   - Manually via `node scripts/seo/indexnow-ping.mjs [url1 url2 ...]`
 *     to push a specific set.
 *
 * Default URL set (no args) = the high-value pages crawlers should
 * re-check on every deploy: home, key product pages, legal/compliance
 * pages (which the TCR vetting bot also hits), and recent blog/case
 * study indices.
 *
 * Exit behaviour:
 *   - On success or "non-fatal" upstream error (4xx/5xx, network) → exit 0.
 *     This script MUST NOT block a deploy.
 *   - On programmer error (missing key file mention, syntax) → exit 1.
 */

import { setTimeout as wait } from "node:timers/promises";

const IN_KEY = "1d6a03646fc943699d6a1f6d5f01c49b";
const IN_KEY_LOCATION = `https://wefixtrades.com/${IN_KEY}.txt`;
const HOST = "wefixtrades.com";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const TAG = "[indexnow-ping]";

/* URLs we re-push on every deploy. Keep this list tight — IndexNow
 * recommends ≤10,000 URLs per request but Bing penalises excessive
 * pushes. The right slice is "pages that change on each deploy" plus
 * pages that crawler-bots hit out-of-band (consent / privacy / terms
 * for the TCR vetting bot). Long-tail SEO pages get picked up via the
 * sitemap and don't need IndexNow priority. */
const DEFAULT_URLS = [
  "https://wefixtrades.com/",
  // Compliance — TCR / Bing-bot hits these without JS
  "https://wefixtrades.com/sms-consent-disclosure",
  "https://wefixtrades.com/privacy",
  "https://wefixtrades.com/terms",
  // Top-level product pages (where most of the prerendered marketing
  // content lives)
  "https://wefixtrades.com/products/tradeline",
  "https://wefixtrades.com/products/quickquotepro",
  "https://wefixtrades.com/products/mapguard",
  "https://wefixtrades.com/products/reputationshield",
  "https://wefixtrades.com/products/contentflow",
  "https://wefixtrades.com/products/rankflow",
  "https://wefixtrades.com/products/socialsync",
  // Pricing + about — high-intent landing pages
  "https://wefixtrades.com/pricing",
  "https://wefixtrades.com/about",
  // Comparison pages (Wave 112 just touched these — fresh content)
  "https://wefixtrades.com/wefixtrades-vs-jobber",
  "https://wefixtrades.com/wefixtrades-vs-housecall-pro",
  "https://wefixtrades.com/wefixtrades-vs-servicetitan",
  // Hub pages
  "https://wefixtrades.com/free-tools",
  "https://wefixtrades.com/case-studies",
  "https://wefixtrades.com/contact",
];

function softExit(message) {
  console.log(`${TAG} ${message}`);
  process.exit(0);
}

async function pingIndexNow(urls) {
  if (urls.length === 0) {
    return softExit("no URLs to push — nothing to do");
  }

  const body = {
    host: HOST,
    key: IN_KEY,
    keyLocation: IN_KEY_LOCATION,
    urlList: urls,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  let res;
  try {
    res = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    return softExit(`network: ${err?.message || err}`);
  }
  clearTimeout(timer);

  /* IndexNow status codes (per https://www.indexnow.org/documentation):
   *   200 — submitted
   *   202 — accepted, key validation pending
   *   400 — bad request (malformed JSON / missing field)
   *   403 — key not found at keyLocation (the .txt file isn't reachable)
   *   422 — URL doesn't belong to host
   *   429 — too many requests, slow down
   * We log every outcome but only treat 5xx as a "warn-and-retry-next-time".
   */
  const status = res.status;
  if (status === 200 || status === 202) {
    console.log(`${TAG} ok — ${urls.length} URLs submitted, http=${status}`);
    return process.exit(0);
  }

  const text = await res.text().catch(() => "");
  if (status === 403) {
    console.warn(
      `${TAG} 403 — IndexNow couldn't reach ${IN_KEY_LOCATION}. Confirm the .txt file deployed and is served as text/plain.`,
    );
  } else if (status === 422) {
    console.warn(
      `${TAG} 422 — one or more URLs not on host=${HOST}. Check the URL list for typos.`,
    );
  } else if (status === 429) {
    console.warn(`${TAG} 429 — rate-limited. Skip this run; next deploy will retry.`);
  } else {
    console.warn(`${TAG} http=${status} body=${text.slice(0, 200)}`);
  }
  // Always exit 0 — never break a deploy.
  process.exit(0);
}

async function main() {
  const argv = process.argv.slice(2);
  const urls = argv.length > 0 ? argv : DEFAULT_URLS;

  console.log(`${TAG} pushing ${urls.length} URL(s) to IndexNow…`);
  // Tiny delay so the post-deploy fork doesn't race with the server
  // becoming reachable for IndexNow's own validation fetch.
  await wait(2_000);
  await pingIndexNow(urls);
}

main().catch((err) => {
  console.error(`${TAG} fatal: ${err?.message || err}`);
  // Even programmer errors should not break a deploy.
  process.exit(0);
});
