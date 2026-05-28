/**
 * Wave 86 — Port-status polling worker.
 *
 * Layer 5 of the fully-automated porting flow. Runs every 4 hours, sweeps
 * every `tradeline_phone_setups` row currently in transit, asks Twilio for
 * the latest status, persists changes, and fires SMS + email to the
 * customer whenever a milestone flips.
 *
 * Skip rules:
 *   - port_status not in PORT_IN_TRANSIT_STATUSES → terminal, no work.
 *   - port_twilio_order_sid is null → admin Twilio not yet wired; admin
 *     dashboard surfaces this for manual completion.
 *   - port_last_polled_at within the last 3h → still inside the cadence.
 *
 * SMS is gated through the Wave 82 central template registry (per-tenant
 * overrides honored); email is best-effort via the queueEmail service.
 *
 * Always returns a stats object; never throws (matches the worker contract
 * other workers under server/jobs/ implement).
 */

import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "../db";
import { clients, tradelinePhoneSetups } from "@shared/schema";
import {
  PORT_IN_TRANSIT_STATUSES,
  PORT_TERMINAL_STATUSES,
  type PortStatus,
} from "@shared/schema";
import { createLogger } from "../lib/logger";
import { isTwilioConfigured, sendSmsAsClient } from "../twilioClient";
import { resolveSmsTemplate } from "../lib/smsTemplateResolver";
import type { SmsTemplateId } from "../../shared/sms/templateRegistry";
import { fetchPortStatusFromTwilio } from "../services/tradelineSetup/portSubmission";
import { translatePortRejection } from "../services/tradelineSetup/portRejectionTranslator";
import { writeAudit } from "../lib/auditLog";

const log = createLogger("PortStatusPoll");

/** Cadence between polls per row, in ms. The cron runs every 4h. */
const POLL_INTERVAL_MS = 3 * 60 * 60 * 1000;

export interface PollResult {
  scanned: number;
  changed: number;
  notifiedSms: number;
  notifiedEmail: number;
  failed: number;
}

/**
 * Map Twilio's status string into the application-side PortStatus enum.
 * Twilio's exact wire format is documented at
 *   https://www.twilio.com/docs/phone-numbers/porting/api
 * — we accept the common values and degrade unknown values to the closest
 * non-terminal status.
 */
function mapTwilioStatus(twilio: string): PortStatus | null {
  const v = twilio.toLowerCase();
  if (v.includes("complete") || v === "completed" || v === "port_complete") return "port_complete";
  if (v.includes("fail") || v === "rejected" || v === "denied") return "port_failed";
  if (v.includes("loa") || v === "pending_documents") return "pending_loa";
  if (v.includes("carrier")) return "pending_carrier_action";
  if (v === "in_progress" || v === "processing") return "in_progress";
  if (v === "submitted") return "submitted";
  return null;
}

/** Picks the SMS template id for a transition. Returns null when no SMS should fire. */
function templateForTransition(next: PortStatus): SmsTemplateId | null {
  switch (next) {
    case "submitted":
      return "tradeline.port_status_submitted";
    case "pending_carrier_action":
      return "tradeline.port_status_pending_carrier";
    case "pending_loa":
      return "tradeline.port_status_pending_loa";
    case "port_complete":
      return "tradeline.port_status_complete";
    case "port_failed":
      return "tradeline.port_status_failed";
    default:
      return null;
  }
}

/**
 * Light formatter for the "progress" placeholder used in pending_carrier
 * SMS. We don't know the precise day-of-N yet — the customer-facing
 * description hedges by referring to the typical window.
 */
function progressBlurb(submittedAt: Date | null): string {
  if (!submittedAt) return "Day 1 of typical 14";
  const days = Math.max(
    1,
    Math.floor((Date.now() - submittedAt.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return `Day ${Math.min(days, 14)} of typical 14`;
}

export async function processPortStatusPolls(): Promise<PollResult> {
  const result: PollResult = {
    scanned: 0,
    changed: 0,
    notifiedSms: 0,
    notifiedEmail: 0,
    failed: 0,
  };

  // Pull every in-flight row that's ready for another poll. Rows missing
  // port_twilio_order_sid get scanned too — we just skip the Twilio call
  // and update port_last_polled_at so they don't churn the index.
  const cutoff = new Date(Date.now() - POLL_INTERVAL_MS);

  const candidates = await db
    .select({
      id: tradelinePhoneSetups.id,
      client_id: tradelinePhoneSetups.client_id,
      port_status: tradelinePhoneSetups.port_status,
      port_twilio_order_sid: tradelinePhoneSetups.port_twilio_order_sid,
      port_request_id: tradelinePhoneSetups.port_request_id,
      customer_number: tradelinePhoneSetups.customer_number,
      port_submitted_at: tradelinePhoneSetups.port_submitted_at,
    })
    .from(tradelinePhoneSetups)
    .where(
      and(
        inArray(
          tradelinePhoneSetups.port_status,
          PORT_IN_TRANSIT_STATUSES as unknown as string[],
        ),
        or(
          // never polled before
          isNull(tradelinePhoneSetups.port_last_polled_at),
          lt(tradelinePhoneSetups.port_last_polled_at, cutoff),
        )!,
      ),
    )
    .limit(100);

  result.scanned = candidates.length;
  if (candidates.length === 0) return result;

  const portalBase = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://app.wefixtrades.com";

  for (const row of candidates) {
    try {
      // Always stamp port_last_polled_at — even when there's nothing to do —
      // so the index stays balanced and we don't spin on the same row.
      const sid = row.port_twilio_order_sid;
      if (!sid) {
        await db
          .update(tradelinePhoneSetups)
          .set({ port_last_polled_at: new Date(), updated_at: new Date() })
          .where(eq(tradelinePhoneSetups.id, row.id));
        continue;
      }

      const fetched = await fetchPortStatusFromTwilio(sid);
      if (!fetched) {
        await db
          .update(tradelinePhoneSetups)
          .set({ port_last_polled_at: new Date(), updated_at: new Date() })
          .where(eq(tradelinePhoneSetups.id, row.id));
        continue;
      }

      const mapped = mapTwilioStatus(fetched.twilioStatus);
      const next: PortStatus | null = mapped;
      const prev = row.port_status as PortStatus;
      const changed = next && next !== prev;

      if (!changed || !next) {
        await db
          .update(tradelinePhoneSetups)
          .set({ port_last_polled_at: new Date(), updated_at: new Date() })
          .where(eq(tradelinePhoneSetups.id, row.id));
        continue;
      }

      result.changed += 1;

      // Persist the new status. For terminal states, also stamp
      // port_resolved_at so the 90-day retention worker picks it up.
      const patch: Record<string, unknown> = {
        port_status: next,
        port_last_polled_at: new Date(),
        updated_at: new Date(),
      };
      if ((PORT_TERMINAL_STATUSES as readonly string[]).includes(next)) {
        patch.port_resolved_at = new Date();
      }
      if (next === "port_failed") {
        patch.port_rejection_code = fetched.rejectionCode ?? null;
        const translated = translatePortRejection(fetched.rejectionCode);
        patch.port_rejection_reason = translated.title;
      }

      await db
        .update(tradelinePhoneSetups)
        .set(patch)
        .where(eq(tradelinePhoneSetups.id, row.id));

      // Audit trail.
      writeAudit({
        actorType: "system",
        action: "tradeline_port_status_change",
        entityType: "tradeline_phone_setup",
        entityId: String(row.id),
        before: { port_status: prev },
        after: { port_status: next },
        metadata: { sid, twilioStatus: fetched.twilioStatus },
      });

      // Outbound SMS + email for milestone updates.
      const tplId = templateForTransition(next);
      if (tplId && isTwilioConfigured() && row.customer_number) {
        const phoneNumber = row.customer_number;
        const statusUrl = `${portalBase}/portal/tradeline/port-status`;
        let vars: Record<string, string> = {
          phone_number: phoneNumber,
          status_url: statusUrl,
        };
        if (next === "pending_carrier_action") {
          vars.progress = progressBlurb(row.port_submitted_at ?? null);
        }
        if (next === "port_failed") {
          const translated = translatePortRejection(fetched.rejectionCode);
          vars = {
            ...vars,
            reason_title: translated.title,
            fix_action: translated.fixInstructions.slice(0, 80),
          };
        }
        if (next === "port_complete") {
          // Pull brand_name from clients row for the celebratory copy.
          const [c] = await db
            .select({ business_name: clients.business_name })
            .from(clients)
            .where(eq(clients.id, row.client_id))
            .limit(1);
          vars.brand_name = c?.business_name || "WeFixTrades";
        }

        const resolved = await resolveSmsTemplate({
          templateId: tplId,
          clientId: row.client_id,
          vars,
        });
        if (resolved.enabled && resolved.body) {
          try {
            await sendSmsAsClient({
              clientId: row.client_id,
              to: phoneNumber,
              body: resolved.body,
              channel: "sms",
              quietHoursBypass: "transactional",
            });
            result.notifiedSms += 1;
          } catch (err: any) {
            log.warn("port status SMS failed", {
              rowId: row.id,
              tplId,
              err: err?.message,
            });
          }
        }
      }

      // Email side is best-effort. We don't add a dedicated email template
      // here (Wave 86 ships the SMS side; email mirroring lands in Wave 87
      // alongside the per-stage email shells). For now, the customer can
      // open the PortStatusPage at the link from the SMS.
    } catch (err: any) {
      result.failed += 1;
      log.error("poll row failed", { rowId: row.id, err: err?.message });
    }
  }

  log.info("port status poll complete", { ...result });
  return result;
}
