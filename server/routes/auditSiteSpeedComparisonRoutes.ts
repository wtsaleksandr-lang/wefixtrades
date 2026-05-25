/**
 * Site Speed Comparison — Free Audit tab tool (#2 of 5).
 *
 * GET /api/audit/speed-vs-competitor?reportId=<id>
 *   → { ok, you: PageSpeedSummary, them: CompetitorSummary, summary, winLoss }
 *
 * Auto-finds the #1 organic result for "{trade} {city}" via Serper (the
 * same API audit/auditRoutes.ts already uses for keyword ranking), then
 * runs PageSpeed against both URLs and returns side-by-side metrics. If
 * Serper / PageSpeed keys are missing the endpoint degrades to a "speed
 * comparison not available right now" envelope rather than 500-ing.
 */

import type { Express, Request, Response } from "express";
import { createLogger } from "../lib/logger";
import { searchSerp } from "../lib/serpOrchestrator";
import {
  rateOk,
  loadBusinessFromReport,
  normalizeWebsite,
  hostnameOf,
} from "./auditTabsShared";

const log = createLogger("audit-speed-compare");

interface PageSpeedSummary {
  url: string;
  hostname: string;
  score: number | null;
  fcp: number | null; // seconds
  lcp: number | null; // seconds
  tbt: number | null; // ms
  cls: number | null;
}

async function runPageSpeed(url: string): Promise<PageSpeedSummary | null> {
  const key = process.env.PAGESPEED_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    url,
    strategy: "mobile",
    key,
    category: "performance",
  });
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 35_000);
  try {
    const r = await fetch(endpoint, { signal: ctrl.signal });
    if (!r.ok) return null;
    const data: any = await r.json();
    const lhr = data?.lighthouseResult;
    const score01 = lhr?.categories?.performance?.score;
    if (score01 == null) return null;
    const audits = lhr?.audits || {};
    const num = (k: string) => {
      const v = audits[k]?.numericValue;
      return typeof v === "number" ? v : null;
    };
    return {
      url,
      hostname: hostnameOf(url) || url,
      score: Math.round(score01 * 100),
      fcp: num("first-contentful-paint") !== null ? +(num("first-contentful-paint")! / 1000).toFixed(2) : null,
      lcp: num("largest-contentful-paint") !== null ? +(num("largest-contentful-paint")! / 1000).toFixed(2) : null,
      tbt: num("total-blocking-time") !== null ? Math.round(num("total-blocking-time")!) : null,
      cls: audits["cumulative-layout-shift"]?.numericValue ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function findCompetitorUrl(trade: string, city: string, excludeDomain: string | null): Promise<string | null> {
  if (!trade || !city) return null;
  try {
    const result = await searchSerp({
      query: `${trade} ${city}`,
      location: city,
      country: "us",
      language: "en",
      num: 10,
      engine: "google_web",
    });
    for (const o of result.organic) {
      const link = String(o.link || "");
      if (!link) continue;
      try {
        const host = new URL(link).hostname.replace(/^www\./, "");
        // Skip directory aggregators and the business's own domain
        const SKIP = ["yelp.com", "facebook.com", "yellowpages.com", "bbb.org", "angi.com", "homeadvisor.com", "thumbtack.com", "google.com", "instagram.com", "tripadvisor.com", "nextdoor.com", "mapquest.com"];
        if (SKIP.some((s) => host.endsWith(s))) continue;
        if (excludeDomain && host.endsWith(excludeDomain)) continue;
        return link;
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function summariseSpeed(you: PageSpeedSummary | null, them: PageSpeedSummary | null): { summary: string; winLoss: Array<{ metric: string; winner: "you" | "them" | "tie"; delta: string }> } {
  if (!you || !them) {
    return {
      summary: "We couldn't fetch one of the speed reports — try again in a minute.",
      winLoss: [],
    };
  }
  const cmp = (label: string, y: number | null, t: number | null, lowerIsBetter: boolean, fmt: (n: number) => string): { metric: string; winner: "you" | "them" | "tie"; delta: string } => {
    if (y == null || t == null) return { metric: label, winner: "tie", delta: "—" };
    if (Math.abs(y - t) < 0.001) return { metric: label, winner: "tie", delta: "tied" };
    const winner = lowerIsBetter ? (y < t ? "you" : "them") : (y > t ? "you" : "them");
    const diff = Math.abs(y - t);
    return { metric: label, winner, delta: fmt(diff) };
  };
  const winLoss = [
    cmp("Overall score", you.score, them.score, false, (n) => `${Math.round(n)} pts`),
    cmp("First Contentful Paint", you.fcp, them.fcp, true, (n) => `${n.toFixed(1)}s`),
    cmp("Largest Contentful Paint", you.lcp, them.lcp, true, (n) => `${n.toFixed(1)}s`),
    cmp("Total Blocking Time", you.tbt, them.tbt, true, (n) => `${Math.round(n)}ms`),
    cmp("Cumulative Layout Shift", you.cls, them.cls, true, (n) => n.toFixed(3)),
  ];
  const ys = you.score ?? 0;
  const ts = them.score ?? 0;
  let summary: string;
  if (ys > ts + 10) {
    summary = `Your site is meaningfully faster than the top-ranking competitor (${ys} vs ${ts}). Speed wins clicks.`;
  } else if (ts > ys + 10) {
    summary = `The top-ranking competitor is meaningfully faster than your site (${ts} vs ${ys}). Speed is hurting you in mobile rankings.`;
  } else if (Math.abs(ys - ts) <= 5) {
    summary = `You and the top competitor are roughly tied on speed (${ys} vs ${ts}) — small optimisations could tip the scale.`;
  } else {
    const winner = ys > ts ? "ahead" : "behind";
    summary = `You're slightly ${winner} on overall speed (${ys} vs ${ts}). Focus on the biggest deltas below for the highest-leverage wins.`;
  }
  return { summary, winLoss };
}

export function registerAuditSiteSpeedComparisonRoutes(app: Express): void {
  app.get("/api/audit/speed-vs-competitor", async (req: Request, res: Response) => {
    if (!rateOk("speed-vs-competitor", req, res)) return;

    const reportId = String(req.query.reportId || "");
    const biz = await loadBusinessFromReport(reportId);
    if (!biz) return res.status(404).json({ ok: false, error: "Report not found" });

    const yourUrl = normalizeWebsite(biz.website);
    if (!yourUrl) {
      return res.json({
        ok: true,
        you: null,
        them: null,
        summary: "No website on file for this business — can't run a speed comparison.",
        winLoss: [],
        unavailable: true,
      });
    }
    const yourDomain = hostnameOf(yourUrl);

    const competitorUrl = await findCompetitorUrl(biz.trade || "", biz.city || "", yourDomain);

    const [you, them] = await Promise.all([
      runPageSpeed(yourUrl),
      competitorUrl ? runPageSpeed(competitorUrl) : Promise.resolve(null),
    ]);

    const { summary, winLoss } = summariseSpeed(you, them);
    log.info("[speed-compare] computed", { arg0: reportId, arg1: yourDomain, arg2: competitorUrl || "no-competitor" });

    return res.json({
      ok: true,
      you,
      them,
      summary,
      winLoss,
      competitorUrl,
      unavailable: !you && !them,
    });
  });
}
