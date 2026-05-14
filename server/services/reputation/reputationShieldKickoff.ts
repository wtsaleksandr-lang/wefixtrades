/**
 * ReputationShield post-checkout kickoff. Mirrors the MapGuard pattern:
 * atomic claim via `metadata.reputationshield_kickoff_at`, then sends the
 * ReputationShield-specific welcome email that walks the customer through
 * Google Business Profile OAuth.
 *
 * Concurrent callers (Stripe webhook retries, admin manual activation)
 * lose the conditional UPDATE and bail as already-kicked-off — no
 * duplicate emails.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { clientServices } from "@shared/schema";
import { storage } from "../../storage";
import { sendReputationShieldWelcome } from "../../lib/reputationShieldWelcomeEmail";
import { createLogger } from "../../lib/logger";

const log = createLogger("reputationshield-kickoff");

const TIER_LABELS: Record<string, "Basic" | "Pro" | "Premium"> = {
  "reputationshield-basic": "Basic",
  "reputationshield-pro": "Pro",
  "reputationshield-premium": "Premium",
};

export async function kickoffReputationShieldService(
  clientId: number,
  clientServiceId: number,
  serviceId: string,
): Promise<{ kickedOff: boolean; reason?: string }> {
  if (!serviceId.startsWith("reputationshield")) {
    return { kickedOff: false, reason: "not_reputationshield" };
  }

  // Atomic claim — same pattern as mapguardTaskEngine.kickoffMapguardService.
  const claimedAt = new Date().toISOString();
  const claimed = await db.update(clientServices)
    .set({
      metadata: sql`COALESCE(${clientServices.metadata}, '{}'::jsonb) || ${JSON.stringify({ reputationshield_kickoff_at: claimedAt })}::jsonb`,
      updated_at: new Date(),
    })
    .where(and(
      eq(clientServices.id, clientServiceId),
      sql`(${clientServices.metadata}->>'reputationshield_kickoff_at') IS NULL`,
    ))
    .returning({ id: clientServices.id });

  if (claimed.length === 0) {
    return { kickedOff: false, reason: "already_kicked_off" };
  }

  const client = await storage.getClientById(clientId);
  if (!client?.contact_email) {
    log.warn(`Client ${clientId} has no contact_email — skipping welcome`);
    return { kickedOff: true, reason: "no_email" };
  }

  const baseUrl = process.env.APP_URL || "https://wefixtrades.com";
  const tierLabel = TIER_LABELS[serviceId] ?? "Basic";

  try {
    await sendReputationShieldWelcome({
      toEmail: client.contact_email,
      businessName: client.business_name || "your business",
      tierLabel,
      portalUrl: `${baseUrl}/portal/reviews`,
      connectGoogleUrl: `${baseUrl}/portal/reviews?action=connect-google`,
    });
  } catch (err: any) {
    log.warn(`Welcome email failed for client ${clientId}: ${err.message}`);
    // We don't roll back the kickoff stamp — the customer can re-send from the
    // admin UI if the email send specifically failed.
  }

  // Audit trail
  await storage.logAdminActivity({
    actor_type: "system",
    actor_name: "Stripe Webhook",
    action: "reputationshield.kickoff",
    entity_type: "client_service",
    entity_id: clientServiceId,
    summary: `ReputationShield ${tierLabel} activated for ${client.business_name}`,
  }).catch(() => { /* logging is best-effort */ });

  return { kickedOff: true };
}
