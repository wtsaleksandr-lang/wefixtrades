/**
 * Option C — port-existing-number submission.
 *
 * For v1 the actual Twilio Porting API submission is deferred:
 *   - In TRADELINE_SETUP_TEST_MODE → returns port_request_id 'PT…00' and
 *     status='test_submitted'. Lets Alex walk the wizard end-to-end.
 *   - Real submission → marks status='submitted' and stores a placeholder
 *     port_request_id of 'PENDING_TWILIO_API'. The actual Twilio API call
 *     happens in a separate batch once the bill/LOA upload UI ships AND
 *     the admin Twilio porting credentials are wired (currently neither
 *     piece is complete).
 *
 * When the actual Twilio porting API integration lands, replace the
 * placeholder branch with: client.numbers.v2.portingPortIns.create({...}).
 */

import { isTwilioConfigured } from "../../twilioClient";
import { createLogger } from "../../lib/logger";

const log = createLogger("PortRequest");

const TEST_MODE = () => process.env.TRADELINE_SETUP_TEST_MODE === "true";

export interface PortSubmitSuccess {
  ok: true;
  portRequestId: string;
  status: "submitted" | "test_submitted";
}

export interface PortSubmitFailure {
  ok: false;
  error: string;
}

export type PortSubmitResult = PortSubmitSuccess | PortSubmitFailure;

export interface PortSubmitArgs {
  customerNumber: string;          // number being ported in (E.164)
  billObjectKey: string | null;    // encrypted Replit Object Storage key
  loaObjectKey: string | null;     // encrypted Replit Object Storage key
  authorizedSignerName: string;
  businessName: string;
}

export async function submitPort(args: PortSubmitArgs): Promise<PortSubmitResult> {
  if (TEST_MODE()) {
    log.info("test-mode: returning test_submitted", { number: args.customerNumber });
    return {
      ok: true,
      portRequestId: "PT" + "0".repeat(32),
      status: "test_submitted",
    };
  }

  if (!isTwilioConfigured()) {
    return { ok: false, error: "Port submission unavailable — Twilio not configured" };
  }

  if (!args.billObjectKey || !args.loaObjectKey) {
    return { ok: false, error: "Bill and LOA are required to submit a port" };
  }

  // Real Twilio Porting API integration deferred — see file header.
  // For now: record a placeholder ID and let the admin operator pick it up.
  log.warn("Real Twilio Porting API not yet wired — recording placeholder", {
    number: args.customerNumber,
  });
  return {
    ok: true,
    portRequestId: "PENDING_TWILIO_API",
    status: "submitted",
  };
}
