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
 * Drive ONE speed pass for an artifact run and return the post-speed report.
 *
 * The public audit returns the pre-speed score (PageSpeed runs in the background
 * only once a browser POSTs /api/audit/speed). For artifact-first outreach we
 * need the emailed score to match the rendered report, so we trigger that same
 * endpoint in-process, poll until the speed data lands (the speed worker
 * recomputes + persists the renormalized total), then re-fetch the report.
 *
 * Best-effort and time-bounded (~60s, under the worker's 75s allowance). Returns
 * the post-speed auditData, or null if speed never landed in budget.
 */
async function runSpeedPassAndSnapshot(reportId: string, website: string): Promise<any | null> {
  const port = process.env.PORT || "5000";
  const base = `http://127.0.0.1:${port}/api/audit`;
  try {
    // Kick off the background speed pass (returns immediately).
    const kick = await fetch(`${base}/speed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ website, reportId }),
    }).catch((e) => { log.warn("artifact speed-kick fetch failed", { reportId, error: String(e) }); return null; });
    if (!kick || !kick.ok) {
      log.warn("artifact speed kick failed — using pre-speed score", { reportId });
      return null;
    }
    // Poll for readiness — bounded so we never block the worker indefinitely.
    const deadline = Date.now() + 60_000;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    while (Date.now() < deadline) {
      await sleep(4_000);
      const poll = await fetch(`${base}/speed/${reportId}`).then((r) => r.json()).catch((e) => { log.warn("artifact speed poll failed", { reportId, error: String(e) }); return null; });
      if (poll?.ready) break;
    }
    // Re-fetch the report to snapshot the post-speed (renormalized) score.
    const rep = await fetch(`${base}/report/${reportId}`).then((r) => r.json()).catch((e) => { log.warn("artifact report re-fetch failed", { reportId, error: String(e) }); return null; });
    return rep?.report?.auditData ?? null;
  } catch (err: any) {
    log.warn("artifact speed snapshot errored — using pre-speed score", { reportId, error: err?.message });
    return null;
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

  // Partial-data guards: never assert a gap whose underlying source dropped this
  // run. Without these, a timed-out keyword source reads as "ranking for 0 of 9"
  // and a dropped competitor source reads as a false review deficit — both
  // false claims in a cold opener. A flag is only treated as unavailable when
  // dataQuality explicitly says so (older reports without the block stay truthy).
  const dq = auditData?.dataQuality ?? {};
  const keywordOk = dq.keywordDataAvailable !== false;
  const competitorOk = dq.competitorDataAvailable !== false;

  // 1) Search-visibility gap (the most persuasive for trades).
  if (keywordOk && cov && typeof cov.ranked === "number" && typeof cov.tested === "number" && cov.tested > 0 && cov.ranked / cov.tested < 0.5) {
    return `is only ranking for ${cov.ranked} of ${cov.tested} key searches${where}`;
  }
  // 2) Review deficit vs local competitors (areaAverageReviews comes from the
  //    competitor source, so gate on competitor availability).
  if (competitorOk && areaAvgReviews > 0 && reviews < areaAvgReviews * 0.6) {
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

    // Partial-data gate: an artifact-first cold email leads with a confident,
    // specific finding ("only ranking for X of Y searches"). If the gather timed
    // out or the competitor source dropped, the score is renormalized but the
    // headline can't safely assert a competitive/visibility gap — and a depressed
    // score could still mislead. Skip rather than fire a weak/false opener; the
    // worker can retry the prospect on a later tick when the source recovers.
    const dq = auditData?.dataQuality ?? {};
    const gatherTimedOut = dq.gatherTimedOut === true;
    const competitorDataAvailable = dq.competitorDataAvailable !== false;
    if (gatherTimedOut || !competitorDataAvailable) {
      const reason = gatherTimedOut ? "gather timed out (partial data)" : "competitor data unavailable";
      await writeEnrichment(prospect.id, { artifact_status: "skipped", artifact_error: reason });
      log.warn("artifact skipped — partial data", { prospect_id: prospect.id, reportId, reason });
      return { status: "skipped", reason };
    }

    // Speed-timing for artifacts (P2): /api/audit/generate returns the PRE-speed
    // score because PageSpeed runs in the background only after a browser POSTs
    // /api/audit/speed. For an artifact-first email the score we email MUST equal
    // the score the prospect sees on the rendered report, so we drive one speed
    // pass server-side here and snapshot the post-speed report. Best-effort and
    // bounded — if speed never lands we fall back to the (renormalized) pre-speed
    // score rather than block the artifact.
    let finalAuditData = auditData;
    const website = (auditData?.business?.website || prospect.website_url || "").toString();
    if (website) {
      const post = await runSpeedPassAndSnapshot(reportId, website);
      if (post) finalAuditData = post;
    }

    const score = Number(finalAuditData?.scores?.total);
    const grade = finalAuditData?.scores?.grade ? String(finalAuditData.scores.grade) : null;
    const city = (prospect.city || finalAuditData?.city || "").toString();
    const headline = deriveHeadline(finalAuditData, city);
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
