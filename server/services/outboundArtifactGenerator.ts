/**
 * Artifact-first outbound — per-prospect artifact generator.
 *
 * For each approved cold prospect we generate a REAL, personalized
 * local-visibility audit of THEIR business (the same engine behind the public
 * /tools/free-audit), hosted at a public, no-login, view-tracked link
 * (/audit/report/<uuid>). The outbound sync worker then merges the link +
 * score + a specific finding into the cold email, so the first touch is
 * "I already audited your business — here's what I found" instead of a pitch.
 *
 * This reuses the live audit endpoint (POST /api/audit/generate) verbatim via
 * an in-process HTTP call — deliberately NOT refactoring the 600-line audit
 * handler, so the customer-facing audit can never regress from this path. The
 * audit caches per place_id for 24h, so re-runs are cheap.
 *
 * SAFETY: inert unless ARTIFACT_OUTREACH_ENABLED=true. Each audit spends
 * Outscraper + PageSpeed API credits, so the worker that calls this is
 * rate-capped per tick.
 */
import { db } from "../db";
import { prospects, prospectEnrichment } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("ArtifactGen");

export function artifactOutreachEnabled(): boolean {
  return process.env.ARTIFACT_OUTREACH_ENABLED === "true";
}

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || "https://wefixtrades.com").replace(/\/+$/, "");
}

type ProspectRow = typeof prospects.$inferSelect;

export interface ArtifactResult {
  status: "generated" | "skipped" | "failed";
  reason?: string;
  reportId?: string;
  url?: string;
  score?: number;
}

/** Call the live audit engine in-process. Returns the saved report or throws. */
async function runAudit(business: { name: string; placeId?: string | null; website?: string | null; phone?: string | null }): Promise<{ reportId: string; auditData: any }> {
  const port = process.env.PORT || "5000";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000); // audits run PageSpeed + Outscraper; allow time
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/audit/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business: {
          name: business.name,
          placeId: business.placeId || undefined,
          website: business.website || undefined,
          phone: business.phone || undefined,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`audit ${res.status}: ${body.slice(0, 200)}`);
    }
    const json: any = await res.json();
    if (!json?.reportId) throw new Error("audit returned no reportId");
    return { reportId: String(json.reportId), auditData: json.report_json ?? {} };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pick the single most compelling, true finding from the audit to lead the
 * cold email with. Order = strongest hook first. Returns a short clause that
 * reads naturally after the business name, e.g. "is only showing up for 2 of
 * 12 key searches in {city}".
 */
function deriveHeadline(auditData: any, city: string): string {
  const s = auditData?.scores ?? {};
  const biz = auditData?.business ?? {};
  const reviews = Number(biz.reviewsCount ?? 0);
  const areaAvgReviews = Number(auditData?.areaAverageReviews ?? 0);
  const mobileSpeed = Number(auditData?.speedData?.mobile?.score ?? NaN);
  const cov = s.keywordCoverage ?? {};
  const where = city ? ` in ${city}` : "";

  // 1) Search-visibility gap (the most persuasive for trades).
  if (cov && typeof cov.ranked === "number" && typeof cov.tested === "number" && cov.tested > 0 && cov.ranked / cov.tested < 0.5) {
    return `is only ranking for ${cov.ranked} of ${cov.tested} key searches${where}`;
  }
  // 2) Review deficit vs local competitors.
  if (areaAvgReviews > 0 && reviews < areaAvgReviews * 0.6) {
    return `has ${reviews} Google reviews while nearby competitors average ${Math.round(areaAvgReviews)}`;
  }
  // 3) Slow mobile site.
  if (!Number.isNaN(mobileSpeed) && mobileSpeed < 50) {
    return `has a website that scores ${mobileSpeed}/100 for mobile speed`;
  }
  // 4) Low overall presence — fall back to the headline score.
  const total = Number(s.total ?? NaN);
  if (!Number.isNaN(total)) {
    return `scores ${total}/100 on local visibility — with a few clear gaps`;
  }
  return `has a few clear local-visibility gaps we can close`;
}

/** Generate (or reuse cached) audit artifact for one prospect; writes enrichment. */
export async function generateArtifactForProspect(prospect: ProspectRow): Promise<ArtifactResult> {
  // Need at least a name; place_id makes the audit far richer + cacheable.
  const name = (prospect.business_name || "").trim();
  if (!name || !prospect.google_place_id) {
    await writeEnrichment(prospect.id, { artifact_status: "skipped", artifact_error: "missing business_name or google_place_id" });
    return { status: "skipped", reason: "missing name/place_id" };
  }

  try {
    const { reportId, auditData } = await runAudit({
      name,
      placeId: prospect.google_place_id,
      website: prospect.website_url,
      phone: prospect.primary_phone,
    });

    const score = Number(auditData?.scores?.total);
    const grade = auditData?.scores?.grade ? String(auditData.scores.grade) : null;
    const city = (prospect.city || auditData?.city || "").toString();
    const headline = deriveHeadline(auditData, city);
    const url = `${publicBaseUrl()}/audit/report/${reportId}`;

    // A finding-led opener the platform can use verbatim as {{personalization}}.
    const opener = `I ran a quick local-visibility check on ${name} and noticed it ${headline}. I put the full breakdown here (no signup): ${url}`;

    await writeEnrichment(prospect.id, {
      artifact_type: "audit",
      artifact_status: "generated",
      artifact_ref_id: reportId,
      artifact_url: url,
      artifact_score: Number.isFinite(score) ? Math.round(score) : null,
      artifact_grade: grade,
      artifact_headline: headline,
      artifact_generated_at: new Date(),
      artifact_error: null,
      // Refresh the cold-email opener + CTA so the existing send path carries it.
      ai_first_line: opener,
      ai_personalization_line: opener,
      ai_cta_variant: "free audit",
    });

    log.info("artifact generated", { prospect_id: prospect.id, reportId, score: Number.isFinite(score) ? Math.round(score) : null });
    return { status: "generated", reportId, url, score: Number.isFinite(score) ? Math.round(score) : undefined };
  } catch (err: any) {
    const reason = err?.message?.slice(0, 300) || "unknown error";
    await writeEnrichment(prospect.id, { artifact_status: "failed", artifact_error: reason });
    log.warn("artifact generation failed", { prospect_id: prospect.id, error: reason });
    return { status: "failed", reason };
  }
}

/** Upsert the enrichment row (one-to-one with prospect) with the given fields. */
async function writeEnrichment(prospectId: number, fields: Record<string, unknown>): Promise<void> {
  const [existing] = await db.select({ id: prospectEnrichment.id })
    .from(prospectEnrichment).where(eq(prospectEnrichment.prospect_id, prospectId)).limit(1);
  if (existing) {
    await db.update(prospectEnrichment)
      .set({ ...fields, updated_at: new Date() })
      .where(eq(prospectEnrichment.id, existing.id));
  } else {
    await db.insert(prospectEnrichment).values({ prospect_id: prospectId, ...(fields as any) });
  }
}
