/**
 * Embed Broken Detector
 *
 * Daily worker that identifies published calculators with zero views
 * in the last 14 days (and created more than 14 days ago). These are
 * likely embeds that broke or were removed. Fires a system alert for
 * each detection so admins can investigate.
 */

import { db } from "../db";
import { calculators, analyticsEvents, deploymentStatus } from "@shared/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { fireAlert } from "../services/alertService";
import { createLogger } from "../lib/logger";

const log = createLogger("EmbedBrokenDetector");

const LOOKBACK_DAYS = 14;

export async function processEmbedBrokenDetection(): Promise<{ checked: number; alerted: number }> {
  const fourteenDaysAgo = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Find published calculators created more than 14 days ago
  const publishedCalcs = await db
    .select({
      id: calculators.id,
      slug: calculators.slug,
      business_name: calculators.business_name,
      owner_email: calculators.owner_email,
      created_at: calculators.created_at,
    })
    .from(calculators)
    .innerJoin(deploymentStatus, eq(deploymentStatus.calculator_id, calculators.id))
    .where(
      and(
        eq(deploymentStatus.status, "live"),
        lte(calculators.created_at, fourteenDaysAgo),
      )
    );

  let alerted = 0;

  for (const calc of publishedCalcs) {
    // Count view events in the last 14 days
    const [viewCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.calculator_id, calc.id),
          eq(analyticsEvents.event_type, "view"),
          gte(analyticsEvents.created_at, fourteenDaysAgo),
        )
      );

    if ((viewCount?.count ?? 0) === 0) {
      log.warn("Zero-view published calculator detected", {
        calculatorId: calc.id,
        slug: calc.slug,
        businessName: calc.business_name,
      });

      await fireAlert({
        severity: "warning",
        category: "embed_broken",
        title: `Calculator "${calc.business_name}" (${calc.slug}) has 0 views in ${LOOKBACK_DAYS} days`,
        details: `Published calculator #${calc.id} has received zero views in the last ${LOOKBACK_DAYS} days. The embed may be broken or removed. Owner: ${calc.owner_email || "unknown"}`,
        metadata: {
          calculator_id: calc.id,
          slug: calc.slug,
          owner_email: calc.owner_email,
        },
      });

      alerted++;
    }
  }

  log.info("Embed broken detection complete", { checked: publishedCalcs.length, alerted });
  return { checked: publishedCalcs.length, alerted };
}
