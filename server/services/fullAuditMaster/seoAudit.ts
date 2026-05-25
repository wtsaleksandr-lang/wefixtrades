/**
 * SEO section — fetches the page HTML once, parses with cheerio, and
 * checks meta-tag completeness + schema.org JSON-LD + heading hierarchy +
 * alt-text coverage + canonical URL + robots.txt + sitemap.xml.
 *
 * Wave 3.6 (2026-05-25). cheerio is already a dependency (used by
 * server/auditRoutes.ts for the free-audit HTML parser).
 */
import * as cheerio from "cheerio";
import type { SectionResult, SectionFinding } from "./types";
import { fetchWithTimeout } from "./httpUtil";

const fail = (summary: string): SectionResult => ({
  score: 0, status: "fail", summary, findings: [],
});

export async function runSeoAudit(websiteUrl: string): Promise<SectionResult> {
  const homepage = await fetchWithTimeout(websiteUrl, { timeoutMs: 15_000 });
  if (!homepage || !homepage.ok) {
    return fail(`SEO audit unavailable — couldn't fetch ${websiteUrl} (status ${homepage?.status ?? "no-response"}).`);
  }
  const html = await homepage.text().catch(() => "");
  if (!html) return fail("SEO audit unavailable — homepage returned an empty body.");

  const $ = cheerio.load(html);
  const findings: SectionFinding[] = [];
  // Score starts at 100, deduct per finding. Caps at 0.
  let score = 100;

  // 1. Title tag
  const title = ($("head > title").first().text() || "").trim();
  if (!title) {
    findings.push({ severity: "critical", title: "Missing <title>", description: "The homepage has no <title> tag — search engines fall back to the URL.", suggestedFix: "Add a 50-60 character <title> matching the page's primary keyword." });
    score -= 15;
  } else if (title.length < 20 || title.length > 65) {
    findings.push({ severity: "warning", title: "Title length out of range", description: `<title> is ${title.length} characters. Aim for 50-60 to avoid truncation in SERPs.`, suggestedFix: "Rewrite the title to land between 50 and 60 characters." });
    score -= 5;
  }

  // 2. Meta description
  const desc = ($('head meta[name="description"]').attr("content") || "").trim();
  if (!desc) {
    findings.push({ severity: "warning", title: "Missing meta description", description: "No <meta name=\"description\"> tag — Google auto-generates a snippet which often misses your value prop.", suggestedFix: "Add a 140-160 character description summarising the page." });
    score -= 10;
  } else if (desc.length < 70 || desc.length > 170) {
    findings.push({ severity: "info", title: "Meta description length off", description: `Meta description is ${desc.length} characters. Aim for 140-160 for the cleanest SERP snippet.`, suggestedFix: "Rewrite to 140-160 characters." });
    score -= 3;
  }

  // 3. Canonical
  const canonical = $('head link[rel="canonical"]').attr("href");
  if (!canonical) {
    findings.push({ severity: "warning", title: "No canonical URL", description: "Without <link rel=\"canonical\"> Google may dedupe www/non-www or http/https variants unpredictably.", suggestedFix: "Add <link rel=\"canonical\" href=\"<absolute-url>\"> in <head>." });
    score -= 8;
  }

  // 4. JSON-LD schema.org
  const jsonLdBlocks = $('script[type="application/ld+json"]');
  if (jsonLdBlocks.length === 0) {
    findings.push({ severity: "warning", title: "No schema.org JSON-LD", description: "Structured data helps Google show rich results (ratings, hours, business info).", suggestedFix: "Add a LocalBusiness JSON-LD block with name, address, telephone, openingHours." });
    score -= 10;
  }

  // 5. Heading hierarchy
  const h1Count = $("h1").length;
  if (h1Count === 0) {
    findings.push({ severity: "critical", title: "No <h1> tag", description: "Every page should have exactly one <h1> describing the page topic.", suggestedFix: "Add one <h1> containing the primary keyword." });
    score -= 12;
  } else if (h1Count > 1) {
    findings.push({ severity: "warning", title: `${h1Count} <h1> tags found`, description: "Multiple <h1>s dilute the page-topic signal.", suggestedFix: "Demote extra <h1>s to <h2>." });
    score -= 5;
  }

  // 6. Alt text coverage
  const imgs = $("img");
  const missingAlt = imgs.filter((_, el) => {
    const alt = $(el).attr("alt");
    return alt === undefined || alt === null;
  }).length;
  if (imgs.length > 0 && missingAlt > 0) {
    const pct = Math.round((missingAlt / imgs.length) * 100);
    findings.push({
      severity: pct > 25 ? "warning" : "info",
      title: `${missingAlt} of ${imgs.length} images missing alt text`,
      description: "Alt attributes power screen readers + Google Images. Missing alts hurt both accessibility and image SEO.",
      suggestedFix: "Add a short descriptive alt to every <img>. Decorative images can use alt=\"\".",
    });
    score -= Math.min(10, Math.round(pct / 10));
  }

  // 7. robots.txt + sitemap.xml (parallel fetch from the origin)
  let robotsPresent = false;
  let sitemapPresent = false;
  try {
    const origin = new URL(websiteUrl).origin;
    const [robotsRes, sitemapRes] = await Promise.allSettled([
      fetchWithTimeout(`${origin}/robots.txt`, { timeoutMs: 5000 }),
      fetchWithTimeout(`${origin}/sitemap.xml`, { timeoutMs: 5000 }),
    ]);
    robotsPresent = robotsRes.status === "fulfilled" && !!robotsRes.value && robotsRes.value.ok;
    sitemapPresent = sitemapRes.status === "fulfilled" && !!sitemapRes.value && sitemapRes.value.ok;
  } catch { /* origin parse failed; treat as missing */ }

  if (!robotsPresent) {
    findings.push({ severity: "info", title: "No robots.txt found", description: "robots.txt isn't strictly required but is the standard place to declare crawl rules and link to your sitemap.", suggestedFix: "Publish /robots.txt with at least a Sitemap: line." });
    score -= 3;
  }
  if (!sitemapPresent) {
    findings.push({ severity: "warning", title: "No sitemap.xml found", description: "A sitemap helps Google discover every important page on your site.", suggestedFix: "Generate and publish /sitemap.xml, then submit it in Google Search Console." });
    score -= 6;
  }

  score = Math.max(0, Math.min(100, score));
  const status: SectionResult["status"] = score >= 80 ? "pass" : score >= 50 ? "warning" : "fail";

  return {
    score,
    status,
    summary: `SEO score ${score}/100 — ${findings.length} issue${findings.length === 1 ? "" : "s"} found across meta tags, schema, headings, and crawl hints.`,
    findings,
    rawData: {
      title: title || null,
      metaDescriptionLength: desc.length || 0,
      h1Count,
      imgCount: imgs.length,
      missingAltCount: missingAlt,
      hasCanonical: !!canonical,
      hasJsonLd: jsonLdBlocks.length > 0,
      robotsPresent,
      sitemapPresent,
    },
  };
}
