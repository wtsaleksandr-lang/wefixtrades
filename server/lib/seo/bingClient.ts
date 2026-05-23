/**
 * Bing Webmaster Tools API shim.
 *
 * Bing uses a per-user API key (generated in the Bing Webmaster UI) for
 * auth, not OAuth. We store it via the same oauth_tokens table with
 * provider='bing' and the API key in access_token (encrypted).
 *
 * REST endpoint: https://api.bing.com/webmaster/api.svc/json/<Method>
 * Auth: apikey query parameter on every call.
 *
 * Surface mirrors gscClient: submit sitemap + per-URL submit. Bing's
 * SubmitUrl is the canonical "ask Bing to crawl this URL now".
 *
 * Docs: https://learn.microsoft.com/en-us/bingwebmaster/getting-access
 */

import { getToken } from "./oauthTokenStore";
import { db } from "../../db";
import { seoIndexingHistory } from "@shared/schema";
import { createLogger } from "../logger";

const log = createLogger("BingClient");

const BING_BASE = "https://api.bing.com/webmaster/api.svc/json";

async function getApiKey(): Promise<string> {
  const tok = await getToken("bing");
  if (!tok) throw new Error("Bing Webmaster Tools is not connected");
  return tok.access_token; // plaintext, decrypted by store
}

async function bingPost<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const apiKey = await getApiKey();
  const url = `${BING_BASE}/${method}?apikey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bing ${method} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/**
 * Validate a candidate API key by hitting GetUserAgents (a cheap auth-only
 * endpoint). Returns true if the key works.
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const url = `${BING_BASE}/GetUserAgents?apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch (err) {
    log.warn("Bing API key validation failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

export async function submitSitemap(siteUrl: string, sitemapUrl: string): Promise<void> {
  await bingPost("SubmitFeed", { siteUrl, feedUrl: sitemapUrl });
  await db.insert(seoIndexingHistory).values({
    url: sitemapUrl,
    action: "sitemap-submitted",
    source: "bing",
    status: "ok",
    details: { siteUrl },
  });
  log.info("Sitemap submitted to Bing", { siteUrl, sitemapUrl });
}

export async function submitUrl(siteUrl: string, targetUrl: string): Promise<void> {
  await bingPost("SubmitUrl", { siteUrl, url: targetUrl });
  await db.insert(seoIndexingHistory).values({
    url: targetUrl,
    action: "index-requested",
    source: "bing",
    status: "submitted",
    details: { siteUrl },
  });
}

export async function getUrlSubmissionQuota(siteUrl: string): Promise<{ daily: number; monthly: number } | null> {
  try {
    const data = await bingPost<{ d?: { DailyQuota?: number; MonthlyQuota?: number } }>(
      "GetUrlSubmissionQuota",
      { siteUrl },
    );
    return {
      daily: data?.d?.DailyQuota ?? 0,
      monthly: data?.d?.MonthlyQuota ?? 0,
    };
  } catch (err) {
    log.warn("Failed to fetch Bing submission quota", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
