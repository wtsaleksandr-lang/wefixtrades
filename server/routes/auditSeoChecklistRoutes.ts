/**
 * SEO Checklist — Free Audit tab tool (#1 of 5).
 *
 * GET /api/audit/seo-checklist?reportId=<id>
 *   → { ok, signals: Signal[], score, total, summary, fixes }
 *
 * Verifies 15 ranking signals for the business associated with the given
 * report. Most signals come from already-cached audit data (PageSpeed,
 * Places) plus one lightweight HTML fetch we parse with cheerio for
 * head/body tags. Falls back to "unable to check" rather than failing the
 * whole tool when a single signal can't be evaluated.
 *
 * The 15 signals (id ↔ human label):
 *   https                    HTTPS enabled
 *   mobileFriendly           Mobile-friendly (PageSpeed mobile ≥ 60)
 *   openGraph                Open Graph tags (og:title + og:description + og:image)
 *   schema                   schema.org markup (LocalBusiness / Organization JSON-LD)
 *   gbpClaimed               Google Business Profile claimed (Places hit)
 *   googleReviews            Google reviews ≥ 5
 *   facebookReviews          Facebook reviews ≥ 5 (defer-soft if FB unavailable)
 *   napOnHomepage            NAP visible on homepage (phone + address)
 *   sitemap                  sitemap.xml present
 *   robots                   robots.txt sane (no `Disallow: /` accidental)
 *   titleLength              Page-title length in 30–60 chars
 *   h1Count                  exactly 1 h1
 *   viewport                 viewport meta present
 *   favicon                  favicon present
 *   lighthouseSeo            Lighthouse SEO score ≥ 80
 */

import type { Express, Request, Response } from "express";
import * as cheerio from "cheerio";
import { createLogger } from "../lib/logger";
import {
  rateOk,
  loadBusinessFromReport,
  normalizeWebsite,
  fetchWithTimeout,
} from "./auditTabsShared";

const log = createLogger("audit-seo-checklist");

export type SignalStatus = "pass" | "fail" | "unknown";

export interface Signal {
  id: string;
  label: string;
  status: SignalStatus;
  detail: string;
  /** Optional explainer for the InfoCue tooltip ("why this matters"). */
  why: string;
}

interface HtmlFindings {
  hasOgTitle: boolean;
  hasOgDescription: boolean;
  hasOgImage: boolean;
  hasSchemaLocalBusiness: boolean;
  hasViewport: boolean;
  hasFavicon: boolean;
  titleLength: number;
  h1Count: number;
  hasPhoneOnPage: boolean;
  hasAddressOnPage: boolean;
}

const PHONE_RE = /(\+?\d[\d().\-\s]{7,}\d)/;
const ADDRESS_HINT_RE = /\b(\d{1,5}\s+\w+\s+(street|st\.|road|rd\.|ave|avenue|blvd|drive|dr\.|lane|ln\.|way|court|ct\.|highway|hwy|suite|ste\.))\b/i;

function parseHtml(html: string): HtmlFindings {
  const $ = cheerio.load(html);
  const title = $("head > title").first().text().trim();
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const ogImg = $('meta[property="og:image"]').attr("content");
  const viewport = $('meta[name="viewport"]').attr("content");
  const favicon =
    $('link[rel="icon"]').attr("href") ||
    $('link[rel="shortcut icon"]').attr("href") ||
    $('link[rel="apple-touch-icon"]').attr("href");
  const h1Count = $("h1").length;
  let hasSchemaLocalBusiness = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).contents().text();
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const type = item && (item["@type"] || item["@graph"]?.[0]?.["@type"]);
        const types = Array.isArray(type) ? type : [type];
        for (const t of types) {
          if (typeof t === "string" && /(LocalBusiness|Organization|ProfessionalService)/i.test(t)) {
            hasSchemaLocalBusiness = true;
          }
        }
      }
    } catch {
      /* malformed JSON-LD — skip */
    }
  });
  const bodyText = $("body").text();
  return {
    hasOgTitle: !!ogTitle && ogTitle.length > 0,
    hasOgDescription: !!ogDesc && ogDesc.length > 0,
    hasOgImage: !!ogImg && ogImg.length > 0,
    hasSchemaLocalBusiness,
    hasViewport: !!viewport,
    hasFavicon: !!favicon,
    titleLength: title.length,
    h1Count,
    hasPhoneOnPage: PHONE_RE.test(bodyText),
    hasAddressOnPage: ADDRESS_HINT_RE.test(bodyText),
  };
}

async function fetchHtml(url: string): Promise<string | null> {
  const r = await fetchWithTimeout(url, { timeoutMs: 9000 });
  if (!r || !r.ok) return null;
  const ct = r.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml/i.test(ct)) return null;
  try {
    const buf = await r.text();
    return buf.slice(0, 2_000_000); // cap at ~2MB
  } catch {
    return null;
  }
}

async function checkSitemap(origin: string): Promise<SignalStatus> {
  const r = await fetchWithTimeout(`${origin}/sitemap.xml`, { timeoutMs: 6000, method: "GET" });
  if (!r) return "unknown";
  if (r.ok) return "pass";
  return "fail";
}

async function checkRobots(origin: string): Promise<{ status: SignalStatus; detail: string }> {
  const r = await fetchWithTimeout(`${origin}/robots.txt`, { timeoutMs: 6000 });
  if (!r) return { status: "unknown", detail: "Could not fetch robots.txt" };
  if (!r.ok) return { status: "fail", detail: "robots.txt not found (404)" };
  try {
    const text = (await r.text()).slice(0, 50_000);
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    let disallowAll = false;
    let inGlobal = false;
    for (const ln of lines) {
      if (/^user-agent:\s*\*/i.test(ln)) inGlobal = true;
      else if (/^user-agent:/i.test(ln)) inGlobal = false;
      else if (inGlobal && /^disallow:\s*\/\s*$/i.test(ln)) disallowAll = true;
    }
    if (disallowAll) {
      return { status: "fail", detail: "robots.txt blocks all crawlers — search engines can't index your site." };
    }
    return { status: "pass", detail: "robots.txt looks sane." };
  } catch {
    return { status: "unknown", detail: "Could not parse robots.txt" };
  }
}

function pageSpeedMobileScore(raw: any): number | null {
  const m = raw?.speedData?.mobile;
  if (!m) return null;
  const s = m.performanceScore ?? m.score ?? m.performance ?? null;
  if (typeof s === "number") return s > 1 ? s : Math.round(s * 100);
  return null;
}

function pageSpeedSeoScore(raw: any): number | null {
  const m = raw?.speedData?.mobile;
  if (!m) return null;
  const s = m.seoScore ?? m.seo ?? null;
  if (typeof s === "number") return s > 1 ? s : Math.round(s * 100);
  return null;
}

function summarise(score: number, total: number, signals: Signal[]): string {
  const pct = score / total;
  const fails = signals.filter((s) => s.status === "fail").map((s) => s.label);
  if (pct >= 0.85) {
    return `Your local-SEO foundation is strong — ${score}/${total} signals pass. A few small wins remain.`;
  }
  if (pct >= 0.6) {
    return `Solid base, but you're leaving traffic on the table — ${score}/${total} signals pass. ${fails.length > 0 ? `Biggest gap: ${fails[0]}.` : ""}`;
  }
  if (pct >= 0.4) {
    return `Mixed — about half of your local-SEO basics are in place. The fixes below are quick wins.`;
  }
  return `Your site is missing most of the local-SEO fundamentals. The good news: each one below is fixable.`;
}

function topFixes(signals: Signal[]): string[] {
  const PRIORITY: Record<string, string> = {
    https: "Enable HTTPS — most browsers warn visitors away from non-secure sites.",
    mobileFriendly: "Improve mobile performance — over 70% of local searches are on phones.",
    schema: "Add LocalBusiness JSON-LD — Google uses this to enrich your listing.",
    gbpClaimed: "Claim your Google Business Profile — it's free and drives local pack visibility.",
    napOnHomepage: "Show your phone + address on the homepage — it's the strongest local-SEO signal.",
    sitemap: "Add a sitemap.xml — helps Google index every page.",
    robots: "Fix robots.txt — your current rules block search engines from crawling.",
    titleLength: "Tighten your <title> to 30–60 characters — better click-through in search.",
    h1Count: "Use exactly one <h1> per page — multiple h1s confuse search engines.",
    viewport: "Add a viewport meta tag — without it, mobile rendering breaks.",
    favicon: "Add a favicon — small trust signal, easy fix.",
    openGraph: "Add Open Graph tags — pretty link previews on Facebook / iMessage / WhatsApp.",
    lighthouseSeo: "Address Lighthouse SEO issues — page-level fundamentals.",
    googleReviews: "Ask for more Google reviews — local pack rankings hinge on this.",
    facebookReviews: "Build Facebook reviews — social proof matters more than people think.",
  };
  return signals
    .filter((s) => s.status === "fail")
    .slice(0, 3)
    .map((s) => PRIORITY[s.id] || `Fix: ${s.label}`);
}

export function registerAuditSeoChecklistRoutes(app: Express): void {
  app.get("/api/audit/seo-checklist", async (req: Request, res: Response) => {
    if (!rateOk("seo-checklist", req, res)) return;

    const reportId = String(req.query.reportId || "");
    const biz = await loadBusinessFromReport(reportId);
    if (!biz) {
      return res.status(404).json({ ok: false, error: "Report not found" });
    }

    const website = normalizeWebsite(biz.website);
    const origin = website ? new URL(website).origin : null;
    const isHttps = !!website && website.startsWith("https://");

    // Fan-out: HTML + sitemap + robots in parallel
    const [html, sitemapStatus, robots] = await Promise.all([
      website ? fetchHtml(website) : Promise.resolve(null),
      origin ? checkSitemap(origin) : Promise.resolve<SignalStatus>("unknown"),
      origin ? checkRobots(origin) : Promise.resolve({ status: "unknown" as SignalStatus, detail: "No website on file." }),
    ]);
    const findings: HtmlFindings | null = html ? parseHtml(html) : null;

    const mobileScore = pageSpeedMobileScore(biz.raw);
    const seoScore = pageSpeedSeoScore(biz.raw);
    const googleReviewsCount = Number(biz.raw?.business?.reviewsCount || 0);
    const hasFacebookReviews = false; // FB Graph not wired — soft-defer

    const signals: Signal[] = [
      {
        id: "https",
        label: "HTTPS enabled",
        status: !website ? "unknown" : isHttps ? "pass" : "fail",
        detail: !website ? "No website on file." : isHttps ? "Your site uses HTTPS." : "Your site is served over HTTP — browsers warn visitors.",
        why: "HTTPS encrypts visitor data and is a Google ranking factor.",
      },
      {
        id: "mobileFriendly",
        label: "Mobile-friendly",
        status: mobileScore == null ? "unknown" : mobileScore >= 60 ? "pass" : "fail",
        detail: mobileScore == null ? "Speed test pending." : `PageSpeed mobile score ${mobileScore}/100.`,
        why: "Over 70% of local search happens on mobile. Slow mobile = lost calls.",
      },
      {
        id: "openGraph",
        label: "Open Graph tags",
        status: !findings ? "unknown" : (findings.hasOgTitle && findings.hasOgDescription && findings.hasOgImage) ? "pass" : "fail",
        detail: !findings ? "Couldn't parse page." : (findings.hasOgTitle && findings.hasOgDescription && findings.hasOgImage)
          ? "og:title + og:description + og:image all present."
          : "Missing one or more Open Graph tags.",
        why: "Open Graph powers the preview card when someone shares your link.",
      },
      {
        id: "schema",
        label: "Schema.org LocalBusiness markup",
        status: !findings ? "unknown" : findings.hasSchemaLocalBusiness ? "pass" : "fail",
        detail: !findings ? "Couldn't parse page." : findings.hasSchemaLocalBusiness ? "JSON-LD schema detected." : "No LocalBusiness / Organization JSON-LD found.",
        why: "Schema tells Google exactly what your business is — boosts local pack.",
      },
      {
        id: "gbpClaimed",
        label: "Google Business Profile claimed",
        status: biz.placeId ? "pass" : "fail",
        detail: biz.placeId ? "Your GBP listing is live." : "We couldn't find a claimed Google Business Profile.",
        why: "GBP drives 40-60% of local pack clicks. Claim it free in 10 minutes.",
      },
      {
        id: "googleReviews",
        label: "Google reviews ≥ 5",
        status: googleReviewsCount >= 5 ? "pass" : "fail",
        detail: googleReviewsCount > 0 ? `${googleReviewsCount} Google reviews.` : "No Google reviews yet.",
        why: "Pack rankings hinge on review count + recency. 5 is the floor.",
      },
      {
        id: "facebookReviews",
        label: "Facebook reviews ≥ 5",
        status: hasFacebookReviews ? "pass" : "unknown",
        detail: "Facebook review check not available — connect FB to unlock.",
        why: "Trust signal that complements Google reviews for cross-platform shoppers.",
      },
      {
        id: "napOnHomepage",
        label: "NAP (Name / Address / Phone) visible on homepage",
        status: !findings ? "unknown" : (findings.hasPhoneOnPage && findings.hasAddressOnPage) ? "pass" : "fail",
        detail: !findings ? "Couldn't parse page." : (findings.hasPhoneOnPage && findings.hasAddressOnPage)
          ? "Phone + address both visible."
          : findings.hasPhoneOnPage ? "Phone present, address missing." : "Address present, phone missing.",
        why: "Local-SEO foundation. Search engines cross-reference NAP across the web.",
      },
      {
        id: "sitemap",
        label: "sitemap.xml present",
        status: sitemapStatus,
        detail: sitemapStatus === "pass" ? "sitemap.xml served." : sitemapStatus === "fail" ? "No sitemap.xml at root." : "Could not check.",
        why: "Helps Google find every page — especially service pages buried in nav.",
      },
      {
        id: "robots",
        label: "robots.txt sane",
        status: robots.status,
        detail: robots.detail,
        why: "A bad robots.txt can hide your entire site from Google.",
      },
      {
        id: "titleLength",
        label: "Page title length 30-60 chars",
        status: !findings ? "unknown" : (findings.titleLength >= 30 && findings.titleLength <= 60) ? "pass" : "fail",
        detail: !findings ? "Couldn't parse page." : findings.titleLength === 0 ? "No <title> tag." : `Title is ${findings.titleLength} chars.`,
        why: "Titles outside 30-60 chars get truncated in search results.",
      },
      {
        id: "h1Count",
        label: "Exactly one <h1>",
        status: !findings ? "unknown" : findings.h1Count === 1 ? "pass" : "fail",
        detail: !findings ? "Couldn't parse page." : `${findings.h1Count} <h1> tag(s) found.`,
        why: "Multiple h1s confuse search engines about your page's main topic.",
      },
      {
        id: "viewport",
        label: "Viewport meta tag",
        status: !findings ? "unknown" : findings.hasViewport ? "pass" : "fail",
        detail: !findings ? "Couldn't parse page." : findings.hasViewport ? "Viewport meta present." : "Missing viewport meta — mobile rendering will break.",
        why: "Without viewport, mobile users see your desktop layout zoomed out.",
      },
      {
        id: "favicon",
        label: "Favicon present",
        status: !findings ? "unknown" : findings.hasFavicon ? "pass" : "fail",
        detail: !findings ? "Couldn't parse page." : findings.hasFavicon ? "Favicon linked." : "No favicon found.",
        why: "Small trust signal — appears in browser tabs + bookmarks.",
      },
      {
        id: "lighthouseSeo",
        label: "Lighthouse SEO score ≥ 80",
        status: seoScore == null ? "unknown" : seoScore >= 80 ? "pass" : "fail",
        detail: seoScore == null ? "Lighthouse SEO score not available." : `Lighthouse SEO ${seoScore}/100.`,
        why: "Page-level fundamentals — meta tags, links, mobile usability.",
      },
    ];

    const total = signals.length;
    const score = signals.filter((s) => s.status === "pass").length;
    const summary = summarise(score, total, signals);
    const fixes = topFixes(signals);

    log.info("[seo-checklist] computed", { arg0: reportId, arg1: `${score}/${total}` });

    return res.json({ ok: true, signals, score, total, summary, fixes });
  });
}
