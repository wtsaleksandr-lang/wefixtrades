/**
 * TradeLine Test Call Service
 *
 * Simulates a complete call pipeline without real telephony.
 * Creates a synthetic end-of-call-report and processes it through
 * the full pipeline: resolve -> log -> extract lead -> notify.
 */

import { createLogger } from "../lib/logger";
import { storage } from "../storage";
import {
  logTradeLineCall,
  extractLeadFromTranscript,
  processTradeLineCallPostHook,
  type VapiCallReport,
} from "./vapiService";

const log = createLogger("TradeLineTestCall");

const TEST_TRANSCRIPT = `Hi, this is John Smith calling about a leaking tap at 123 Main Street. Can someone come tomorrow morning? My number is 555-0199.`;

export interface TestCallResult {
  success: boolean;
  callLogId: number | null;
  extractedLead: Record<string, unknown> | null;
  notificationStatus: string;
  error?: string;
}

export async function runTestCall(clientServiceId: number): Promise<TestCallResult> {
  try {
    const cs = await storage.getClientServiceById(clientServiceId);
    if (!cs || !cs.service_id.startsWith("tradeline")) {
      return { success: false, callLogId: null, extractedLead: null, notificationStatus: "skipped", error: "Service not found" };
    }

    const testCallId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const report: VapiCallReport = {
      callId: testCallId,
      duration: 45,
      endedReason: "customer-ended-call",
      summary: "Test call: Customer inquiring about a leaking tap, requesting service tomorrow morning.",
      transcript: TEST_TRANSCRIPT,
      messageCount: 4,
      customerNumber: "+15550199",
    };

    const callResult = await logTradeLineCall(clientServiceId, report, undefined);
    if (!callResult.callLogId) {
      return { success: false, callLogId: null, extractedLead: null, notificationStatus: "skipped", error: "Failed to log test call" };
    }

    log.info("Test call logged", { callLogId: callResult.callLogId, clientServiceId });

    const leadData = await extractLeadFromTranscript(TEST_TRANSCRIPT);

    let notificationStatus = "skipped";
    try {
      await processTradeLineCallPostHook(
        clientServiceId, cs.client_id, callResult.callLogId,
        callResult.outcome, TEST_TRANSCRIPT, undefined, report,
      );
      notificationStatus = "sent";
    } catch (err) {
      notificationStatus = `failed: ${(err as Error).message}`;
    }

    return {
      success: true,
      callLogId: callResult.callLogId,
      extractedLead: leadData as Record<string, unknown> | null,
      notificationStatus,
    };
  } catch (err) {
    log.error("Test call failed", { clientServiceId, error: (err as Error).message });
    return { success: false, callLogId: null, extractedLead: null, notificationStatus: "skipped", error: (err as Error).message };
  }
}
