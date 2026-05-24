#!/usr/bin/env node
/**
 * Post-deploy: ensure wefixtrades.com/sitemap.xml is registered with Bing.
 *
 * Behaviour:
 *   - Lists feeds via Bing GetFeeds.
 *   - If https://wefixtrades.com/sitemap.xml is already present → exit 0, log "already registered".
 *   - Otherwise call SubmitFeed → exit 0 on success.
 *   - On hard error (network, auth) → log loudly, exit 0 anyway. This script
 *     MUST NOT block a deploy. The cron + admin UI provide a retry surface.
 *
 * Invocation: forked from scripts/start-prod.sh after the server is up.
 *   `node scripts/seo/register-sitemap-bing.mjs &`
 *
 * Logs go to stdout/stderr; start-prod.sh redirects stderr to a log file so
 * a noisy failure can never SIGTERM the parent.
 *
 * Secrets: reads BING_WEBMASTER_API_KEY from env (Doppler-injected at boot).
 * The key value is NEVER logged.
 */

const BING_BASE = "https://ssl.bing.com/webmaster/api.svc/json";
const SITE_URL = "https://wefixtrades.com/";
const SITEMAP_URL = "https://wefixtrades.com/sitemap.xml";

const TAG = "[bing-sitemap-register]";

function redact(s) {
  return String(s).replace(/apikey=[^&\s"']+/gi, "apikey=<REDACTED>");
}

function softExit(message) {
  // Deploy must never break because of this script. Always exit 0.
  console.log(`${TAG} ${message}`);
  process.exit(0);
}

async function bingGet(method, params = {}) {
  const apiKey = process.env.BING_WEBMASTER_API_KEY;
  if (!apiKey) throw new Error("BING_WEBMASTER_API_KEY not set");
  const q = new URLSearchParams({ apikey: apiKey, ...params });
  const url = `${BING_BASE}/${method}?${q.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Bing ${method} HTTP ${res.status}: ${redact(text.slice(0, 200))}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } finally {
    clearTimeout(timer);
  }
}

async function bingPost(method, body) {
  const apiKey = process.env.BING_WEBMASTER_API_KEY;
  if (!apiKey) throw new Error("BING_WEBMASTER_API_KEY not set");
  const url = `${BING_BASE}/${method}?apikey=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Bing ${method} HTTP ${res.status}: ${redact(text.slice(0, 200))}`);
    }
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (!process.env.BING_WEBMASTER_API_KEY) {
    softExit("skipped — BING_WEBMASTER_API_KEY not set");
  }
  try {
    const feedsResp = await bingGet("GetFeeds", { siteUrl: SITE_URL });
    const feeds = Array.isArray(feedsResp?.d) ? feedsResp.d : [];
    const already = feeds.some((f) => {
      const url = String(f?.Url ?? "").trim().toLowerCase();
      return url === SITEMAP_URL.toLowerCase();
    });
    if (already) {
      softExit(`already registered (${feeds.length} feed${feeds.length === 1 ? "" : "s"} on file)`);
    }

    await bingPost("SubmitFeed", { siteUrl: SITE_URL, feedUrl: SITEMAP_URL });
    softExit(`registered ${SITEMAP_URL}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Loud-but-soft: log to stderr and exit 0 so deploy proceeds.
    console.error(`${TAG} WARN: ${redact(msg)}`);
    process.exit(0);
  }
}

main();
