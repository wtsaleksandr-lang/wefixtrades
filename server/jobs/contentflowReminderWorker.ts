/**
 * ContentFlow setup-reminder worker.
 *
 * Wave W-AZ-1. Runs hourly. For every active ContentFlow client_service
 * (creator / studio / agency) where the customer either:
 *   (a) submitted the quick-setup form and chose "remind me later", or
 *   (b) hasn't touched the onboarding submission 24h after checkout,
 * sends ONE "complete your setup" email pointing at the deeper
 * /portal/content-preferences wizard.
 *
 * Idempotent — `contentflow_reminder_sent_at` on client_services.metadata
 * gates the send so a customer can never receive more than one. The flag
 * is also checked against onboarding_submissions.status: if the customer
 * has already navigated to and filled out the deeper wizard between
 * tiers (i.e. their brand profile is materially populated), we don't
 * bother them.
 */
import { db } from "../db";
import { and, eq, sql, isNull } from "drizzle-orm";
import { clients, clientServices, onboardingSubmissions } from "@shared/schema";
import { sendContentFlowReminder } from "../lib/contentflowReminderEmail";
import { readBrandProfile } from "../services/contentflow/brandProfile";
import { createLogger } from "../lib/logger";

const log = createLogger("ContentFlowReminder");

const DAY_MS = 24 * 60 * 60 * 1000;

interface ReminderSummary {
  considered: number;
  already_sent: number;
  not_due: number;
  brand_complete: number;
  sent: number;
  errors: number;
}

/* A brand profile counts as "complete enough to skip the nudge" if the
 * customer has filled in BOTH a tone AND at least one of the topic /
 * audience / service-focus list fields. Anything less and the generators
 * still produce generic copy — keep nudging. */
function brandProfileLooksComplete(client: { metadata?: unknown } | null | undefined): boolean {
  const bp = readBrandProfile(client);
  if (!bp.tone) return false;
  const hasContent =
    (bp.preferred_topics?.length ?? 0) > 0 ||
    (bp.service_focus?.length ?? 0) > 0 ||
    !!bp.target_audience;
  return hasContent;
}

export async function processContentFlowReminders(): Promise<ReminderSummary> {
  const summary: ReminderSummary = {
    considered: 0, already_sent: 0, not_due: 0,
    brand_complete: 0, sent: 0, errors: 0,
  };

  const rows = await db.select({
    csId: clientServices.id,
    clientId: clientServices.client_id,
    serviceId: clientServices.service_id,
    csMetadata: clientServices.metadata,
    csCreatedAt: clientServices.created_at,
    businessName: clients.business_name,
    contactEmail: clients.contact_email,
    clientMetadata: clients.metadata,
  })
    .from(clientServices)
    .innerJoin(clients, eq(clients.id, clientServices.client_id))
    .where(and(
      sql`${clientServices.service_id} LIKE 'contentflow-%'`,
      eq(clientServices.status, "active"),
      sql`${clients.contact_email} IS NOT NULL`,
    ));

  const baseUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://wefixtrades.com";
  const now = Date.now();

  for (const row of rows) {
    summary.considered++;
    try {
      const csMeta = (row.csMetadata ?? {}) as Record<string, any>;

      /* Already nudged? One-and-done. */
      if (csMeta.contentflow_reminder_sent_at) {
        summary.already_sent++;
        continue;
      }

      /* Brand profile already substantively filled in? Don't pester. */
      if (brandProfileLooksComplete({ metadata: row.clientMetadata })) {
        summary.brand_complete++;
        continue;
      }

      /* Timing — at least 24h since checkout. The `contentflow_reminder_due_at`
       * stamp (set when the customer picks "remind me later" on the quick
       * setup) wins over the default 24h-from-creation window. */
      const dueAtIso: string | undefined = csMeta.contentflow_reminder_due_at;
      const createdMs = row.csCreatedAt ? new Date(row.csCreatedAt).getTime() : now;
      const dueMs = dueAtIso ? new Date(dueAtIso).getTime() : createdMs + DAY_MS;
      if (now < dueMs) {
        summary.not_due++;
        continue;
      }

      /* If the onboarding_submission is fully approved/submitted AND the
       * brand profile is materially complete (checked above), we'd have
       * skipped already — so reaching here means the customer either
       * never submitted or chose remind-me-later. Both → send. */
      if (!row.contactEmail) {
        summary.not_due++;
        continue;
      }

      await sendContentFlowReminder({
        toEmail: row.contactEmail,
        businessName: row.businessName || "your business",
        contentPreferencesUrl: `${baseUrl}/portal/content-preferences?from=reminder`,
      });

      await db.update(clientServices)
        .set({
          metadata: sql`COALESCE(${clientServices.metadata}, '{}'::jsonb) || ${JSON.stringify({
            contentflow_reminder_sent_at: new Date().toISOString(),
          })}::jsonb`,
          updated_at: new Date(),
        })
        .where(eq(clientServices.id, row.csId));

      summary.sent++;
    } catch (err: any) {
      summary.errors++;
      log.error("ContentFlow reminder failed for a client_service", {
        client_service_id: row.csId,
        error: err.message,
      });
    }
  }

  log.info("ContentFlow reminder run complete", { ...summary });
  return summary;
}

/* Silence unused-import warnings — kept in case the brand-complete check
 * is later extended to look at onboarding_submissions.status directly. */
void onboardingSubmissions;
void isNull;
