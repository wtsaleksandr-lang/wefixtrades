#!/usr/bin/env node
/**
 * Wave 120 — Google Search Console sitemap auto-submit.
 *
 * Mirror of scripts/seo/register-sitemap-bing.mjs but against GSC.
 * Idempotent: lists existing sitemaps for the property, exits 0
 * silently if our sitemap is already on file. Otherwise calls
 * `sitemaps.submit` once.
 *
 * Auth: GOOGLE_APPLICATION_CREDENTIALS_JSON env var contains the full
 * service-account JSON blob (verified in Doppler 2026-05-29). The
 * service account MUST be granted Verified Owner OR Full User on the
 * `https://wefixtrades.com/` property in GSC for this to succeed.
 * If it isn't, the call fails with 403 — we log and exit 0 (NEVER
 * block the deploy).
 *
 * Invocation: forked from scripts/start-prod.sh after the server is
 * up, same pattern as the Bing register.
 *
 * Logs go to stdout/stderr; start-prod.sh redirects stderr to a log
 * file so a noisy failure never SIGTERMs the parent.
 *
 * Secrets: GOOGLE_APPLICATION_CREDENTIALS_JSON is NEVER logged. We
 * only log SA email (which is a public identifier) once for traceability.
 *
 * Why GSC + Bing both: GSC handles Google search index inclusion,
 * Bing handles Bing + the cluster of crawlers it feeds (DuckDuckGo,
 * Ecosia, Yahoo). IndexNow (Wave 91) covers Bing + Yandex + Naver +
 * Seznam + Cloudflare on a per-URL basis. Sitemap registration is
 * the "tell them the whole site map exists" companion to IndexNow's
 * "and these specific URLs just changed."
 */

import { google } from "googleapis";

const SITE_URL = "https://wefixtrades.com/";
const SITEMAP_URL = "https://wefixtrades.com/sitemap.xml";
const TAG = "[gsc-sitemap-register]";

function softExit(message) {
  console.log(`${TAG} ${message}`);
  process.exit(0);
}

function parseServiceAccountKey() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) {
    softExit("skipped — GOOGLE_APPLICATION_CREDENTIALS_JSON not set");
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) {
      softExit(
        "skipped — service account JSON is missing client_email or private_key",
      );
    }
    return parsed;
  } catch (err) {
    softExit(
      `skipped — failed to JSON-parse GOOGLE_APPLICATION_CREDENTIALS_JSON: ${err?.message || err}`,
    );
  }
}

async function main() {
  const key = parseServiceAccountKey();

  // Log the SA email once for traceability (public identifier — safe
  // to put in deploy logs). Private key + the rest of the blob never
  // get logged.
  console.log(`${TAG} authenticating as ${key.client_email}`);

  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ["https://www.googleapis.com/auth/webmasters"],
  });

  let searchConsole;
  try {
    await auth.authorize();
    searchConsole = google.searchconsole({ version: "v1", auth });
  } catch (err) {
    return softExit(`auth failed: ${err?.message || err}`);
  }

  // 1. List existing sitemaps for the property.
  let existing;
  try {
    const resp = await searchConsole.sitemaps.list({ siteUrl: SITE_URL });
    existing = Array.isArray(resp.data?.sitemap) ? resp.data.sitemap : [];
  } catch (err) {
    /* Common failure modes here:
     *   - 403: SA does not have permission on this property. Most likely
     *     cause if this is the first run. Operator needs to add the SA
     *     email as a Verified Owner in the GSC UI.
     *   - 404: property URL not registered in GSC at all. Same fix —
     *     verify ownership of wefixtrades.com in the GSC UI first.
     * Log and exit 0 so the deploy isn't broken by GSC config drift. */
    const status = err?.code || err?.status || "unknown";
    return softExit(`sitemaps.list failed (status=${status}): ${err?.message || err}`);
  }

  const alreadyRegistered = existing.some(
    (s) => (s?.path ?? "").replace(/\/$/, "") === SITEMAP_URL.replace(/\/$/, ""),
  );
  if (alreadyRegistered) {
    return softExit(
      `already registered (${existing.length} sitemap${existing.length === 1 ? "" : "s"} on file)`,
    );
  }

  // 2. Submit our sitemap.
  try {
    await searchConsole.sitemaps.submit({
      siteUrl: SITE_URL,
      feedpath: SITEMAP_URL,
    });
    console.log(`${TAG} submitted ${SITEMAP_URL} OK`);
  } catch (err) {
    const status = err?.code || err?.status || "unknown";
    return softExit(`sitemaps.submit failed (status=${status}): ${err?.message || err}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(`${TAG} fatal: ${err?.message || err}`);
  // Never break a deploy.
  process.exit(0);
});
