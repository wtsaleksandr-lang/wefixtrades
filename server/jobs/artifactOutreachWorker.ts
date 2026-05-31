/**
 * Artifact-first outbound worker.
 *
 * Each tick: pick a small batch of APPROVED prospects that have a Google
 * place_id but no audit artifact yet, and generate one for each (a real
 * local-visibility audit hosted at a public link). The outbound sync worker
 * (separate job) then only pushes prospects whose artifact is ready, so every
 * cold email carries the personalized report link + finding.
 *
 * Inert unless ARTIFACT_OUTREACH_ENABLED=true. Rate-capped per tick
 * (ARTIFACT_OUTREACH_BATCH, default 12) because each audit spends external
 * API credits (Outscraper + PageSpeed).
 */
import { db } from "../db";
import { prospects, prospectEnrichment } from "@shared/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { artifactOutreachEnabled, generateArtifactForProspect } from "../services/outboundArtifactGenerator";

const log = createLogger("ArtifactOutreachWorker");

export interface ArtifactOutreachResult {
  enabled: boolean;
  scanned: number;
  generated: number;
  skipped: number;
  failed: number;
}

function batchSize(): number {
  const n = Number(process.env.ARTIFACT_OUTREACH_BATCH);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : 12;
}

export async function processArtifactOutreach(): Promise<ArtifactOutreachResult> {
  const result: ArtifactOutreachResult = { enabled: false, scanned: 0, generated: 0, skipped: 0, failed: 0 };
  if (!artifactOutreachEnabled()) return result;
  result.enabled = true;

  // Approved + contactable prospects with a place_id whose artifact hasn't been
  // generated yet. We retry 'pending'/null but NOT 'failed' (avoid burning API
  // credits re-running a business the audit can't process) or 'skipped'.
  const rows = await db.select({ p: prospects })
    .from(prospects)
    .leftJoin(prospectEnrichment, eq(prospectEnrichment.prospect_id, prospects.id))
    .where(and(
      inArray(prospects.status, ["approved", "campaign_queued"]),
      eq(prospects.do_not_contact, false),
      sql`${prospects.google_place_id} IS NOT NULL`,
      or(isNull(prospectEnrichment.artifact_status), eq(prospectEnrichment.artifact_status, "pending")),
    ))
    .limit(batchSize());

  result.scanned = rows.length;
  for (const { p } of rows) {
    const r = await generateArtifactForProspect(p);
    if (r.status === "generated") result.generated++;
    else if (r.status === "skipped") result.skipped++;
    else result.failed++;
  }

  if (result.scanned > 0) {
    log.info("artifact outreach tick", { scanned: result.scanned, generated: result.generated, skipped: result.skipped, failed: result.failed });
  }
  return result;
}
