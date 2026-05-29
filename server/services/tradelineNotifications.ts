/**
 * TradeLine Call Notifications
 *
 * Sends SMS and email notifications to the business owner after
 * a TradeLine call ends and lead data is extracted.
 */

import { createLogger } from "../lib/logger";
import { isTwilioConfigured, sendSMS, sendSmsAsClient, truncateSms } from "../twilioClient";
import { sendTradeLineCallNotificationEmail } from "../lib/tradelineCallNotificationEmail";
import { respectPreferences } from "../lib/notificationPreferences";
// Wave 82 — owner-facing missed-call alert + homeowner-facing after-hours
// apology now resolve through the central registry. Tenant overrides land
// here once Wave 83's settings UI ships.
import { resolveSmsTemplate } from "../lib/smsTemplateResolver";
import type { TradelineLeadData } from "@shared/schema";
import type { VapiCallReport } from "./vapiService";

const log = createLogger("TradeLineNotify");

export interface TradeLineNotificationParams {
  clientServiceId: number;
  clientId: number;
  callLogId: number;
  leadData: TradelineLeadData;
  recordingUrl: string | undefined;
  report: VapiCallReport;
  smsNumbers: string[];
  emailAddresses: string[];
  canSendSmsTo: (phone: string) => boolean;
  markSmsSent: (phone: string) => void;
  currentMode?: string;
  businessName?: string;
  outboundSmsEnabled?: boolean;
}

/** Rate limiter for outbound caller SMS: 1 per phone per 24h. */
const outboundCallerSmsMap = new Map<string, number>();
const OUTBOUND_SMS_RATE_LIMIT_MS = 24 * 60 * 60 * 1000;
function canSendOutboundToCallerPhone(phone: string): boolean {
  const lastSent = outboundCallerSmsMap.get(phone);
  if (!lastSent) return true;
  return Date.now() - lastSent >= OUTBOUND_SMS_RATE_LIMIT_MS;
}
function markOutboundCallerSmsSent(phone: string): void {
  outboundCallerSmsMap.set(phone, Date.now());
}

/**
 * Send SMS and email notifications for a completed TradeLine call.
 * Never throws — all errors are caught and logged.
 */
export async function sendTradeLineCallNotifications(params: TradeLineNotificationParams): Promise<void> {
  const {
    clientId, clientServiceId, callLogId, leadData, recordingUrl, report,
    smsNumbers, emailAddresses, canSendSmsTo, markSmsSent,
    currentMode, businessName, outboundSmsEnabled,
  } = params;

  // Per-client notification-preference gates. Computed once per call.
  // Outbound SMS to the caller (end-customer, not a WeFixTrades client) is
  // NOT gated — that's transactional service information, not a marketing
  // touchpoint.
  // Wave P: TradeLine call summaries are missed/answered-call alerts, which
  // now have their own `missed_call` category (was lumped under `leads`).
  const smsAllowed = await respectPreferences(clientId, "sms", "missed_call");
  const emailAllowed = await respectPreferences(clientId, "email", "missed_call");

  // Build SMS message
  const callerName = leadData.caller_name || "Unknown caller";
  const callerPhone = leadData.caller_phone || report.customerNumber || "no number";
  const jobType = leadData.job_type || "General inquiry";
  const urgency = leadData.urgency || "medium";
  const summary = (leadData.job_description || report.summary || "").slice(0, 30);
  const portalUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://app.wefixtrades.com";

  // Wave 82 — owner-facing missed-call alert through the central registry.
  // Truncate to 160 chars to match the previous behaviour (Twilio
  // single-segment friendly). The resolver returns the registry default
  // unless the tenant has an override row.
  const ownerAlert = await resolveSmsTemplate({
    templateId: "tradeline.owner_missed_call_alert",
    clientId,
    vars: {
      caller_name: callerName,
      caller_phone: callerPhone,
      job_type: jobType,
      urgency,
      summary,
      portal_url: `${portalUrl}/portal`,
    },
  });
  const smsBody = truncateSms(ownerAlert.body, 160);

  // Send SMS to all configured numbers (with rate limiting). Skip the
  // whole block when the tenant has disabled the owner alert template.
  if (ownerAlert.enabled && isTwilioConfigured() && smsNumbers.length > 0 && smsAllowed) {
    for (const phone of smsNumbers) {
      if (!canSendSmsTo(phone)) {
        log.debug("SMS rate limited — skipping", { phone, clientServiceId });
        continue;
      }
      try {
        await sendSMS(phone, smsBody);
        markSmsSent(phone);
        log.info("TradeLine call SMS sent", { phone, callLogId });
      } catch (err) {
        log.error("Failed to send TradeLine SMS", { phone, callLogId, error: (err as Error).message });
      }
    }
  }

  // Send email to all configured addresses
  if (emailAddresses.length > 0 && emailAllowed) {
    for (const email of emailAddresses) {
      try {
        await sendTradeLineCallNotificationEmail(email, {
          callerName,
          callerPhone,
          callerAddress: leadData.caller_address,
          jobType,
          urgency,
          jobDescription: leadData.job_description,
          preferredDate: leadData.preferred_date,
          callSummary: report.summary || leadData.job_description || "No summary available",
          recordingUrl,
          portalUrl,
          callLogId,
        });
        log.info("TradeLine call email sent", { email, callLogId });
      } catch (err) {
        log.error("Failed to send TradeLine email", { email, callLogId, error: (err as Error).message });
      }
    }
  }

  // Outbound SMS to caller during after_hours mode
  if (currentMode === "after_hours" && outboundSmsEnabled !== false && isTwilioConfigured()) {
    const callerPhoneNumber = leadData.caller_phone || report.customerNumber;
    if (callerPhoneNumber && canSendOutboundToCallerPhone(callerPhoneNumber)) {
      const biz = businessName || "Our team";
      // Wave 82 — homeowner-facing after-hours apology through the central
      // registry. Tenant may have disabled it; resolver returns
      // `enabled: false` and we skip the send.
      const apology = await resolveSmsTemplate({
        templateId: "tradeline.after_hours_apology",
        clientId,
        vars: {
          brand_name: biz,
          job_type: leadData.job_type || "your inquiry",
        },
      });
      if (!apology.enabled) {
        log.debug("After-hours apology disabled by tenant — skipping", {
          clientId,
          callLogId,
        });
        return;
      }
      const outboundMsg = truncateSms(apology.body, 160);
      try {
        // Wave 77 — after-hours apology is sent to the homeowner caller,
        // so route through the client's per-tenant TradeLine number with
        // per-client opt-out scoping. Owner alerts above (smsNumbers) stay
        // on the shared brand line.
        // Wave 79 — this fires as a direct response to a call the homeowner
        // JUST placed. That's transactional (the recipient initiated the
        // contact), so it bypasses the carrier quiet-hours window.
        await sendSmsAsClient({
          clientId,
          to: callerPhoneNumber,
          body: outboundMsg,
          channel: "sms",
          quietHoursBypass: "transactional",
        });
        markOutboundCallerSmsSent(callerPhoneNumber);
        log.info("Outbound after-hours SMS sent to caller", { callerPhoneNumber, callLogId });
      } catch (err) {
        log.error("Failed to send outbound SMS to caller", { callerPhoneNumber, callLogId, error: (err as Error).message });
      }
    }
  }
}
