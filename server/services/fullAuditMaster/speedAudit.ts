/**
 * Desktop Speed section — runs PageSpeed Insights with strategy=desktop
 * and the `performance` category. Returns Core Web Vitals + the top 5
 * opportunities ranked by estimated savings.
 *
 * Wave 3.6 (2026-05-25).
 */
import type { SectionResult } from "./types";
import { runPageSpeed } from "./pagespeedClient";

const fail = (summary: string): SectionResult => ({
  score: 0,
  status: "fail",
  summary,
  findings: [],
});

function statusFromScore(score: number): SectionResult["status"] {
  if (score >= 90) return "pass";
  if (score >= 50) return "warning";
  return "fail";
}

export async function runSpeedAudit(websiteUrl: string): Promise<SectionResult> {
  const r = await runPageSpeed(websiteUrl, "desktop", "performance");
  if (!r) return fail("Desktop speed audit unavailable — PageSpeed API didn't respond.");

  const a = r.audits || {};
  const lcp = a["largest-contentful-paint"]?.numericValue ?? null;
  const cls = a["cumulative-layout-shift"]?.numericValue ?? null;
  const tbt = a["total-blocking-time"]?.numericValue ?? null;
  const fcp = a["first-contentful-paint"]?.numericValue ?? null;

  const findings = r.opportunities.slice(0, 5).map((o) => ({
    severity: (o.savingsMs ?? 0) > 1000 ? "critical" as const : "warning" as const,
    title: o.title,
    description: o.description?.slice(0, 240) || "",
    suggestedFix: o.savingsMs ? `Est. savings: ${(o.savingsMs / 1000).toFixed(2)}s` : undefined,
  }));

  return {
    score: r.score,
    status: statusFromScore(r.score),
    summary: `Desktop performance score is ${r.score}/100. LCP ${lcp ? (lcp / 1000).toFixed(2) + "s" : "n/a"}, CLS ${cls != null ? cls.toFixed(3) : "n/a"}, TBT ${tbt != null ? Math.round(tbt) + "ms" : "n/a"}.`,
    findings,
    rawData: {
      coreWebVitals: {
        lcp_ms: lcp,
        cls,
        tbt_ms: tbt,
        fcp_ms: fcp,
      },
    },
  };
}
