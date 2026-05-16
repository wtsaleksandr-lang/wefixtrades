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
import { mergeSettings } from "@shared/reputationConfig";
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

  // Provision baseline state — seed a default reputation_settings blob
  // so the customer's portal + the daily workers (reports, monitoring,
  // widget) read sane defaults from day one instead of cold-starting.
  // Idempotent: skip if a settings blob already exists.
  try {
    const svc = await storage.getClientReputationService(clientId);
    if (svc && !svc.metadata?.reputation_settings) {
      const metadata = { ...(svc.metadata ?? {}), reputation_settings: mergeSettings(undefined) };
      await storage.updateClientServiceMetadata(clientId, svc.serviceId, metadata);
    }
  } catch (err: any) {
    log.warn(`Baseline settings seed failed for client ${clientId}: ${err.message}`);
    // Non-fatal — mergeSettings(undefined) is also applied lazily on first read.
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
      // Land new customers on the guided setup wizard, not the raw dashboard.
      connectGoogleUrl: `${baseUrl}/portal/reviews/setup`,
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
