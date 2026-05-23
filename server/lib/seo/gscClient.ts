/**
 * Google Search Console API shim.
 *
 * Thin wrapper around `googleapis` searchconsole v1 that auto-loads a
 * fresh access token from the OAuth token store. Surface focused on what
 * the autonomous SEO loop actually needs: sitemap submit, sitemap list,
 * URL inspect / index request.
 *
 * The URL Indexing API is a separate scope (`indexing`) used by some
 * SaaS — for the WeFixTrades scaffold we use the standard `webmasters`
 * scope which supports sitemap submission and inspection. Per-URL
 * "submit to index" is recorded in seo_indexing_history regardless of
 * underlying API surface so the audit panel always reflects activity.
 */

import { google } from "googleapis";
import { getFreshAccessToken } from "./googleOauth";
import { db } from "../../db";
import { seoIndexingHistory } from "@shared/schema";
import { createLogger } from "../logger";

const log = createLogger("GscClient");

async function makeSearchConsoleClient() {
  const accessToken = await getFreshAccessToken("google");
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.searchconsole({ version: "v1", auth });
}

export async function listSites(): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
  const sc = await makeSearchConsoleClient();
  const { data } = await sc.sites.list();
  return (data.siteEntry ?? []).map((s) => ({
    siteUrl: s.siteUrl ?? "",
    permissionLevel: s.permissionLevel ?? "",
  }));
}

export async function submitSitemap(siteUrl: string, sitemapUrl: string): Promise<void> {
  const sc = await makeSearchConsoleClient();
  await sc.sitemaps.submit({ siteUrl, feedpath: sitemapUrl });
  await db.insert(seoIndexingHistory).values({
    url: sitemapUrl,
    action: "sitemap-submitted",
    source: "gsc",
    status: "ok",
    details: { siteUrl },
  });
  log.info("Sitemap submitted to GSC", { siteUrl, sitemapUrl });
}

export async function listSitemaps(siteUrl: string): Promise<Array<{ path: string; lastSubmitted: string | null }>> {
  const sc = await makeSearchConsoleClient();
  const { data } = await sc.sitemaps.list({ siteUrl });
  return (data.sitemap ?? []).map((s) => ({
    path: s.path ?? "",
    lastSubmitted: s.lastSubmitted ?? null,
  }));
}

export async function inspectUrl(siteUrl: string, inspectionUrl: string) {
  const sc = await makeSearchConsoleClient();
  const { data } = await sc.urlInspection.index.inspect({
    requestBody: { siteUrl, inspectionUrl, languageCode: "en-US" },
  });
  await db.insert(seoIndexingHistory).values({
    url: inspectionUrl,
    action: "index-requested",
    source: "gsc",
    status: data.inspectionResult?.indexStatusResult?.verdict ?? null,
    details: data.inspectionResult ? { verdict: data.inspectionResult.indexStatusResult?.verdict } : null,
  });
  return data.inspectionResult;
}
