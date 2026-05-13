/**
 * Option B — Twilio Lookup v2 → normalised CarrierKey for the wizard.
 *
 * Test mode covers three scenarios so Alex can walk all three carrier
 * UX branches end-to-end:
 *   - Last digit 1 → Verizon (US, CDMA-combined codes)
 *   - Last digit 2 → Rogers (CA, GSM codes)
 *   - Last digit 3 → Bell   (CA, device-settings-only fallback)
 *   - Anything else → T-Mobile (US, default GSM)
 */

import { getTwilioClient, isTwilioConfigured } from "../../twilioClient";
import { normalizeCarrierName, getCarrierEntry, type CarrierKey, type CarrierEntry } from "@shared/api-types/carrierCodes";
import { createLogger } from "../../lib/logger";

const log = createLogger("CarrierLookup");

const TEST_MODE = () => process.env.TRADELINE_SETUP_TEST_MODE === "true";

export interface CarrierLookupResult {
  ok: true;
  phoneNumber: string;         // E.164
  carrierKey: CarrierKey;
  carrierName: string | null;  // Twilio's raw string, useful for UI subtitle
  carrierEntry: CarrierEntry | null; // null when CarrierKey === 'unknown'
  market: "US" | "CA" | null;  // from Twilio Lookup country_code
}

export interface CarrierLookupFailure {
  ok: false;
  error: string;
}

export async function lookupCarrier(
  phoneNumber: string,
): Promise<CarrierLookupResult | CarrierLookupFailure> {
  if (TEST_MODE()) {
    const last = phoneNumber.replace(/\D/g, "").slice(-1);
    const mockKey: CarrierKey =
      last === "1" ? "verizon" :
      last === "2" ? "rogers" :
      last === "3" ? "bell" :
      "tmobile";
    const entry = getCarrierEntry(mockKey);
    return {
      ok: true,
      phoneNumber,
      carrierKey: mockKey,
      carrierName: entry?.displayName ?? null,
      carrierEntry: entry,
      market: entry?.market ?? null,
    };
  }

  if (!isTwilioConfigured()) {
    return { ok: false, error: "Carrier lookup unavailable — Twilio not configured" };
  }

  try {
    const client = getTwilioClient();
    // Twilio Lookup v2 — line_type_intelligence returns carrier info.
    const result = await client.lookups.v2.phoneNumbers(phoneNumber).fetch({
      fields: "line_type_intelligence",
    });

    // Twilio's response shape varies slightly between SDK versions.
    // line_type_intelligence is the v2-canonical field; fall back to v1 shape.
    const lti = (result as any).lineTypeIntelligence ?? (result as any).line_type_intelligence ?? null;
    const carrierName: string | null =
      lti?.carrier_name ?? lti?.carrierName ?? (result as any).carrier?.name ?? null;
    const countryCode: string | null = result.countryCode ?? null;
    const market: "US" | "CA" | null =
      countryCode === "US" ? "US" : countryCode === "CA" ? "CA" : null;

    const carrierKey = normalizeCarrierName(carrierName);
    const entry = getCarrierEntry(carrierKey);

    log.info("Carrier looked up", {
      number: phoneNumber,
      carrierName,
      carrierKey,
      market,
    });

    return {
      ok: true,
      phoneNumber,
      carrierKey,
      carrierName,
      carrierEntry: entry,
      market,
    };
  } catch (err) {
    const msg = (err as Error).message;
    log.error("Carrier lookup failed", { number: phoneNumber, err: msg });
    return { ok: false, error: msg };
  }
}
