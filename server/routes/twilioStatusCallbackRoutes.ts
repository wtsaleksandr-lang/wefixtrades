/**
 * Wave 78 (W-SMS-4) — Twilio SMS delivery-status callback.
 *
 *   POST /api/twilio/sms-status
 *
 * Twilio fires this webhook on every status transition of an outbound
 * SMS (queued → sending → sent → delivered, or any of those → failed /
 * undelivered). Wired onto every outbound by passing `statusCallback`
 * in server/twilioClient.ts sendSMS().
 *
 * What it does:
 *   1. Verifies the Twilio HMAC signature (toll-fraud / spoofing guard).
 *   2. Looks up the matching `sms_messages` row by MessageSid.
 *   3. Updates status / error_code / error_message / delivered_at /
 *      updated_at.
 *   4. If the error code indicates a hard-bounce (genuinely unreachable
 *      destination handset), records an opt-out so we stop spending on
 *      dead numbers and protect sender reputation. See HARD_BOUNCE_CODES
 *      below for the exact list — landline / blocked / carrier-violation
 *      do NOT auto-opt-out because they can be temporary.
 *   5. For Twilio code 21610 ("Cannot deliver due to opt-out") we
 *      idempotently insert the opt-out record so our local registry
 *      mirrors Twilio's own opt-out state.
 *
 * Returns 200 OK with empty body — Twilio requires a fast, simple
 * response or it retries with exponential backoff.
 */

import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { smsMessages } from "@shared/schema";
import { verifyTwilioSignature, recordSmsOptOut } from "../twilioClient";
import { createLogger } from "../lib/logger";

const log = createLogger("TwilioSmsStatus");

/**
 * Twilio error codes that indicate the destination phone genuinely
 * cannot receive SMS. We auto-opt-out these numbers so subsequent
 * sends don't waste spend or further damage sender reputation.
 *
 *   30003 — Unreachable destination handset
 *   30005 — Unknown destination handset
 *   30006 — Landline or unreachable carrier
 *
 * Explicitly NOT in this set:
 *   30004 — Message blocked (could be temporary user filter)
 *   30007 — Carrier violation (often template / content related; fixable)
 *   30008 — Unknown error (don't assume permanent)
 *   21610 — Already opted out (handled separately: idempotent insert)
 */
const HARD_BOUNCE_CODES = new Set([30003, 30005, 30006]);

const ALREADY_OPTED_OUT_CODE = 21610;

export function registerTwilioStatusCallbackRoutes(app: Express): void {
  app.post("/api/twilio/sms-status", async (req: Request, res: Response) => {
    if (!verifyTwilioSignature(req)) {
      log.warn("Signature verification failed", { path: req.originalUrl });
      return res.status(403).send();
    }

    const messageSid = typeof req.body?.MessageSid === "string" ? req.body.MessageSid : "";
    const messageStatus = typeof req.body?.MessageStatus === "string" ? req.body.MessageStatus : "";
    if (!messageSid || !messageStatus) {
      log.warn("Missing required params", {
        hasSid: !!messageSid,
        hasStatus: !!messageStatus,
      });
      // Still return 200 so Twilio doesn't retry on malformed callbacks.
      return res.status(200).send();
    }

    const errorCodeRaw = req.body?.ErrorCode;
    const errorCode =
      errorCodeRaw != null && errorCodeRaw !== ""
        ? Number(errorCodeRaw)
        : null;
    const errorMessage =
      typeof req.body?.ErrorMessage === "string" && req.body.ErrorMessage.length > 0
        ? req.body.ErrorMessage
        : null;
    const toNumber = typeof req.body?.To === "string" ? req.body.To : null;

    const now = new Date();
    const isDelivered = messageStatus === "delivered";

    try {
      const updateSet: Record<string, unknown> = {
        status: messageStatus,
        updated_at: now,
      };
      if (errorCode != null && Number.isFinite(errorCode)) {
        updateSet.error_code = errorCode;
      }
      if (errorMessage != null) {
        updateSet.error_message = errorMessage;
      }
      if (isDelivered) {
        updateSet.delivered_at = now;
      }

      const updated = await db
        .update(smsMessages)
        .set(updateSet)
        .where(eq(smsMessages.twilio_sid, messageSid))
        .returning({ id: smsMessages.id, to_number: smsMessages.to_number });

      if (updated.length === 0) {
        // Not necessarily an error — we only persist sms_messages rows
        // for SMS we originated server-side (calculator follow-ups, AI
        // replies). Admin-panel test sends or numbers not yet linked to
        // a lead may not have a matching row. Log and move on.
        log.info("No sms_messages row for MessageSid", {
          messageSid,
          messageStatus,
        });
      } else {
        log.info("Status update applied", {
          messageSid,
          messageStatus,
          errorCode,
          delivered: isDelivered,
          rowId: updated[0].id,
        });
      }

      // Hard-bounce auto-opt-out. Prefer the To number from Twilio's
      // payload (signed) but fall back to the row's to_number if the
      // webhook omitted it.
      const optOutTarget = toNumber ?? updated[0]?.to_number ?? null;

      if (errorCode != null && Number.isFinite(errorCode) && optOutTarget) {
        if (HARD_BOUNCE_CODES.has(errorCode)) {
          log.info("Hard-bounce — auto-opting-out destination", {
            messageSid,
            errorCode,
            to: optOutTarget,
          });
          await recordSmsOptOut(optOutTarget, "hard_bounce");
        } else if (errorCode === ALREADY_OPTED_OUT_CODE) {
          // Twilio rejected the send because the destination already
          // opted-out (likely via Twilio's own STOP handling on a
          // different number / shortcode). Mirror locally.
          log.info("Twilio reports recipient opted-out — syncing local registry", {
            messageSid,
            to: optOutTarget,
          });
          await recordSmsOptOut(optOutTarget, "stop_keyword");
        }
        // 30004 / 30007 / 30008: record the error in sms_messages (already
        // done above) but do NOT auto-opt-out. These can be transient.
      }
    } catch (err) {
      log.error("Status callback processing failed", {
        messageSid,
        messageStatus,
        err: (err as Error).message,
      });
      // Still return 200 — retrying won't help if our DB is the problem.
    }

    return res.status(200).send();
  });

  log.info("Twilio SMS status callback route registered");
}
