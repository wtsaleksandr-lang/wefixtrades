/**
 * Accessibility section — Lighthouse's accessibility category via the
 * same PageSpeed API endpoint. Returns WCAG 2.1 issues + top violations.
 *
 * Wave 3.6 (2026-05-25).
 */
import type { SectionResult, SectionFinding } from "./types";
import { runPageSpeed } from "./pagespeedClient";

const fail = (summary: string): SectionResult => ({
  score: 0, status: "fail", summary, findings: [],
});

function statusFromScore(score: number): SectionResult["status"] {
  if (score >= 90) return "pass";
  if (score >= 70) return "warning";
  return "fail";
}

export async function runAccessibilityAudit(websiteUrl: string): Promise<SectionResult> {
  // Mobile strategy gives us touch-target a11y signal alongside the
  // standard WCAG colour/aria checks.
  const r = await runPageSpeed(websiteUrl, "mobile", "accessibility");
  if (!r) return fail("Accessibility audit unavailable — PageSpeed API didn't respond.");

  // Lighthouse marks accessibility audits with score 0 / 0.5 / 1 (no
  // partial credit). Surface anything below 1 as a finding.
  const findings: SectionFinding[] = [];
  for (const [id, v] of Object.entries<any>(r.audits || {})) {
    if (!v || v.scoreDisplayMode === "notApplicable" || v.scoreDisplayMode === "manual") continue;
    if (v.score == null || v.score === 1) continue;
    findings.push({
      severity: v.score === 0 ? "critical" : "warning",
      title: String(v.title || id),
      description: String(v.description || "").slice(0, 240),
      suggestedFix: v.details?.items?.length
        ? `${v.details.items.length} element${v.details.items.length === 1 ? "" : "s"} affected — see browser devtools for selectors.`
        : undefined,
    });
  }
  // Keep top 5 by severity (critical first).
  findings.sort((a, b) => {
    const w = { critical: 0, warning: 1, info: 2 } as const;
    return w[a.severity] - w[b.severity];
  });
  const topFindings = findings.slice(0, 5);

  return {
    score: r.score,
    status: statusFromScore(r.score),
    summary: `Accessibility score ${r.score}/100. ${findings.length} WCAG 2.1 issue${findings.length === 1 ? "" : "s"} flagged${findings.length > 5 ? `, top ${topFindings.length} shown` : ""}.`,
    findings: topFindings,
    rawData: {
      totalIssues: findings.length,
    },
  };
}
