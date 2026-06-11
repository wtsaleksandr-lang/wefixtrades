/**
 * Per-prospect AI personalization worker (P1-2, deferred).
 *
 * Each tick: pick a small batch of campaign_prospects rows that are still
 * `sync_status = 'pending'` (assigned but not yet pushed to the outreach
 * platform) whose prospect has NO personalization tokens yet, and — when the
 * campaign has a sequence requesting AI personalization — generate the four
 * token fields via personalizeForProspect() and persist them onto
 * prospect_enrichment. The outbound sync worker (separate job) then merges
 * ai_first_line / ai_offer_angle / ai_cta_variant / ai_reason_to_target into
 * the platform lead payload as custom fields.
 *
 * WHY a worker and not the assign endpoint: assignment may select hundreds of
 * prospects; doing N AI calls inline would block the admin's HTTP request for
 * minutes (and time out behind proxies). Same deferred pattern as
 * artifactOutreachWorker.ts — the route stays fast, the worker catches up
 * within minutes, and the email template falls back to its default copy for
 * any lead that races ahead of personalization.
 *
 * Inert unless OUTREACH_PERSONALIZATION_ENABLED=true (mirrors the
 * ARTIFACT_OUTREACH_ENABLED convention). Rate-capped per tick
 * (OUTREACH_PERSONALIZATION_BATCH, default 12, max 50) because each prospect
 * costs one Haiku call (cheap, ~$0.001, but unbounded batches are never free).
 *
 * Idempotent: a prospect whose enrichment row already carries an
 * ai_first_line is filtered out in SQL AND re-checked in the loop (belt and
 * braces), so re-runs never overwrite or double-spend. Per-prospect failures
 * are logged and counted without killing the batch.
 */
import { db } from "../db";
import {
  prospects,
  prospectEnrichment,
  campaignProspects,
  outreachSequences,
  outreachSequenceSteps,
  type Prospect,
  type InsertProspectEnrichment,
} from "@shared/schema";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import {
  personalizeForProspect,
  type PersonalizationTokens,
  type PersonalizeContext,
} from "../services/copyEngine";

const log = createLogger("PersonalizationWorker");

export function outreachPersonalizationEnabled(): boolean {
  return process.env.OUTREACH_PERSONALIZATION_ENABLED === "true";
}

export function personalizationBatchSize(): number {
  const n = Number(process.env.OUTREACH_PERSONALIZATION_BATCH);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 12;
}

export interface PersonalizationCandidate {
  campaign_id: number;
  prospect: Prospect;
  /** Existing token on the enrichment row (null/empty = needs personalization). */
  existing_first_line: string | null;
}

/**
 * IO surface, injectable for tests (same approach as trialLifecycleWorker):
 * the worker's control flow — flag gate, batch cap, skip-existing, per-prospect
 * failure isolation — is exercised against fakes; the default implementation
 * binds to the real DB + the copy engine (which routes through the
 * multi-provider aiService fallback chain).
 */
export interface PersonalizationIo {
  fetchCandidates(limit: number): Promise<PersonalizationCandidate[]>;
  /** PersonalizeContext for a campaign, or null when no sequence on it requests AI personalization. */
  getContext(campaignId: number): Promise<PersonalizeContext | null>;
  personalize(prospect: Prospect, ctx: PersonalizeContext): Promise<PersonalizationTokens>;
  persistTokens(prospectId: number, tokens: PersonalizationTokens): Promise<void>;
}

export interface PersonalizationResult {
  enabled: boolean;
  scanned: number;
  personalized: number;
  /** Already-tokened prospects + campaigns with no ai_personalize sequence. */
  skipped: number;
  failed: number;
}

/**
 * Returns a PersonalizeContext for a campaign IFF it has at least one
 * sequence with an ai_personalize step (header flag, or any opted-in step).
 * Null when no sequence requests personalization — the worker is then a
 * no-op for that campaign's leads.
 */
export async function getPersonalizationContext(
  campaignId: number
): Promise<PersonalizeContext | null> {
  const seqs = await db
    .select()
    .from(outreachSequences)
    .where(and(
      eq(outreachSequences.campaign_id, campaignId),
      eq(outreachSequences.ai_personalize, true),
    ))
    .orderBy(desc(outreachSequences.updated_at))
    .limit(1);

  let seq = seqs[0];

  // The header flag may be off while an individual step opts in — also accept
  // a sequence on this campaign that has any ai_personalize step.
  if (!seq) {
    const stepSeqs = await db
      .select({ s: outreachSequences })
      .from(outreachSequenceSteps)
      .innerJoin(outreachSequences, eq(outreachSequences.id, outreachSequenceSteps.sequence_id))
      .where(and(
        eq(outreachSequences.campaign_id, campaignId),
        eq(outreachSequenceSteps.ai_personalize, true),
      ))
      .orderBy(desc(outreachSequences.updated_at))
      .limit(1);
    seq = stepSeqs[0]?.s;
  }

  if (!seq) return null;

  return {
    icp: seq.icp || "local home-services business",
    painPoint: seq.pain_point || "losing after-hours leads with no instant-quote tool",
    offer: seq.offer || "WeFixTrades instant-quote widget",
  };
}

/** Upsert the four AI personalization tokens onto prospect_enrichment. */
export async function upsertPersonalizationTokens(
  prospectId: number,
  tokens: PersonalizationTokens
): Promise<void> {
  const [existing] = await db
    .select({ id: prospectEnrichment.id })
    .from(prospectEnrichment)
    .where(eq(prospectEnrichment.prospect_id, prospectId))
    .limit(1);

  const fields = {
    ai_first_line: tokens.ai_first_line,
    ai_reason_to_target: tokens.ai_reason_to_target,
    ai_offer_angle: tokens.ai_offer_angle,
    ai_cta_variant: tokens.ai_cta_variant,
    updated_at: new Date(),
  };

  if (existing) {
    await db.update(prospectEnrichment)
      .set(fields)
      .where(eq(prospectEnrichment.id, existing.id));
  } else {
    await db.insert(prospectEnrichment).values({
      prospect_id: prospectId,
      ...fields,
    } as InsertProspectEnrichment);
  }
}

const defaultIo: PersonalizationIo = {
  async fetchCandidates(limit) {
    // Assigned-but-not-yet-pushed leads whose prospect lacks tokens. The sync
    // worker only pushes sync_status='pending' rows, so this is exactly the
    // "still time to personalize" window. DNC prospects are excluded — the
    // sync worker would drop them anyway; no point spending AI on them.
    const rows = await db
      .select({
        campaign_id: campaignProspects.campaign_id,
        p: prospects,
        existing_first_line: prospectEnrichment.ai_first_line,
      })
      .from(campaignProspects)
      .innerJoin(prospects, eq(prospects.id, campaignProspects.prospect_id))
      .leftJoin(prospectEnrichment, eq(prospectEnrichment.prospect_id, prospects.id))
      .where(and(
        eq(campaignProspects.sync_status, "pending"),
        eq(prospects.do_not_contact, false),
        sql`${prospects.primary_email} IS NOT NULL`,
        or(
          isNull(prospectEnrichment.id),
          isNull(prospectEnrichment.ai_first_line),
          eq(prospectEnrichment.ai_first_line, ""),
        ),
      ))
      .limit(limit);
    return rows.map((r) => ({
      campaign_id: r.campaign_id,
      prospect: r.p,
      existing_first_line: r.existing_first_line ?? null,
    }));
  },
  getContext: getPersonalizationContext,
  personalize: personalizeForProspect,
  persistTokens: upsertPersonalizationTokens,
};

export async function processOutreachPersonalization(
  io: PersonalizationIo = defaultIo
): Promise<PersonalizationResult> {
  const result: PersonalizationResult = {
    enabled: false, scanned: 0, personalized: 0, skipped: 0, failed: 0,
  };
  if (!outreachPersonalizationEnabled()) return result;
  result.enabled = true;

  const candidates = await io.fetchCandidates(personalizationBatchSize());
  result.scanned = candidates.length;
  if (candidates.length === 0) return result;

  // One context lookup per campaign per tick (a batch is usually one or two
  // campaigns deep — no need to re-query per prospect). `null` is a valid
  // cached value: "this campaign doesn't request personalization".
  const ctxCache = new Map<number, PersonalizeContext | null>();

  for (const cand of candidates) {
    // Idempotency belt-and-braces: SQL already filters tokened prospects, but
    // a row personalized earlier in THIS batch (duplicate campaign rows) or by
    // a concurrent admin action must never be overwritten / double-billed.
    if (cand.existing_first_line && cand.existing_first_line.trim().length > 0) {
      result.skipped++;
      continue;
    }

    let ctx: PersonalizeContext | null | undefined = ctxCache.get(cand.campaign_id);
    if (ctx === undefined) {
      try {
        ctx = await io.getContext(cand.campaign_id);
        ctxCache.set(cand.campaign_id, ctx);
      } catch (err: any) {
        // Context lookup failure is campaign-scoped — count this lead failed,
        // and DON'T cache, so the next tick (or next lead) retries the lookup.
        result.failed++;
        log.warn("personalization context lookup failed", {
          campaign_id: cand.campaign_id,
          prospect_id: cand.prospect.id,
          error: err.message,
        });
        continue;
      }
    }
    if (!ctx) {
      // Campaign has no ai_personalize sequence — nothing to generate.
      result.skipped++;
      continue;
    }

    try {
      const tokens = await io.personalize(cand.prospect, ctx);
      await io.persistTokens(cand.prospect.id, tokens);
      result.personalized++;
    } catch (err: any) {
      // Per-prospect failure must not kill the batch — log + move on. The
      // prospect stays token-less, so the next tick retries it naturally
      // (transient AI/provider errors heal; the sync worker's template
      // fallback covers the rare lead that never personalizes).
      result.failed++;
      log.warn("personalize failed", {
        prospect_id: cand.prospect.id,
        campaign_id: cand.campaign_id,
        error: err.message,
      });
    }
  }

  if (result.scanned > 0) {
    log.info("personalization tick", {
      scanned: result.scanned,
      personalized: result.personalized,
      skipped: result.skipped,
      failed: result.failed,
    });
  }
  return result;
}
