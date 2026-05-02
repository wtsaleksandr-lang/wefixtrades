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
}

/**
 * Send SMS and email notifications for a completed TradeLine call.
 * Never throws — all errors are caught and logged.
 */
export async function sendTradeLineCallNotifications(params: TradeLineNotificationParams): Promise<void> {
  const {
    clientServiceId, callLogId, leadData, recordingUrl, report,
    smsNumbers, emailAddresses, canSendSmsTo, markSmsSent,
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
}
