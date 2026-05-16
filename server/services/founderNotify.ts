/**
 * Founder notification dispatcher (Phase 3e-ii-a).
 *
 * notifyFounder() is how the AI escalates to the human. It ALWAYS writes an
 * admin_notices row — the durable agenda the founder reads in the dashboard —
 * and, for any admin whose ai_contact_method is "sms" / "whatsapp", also
 * pings their personal number via Twilio.
 *
 * Safe-fail: never throws. A notification failure must not break the AI flow
 * that triggered it.
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import { users, adminNotices } from "@shared/schema";
import { sendSMS, isTwilioConfigured } from "../twilioClient";
import { createLogger } from "../lib/logger";

const log = createLogger("FounderNotify");

export interface FounderNotice {
  /** Stable notice type, e.g. "inbound_email_uncertain". */
  type: string;
  /** One-line headline for the agenda + the SMS/WhatsApp ping. */
  title: string;
  /** The full summary the founder reads in the dashboard agenda. */
  summary: string;
  /** Optional link target — e.g. "support_ticket" + the ticket id. */
  entityType?: string;
  entityId?: number;
}

/** Cap on the SMS / WhatsApp ping body. */
const PING_MAX = 320;

/**
 * Escalate something to the founder. Writes an agenda notice and pings any
 * admin who chose SMS / WhatsApp. Returns the created notice id (or null on a
 * write failure). Never throws.
 */
export async function notifyFounder(notice: FounderNotice): Promise<number | null> {
  let noticeId: number | null = null;

  // 1. The durable agenda notice — always written.
  try {
    const [row] = await db
      .insert(adminNotices)
      .values({
        type: notice.type,
        title: notice.title,
        summary: notice.summary,
        entity_type: notice.entityType ?? null,
        entity_id: notice.entityId ?? null,
      })
      .returning({ id: adminNotices.id });
    noticeId = row?.id ?? null;
  } catch (err) {
    log.error("notifyFounder: failed to write agenda notice", { error: String(err) });
    return null;
  }

  // 2. Optional SMS / WhatsApp ping, per each admin's chosen method.
  try {
    const admins = await db
      .select({ method: users.ai_contact_method, phone: users.ai_contact_phone })
      .from(users)
      .where(eq(users.role, "admin"));

    const ping = `WeFixTrades AI needs your input:\n${notice.title}\n\nOpen the agenda in your admin dashboard for details.`.slice(0, PING_MAX);

    for (const admin of admins) {
      if ((admin.method !== "sms" && admin.method !== "whatsapp") || !admin.phone) continue;
      if (!isTwilioConfigured()) {
        log.warn("notifyFounder: Twilio not configured — agenda notice only");
        break;
      }
      try {
        await sendSMS(admin.phone, ping, admin.method === "whatsapp" ? "whatsapp" : "sms");
        log.info(`notifyFounder: pinged founder via ${admin.method}`);
      } catch (err) {
        log.error(`notifyFounder: ${admin.method} ping failed`, { error: String(err) });
      }
    }
  } catch (err) {
    log.error("notifyFounder: admin lookup / ping failed", { error: String(err) });
  }

  return noticeId;
}
