/**
 * Mobile Speed section — strategy=mobile + the `performance` category,
 * plus a viewport-meta sanity check pulled from the same Lighthouse run.
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
  if (score >= 50) return "warning";
  return "fail";
}

export async function runMobileAudit(websiteUrl: string): Promise<SectionResult> {
  const r = await runPageSpeed(websiteUrl, "mobile", "performance");
  if (!r) return fail("Mobile speed audit unavailable — PageSpeed API didn't respond.");

  const a = r.audits || {};
  const findings: SectionFinding[] = [];

  // Viewport meta — Lighthouse's `viewport` audit fails when the
  // <meta name="viewport"> tag is missing / malformed. Mobile-fatal.
  const viewport = a["viewport"];
  if (viewport && viewport.score === 0) {
    findings.push({
      severity: "critical",
      title: "Missing or broken viewport meta tag",
      description: "Without a proper <meta name=\"viewport\"> tag the page renders at desktop width on phones and zooms out, killing usability.",
      suggestedFix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> in the page <head>.",
    });
  }

  // Tap target sizing — `tap-targets` audit flags buttons/links too small
  // or too close together for thumb taps on mobile.
  const tapTargets = a["tap-targets"];
  if (tapTargets && (tapTargets.score ?? 1) < 0.9) {
    findings.push({
      severity: "warning",
      title: "Tap targets too small or too close together",
      description: "Mobile users mis-tap when interactive elements are smaller than ~48×48 px or packed without spacing.",
      suggestedFix: "Increase button padding and add at least 8 px of spacing between adjacent interactive elements.",
    });
  }

  // Top opportunities (after the mobile-specific findings).
  for (const o of r.opportunities.slice(0, 5)) {
    findings.push({
      severity: (o.savingsMs ?? 0) > 1000 ? "critical" : "warning",
      title: o.title,
      description: o.description?.slice(0, 240) || "",
      suggestedFix: o.savingsMs ? `Est. savings: ${(o.savingsMs / 1000).toFixed(2)}s` : undefined,
    });
  }

  return {
    score: r.score,
    status: statusFromScore(r.score),
    summary: `Mobile performance score is ${r.score}/100. ${findings.length} issue${findings.length === 1 ? "" : "s"} flagged.`,
    findings,
    rawData: {
      viewportScore: viewport?.score ?? null,
      tapTargetsScore: tapTargets?.score ?? null,
    },
  };
}
