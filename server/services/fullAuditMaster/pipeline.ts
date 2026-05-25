/**
 * Master Audit pipeline — orchestrates the 5 paid-tier section audits
 * (speed, mobile, SEO, accessibility, security) in parallel via
 * Promise.allSettled. One section's failure (timeout, API hiccup, parse
 * error) must never block the others.
 *
 * Wave 3.6 (2026-05-25). Replaces the PR #817 placeholder that just
 * returned `{ placeholder: true, ... }`.
 *
 * Per-section 30s hard timeout. Failed sections degrade to a {status:
 * "fail", summary: "Section timed out"} envelope instead of crashing the
 * whole report. If more than 2 of 5 sections fail, the orchestrator
 * retries those failed sections once before giving up.
 *
 * Free-audit sections (gbp / competitors / reviews) are intentionally
 * *not* re-run here — they require the upstream Places resolution
 * that only happens inside the free /audit/generate path. v1 of the
 * Master Audit focuses on the 5 paid-tier sections; a future wave can
 * thread the free-audit pipeline result through if the customer has
 * already run one.
 */
import { runSpeedAudit } from "./speedAudit";
import { runMobileAudit } from "./mobileAudit";
import { runSeoAudit } from "./seoAudit";
import { runAccessibilityAudit } from "./accessibilityAudit";
import { runSecurityAudit } from "./securityAudit";
import { MasterAuditReportSchema, type MasterAuditReport, type SectionResult } from "./types";
import { createLogger } from "../../lib/logger";

const log = createLogger("full-audit-master-pipeline");

const SECTION_TIMEOUT_MS = 30_000;
const TIMEOUT_RESULT: SectionResult = {
  score: 0,
  status: "fail",
  summary: "Section timed out — try again later.",
  findings: [],
};

type SectionKey = "speed" | "mobile" | "seo" | "accessibility" | "security";

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); },
    );
  });
}

async function runOneSection(
  key: SectionKey,
  websiteUrl: string,
): Promise<SectionResult> {
  switch (key) {
    case "speed":         return runSpeedAudit(websiteUrl);
    case "mobile":        return runMobileAudit(websiteUrl);
    case "seo":           return runSeoAudit(websiteUrl);
    case "accessibility": return runAccessibilityAudit(websiteUrl);
    case "security":      return runSecurityAudit(websiteUrl);
  }
}

async function runAllSections(websiteUrl: string): Promise<Record<SectionKey, SectionResult>> {
  const keys: SectionKey[] = ["speed", "mobile", "seo", "accessibility", "security"];
  const results = await Promise.allSettled(
    keys.map((k) => withTimeout(runOneSection(k, websiteUrl), SECTION_TIMEOUT_MS, TIMEOUT_RESULT)),
  );
  const out: Record<SectionKey, SectionResult> = {} as any;
  results.forEach((r, i) => {
    out[keys[i]] = r.status === "fulfilled" ? r.value : TIMEOUT_RESULT;
  });
  return out;
}

function computeOverall(sections: Record<SectionKey, SectionResult>): number {
  const scores = Object.values(sections).map((s) => s.score);
  if (scores.length === 0) return 0;
  // Simple equal-weight average across the 5 sections, rounded.
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export interface RunMasterAuditInput {
  orderId: string;
  websiteUrl: string;
  businessName: string;
}

/**
 * Run the full 5-section pipeline. Returns a validated MasterAuditReport.
 * Throws only if the report can't be assembled at all (e.g. inputs are
 * malformed). Section failures are reflected in the report itself.
 */
export async function runFullAuditMaster(input: RunMasterAuditInput): Promise<MasterAuditReport> {
  const t0 = Date.now();
  log.info("pipeline starting", { orderId: input.orderId, websiteUrl: input.websiteUrl });

  let sections = await runAllSections(input.websiteUrl);

  // Anti-regression: if more than 2 of 5 sections failed, retry the
  // failed ones once. Don't recurse — a single targeted retry is enough.
  const failedKeys = (Object.entries(sections) as Array<[SectionKey, SectionResult]>)
    .filter(([, v]) => v.status === "fail")
    .map(([k]) => k);
  if (failedKeys.length > 2) {
    log.warn("retrying failed sections", { failed: failedKeys, orderId: input.orderId });
    const retried = await Promise.allSettled(
      failedKeys.map((k) => withTimeout(runOneSection(k, input.websiteUrl), SECTION_TIMEOUT_MS, TIMEOUT_RESULT)),
    );
    retried.forEach((r, i) => {
      if (r.status === "fulfilled") sections[failedKeys[i]] = r.value;
    });
  }

  const report: MasterAuditReport = {
    orderId: input.orderId,
    websiteUrl: input.websiteUrl,
    businessName: input.businessName,
    generatedAt: new Date().toISOString(),
    overallScore: computeOverall(sections),
    sections,
  };

  // Validate before returning — if our own code drifted from the schema
  // we want to see it loudly rather than ship a malformed payload to the
  // email + share page.
  const parsed = MasterAuditReportSchema.safeParse(report);
  if (!parsed.success) {
    log.error("report failed schema validation", { error: parsed.error.flatten() });
    throw new Error("Master audit report failed schema validation");
  }

  const stillFailed = Object.values(sections).filter((s) => s.status === "fail").length;
  log.info("pipeline complete", {
    orderId: input.orderId,
    ms: Date.now() - t0,
    overallScore: report.overallScore,
    failedSections: stillFailed,
  });

  return parsed.data;
}

/**
 * Half-empty guard — exposed so the webhook handler can decide whether
 * to email the customer the report or trigger the apology-with-refund
 * flow. "More than 2 of 5 failed" matches the spec.
 */
export function isReportHalfEmpty(report: MasterAuditReport): boolean {
  const sections = Object.values(report.sections).filter(Boolean) as SectionResult[];
  if (sections.length === 0) return true;
  const failed = sections.filter((s) => s.status === "fail").length;
  return failed > 2;
}
