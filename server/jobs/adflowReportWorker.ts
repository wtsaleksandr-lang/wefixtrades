/**
 * AdFlow Monthly Report Worker — RETIRED (Sprint 1)
 *
 * AdFlow has been dropped from the product catalog. White-label
 * agencies handle paid ads instead. This worker is kept as a no-op
 * stub so existing scheduler imports don't break.
 */
import { createLogger } from "../lib/logger";

const log = createLogger("AdflowReport");

export async function processAdflowReports(): Promise<{
  sent: number;
  skipped: number;
  errors: number;
  skipped_missing_current_report: number;
  skipped_already_sent: number;
  skipped_unsubscribed: number;
  skipped_other: number;
}> {
  log.info("[adflow-report] AdFlow retired — skipping report batch.");
  return {
    sent: 0,
    skipped: 0,
    errors: 0,
    skipped_missing_current_report: 0,
    skipped_already_sent: 0,
    skipped_unsubscribed: 0,
    skipped_other: 0,
  };
}
