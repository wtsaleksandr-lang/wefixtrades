/**
 * TradeLine Call Notifications
 *
 * Sends SMS and email notifications to the business owner after
 * a TradeLine call ends and lead data is extracted.
 */

import { createLogger } from "../lib/logger";
import { isTwilioConfigured, sendSMS, truncateSms } from "../twilioClient";
import { sendTradeLineCallNotificationEmail } from "../lib/tradelineCallNotificationEmail";
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
    clientServiceId, callLogId, leadData, recordingUrl, report,
    smsNumbers, emailAddresses, canSendSmsTo, markSmsSent,
    currentMode, businessName, outboundSmsEnabled,
  } = params;

  // Build SMS message
  const callerName = leadData.caller_name || "Unknown caller";
  const callerPhone = leadData.caller_phone || report.customerNumber || "no number";
  const jobType = leadData.job_type || "General inquiry";
  const urgency = leadData.urgency || "medium";
  const summary = (leadData.job_description || report.summary || "").slice(0, 30);
  const portalUrl = process.env.APP_URL || process.env.APP_PUBLIC_URL || "https://app.wefixtrades.com";

  const smsBody = truncateSms(
    `New call from ${callerName} (${callerPhone}). ${jobType} - ${urgency}. ${summary}. View: ${portalUrl}/portal`,
    160,
  );

  // Send SMS to all configured numbers (with rate limiting)
  if (isTwilioConfigured() && smsNumbers.length > 0) {
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
  if (emailAddresses.length > 0) {
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
      const outboundMsg = truncateSms(
        `Thanks for calling ${biz}! We received your message about ${leadData.job_type || "your inquiry"}. We'll get back to you during business hours. — ${biz}`,
        160,
      );
      try {
        await sendSMS(callerPhoneNumber, outboundMsg);
        markOutboundCallerSmsSent(callerPhoneNumber);
        log.info("Outbound after-hours SMS sent to caller", { callerPhoneNumber, callLogId });
      } catch (err) {
        log.error("Failed to send outbound SMS to caller", { callerPhoneNumber, callLogId, error: (err as Error).message });
      }
    }
  }
}
