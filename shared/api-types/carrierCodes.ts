/**
 * Carrier-code table — source of truth for Option B's "forward your number"
 * flow in the tradeline-setup wizard.
 *
 * Mirrors to the wefixtrades-softphone mobile-app repo manually (no npm
 * package). Keep both copies in sync when extending.
 *
 * Format conventions:
 *  - `{num}` is replaced with the WeFixTrades destination number (digits only).
 *  - When rendered as a `tel:` URI, `#` is URL-encoded to `%23`.
 *  - GSM carriers prefer `*004*{num}#` to activate all conditions
 *    (busy + no-answer + unreachable) in one shot.
 *  - CDMA-flavoured carriers (Verizon family) use one code `*71{num}` that
 *    covers all conditions.
 *  - Bell / Virgin Plus do not officially support MMI conditional codes —
 *    UI falls back to device-settings instructions with screenshots.
 *
 * Confidence values reflect verification at the time of compilation
 * (2026-05-12). When a carrier's behaviour drifts, downgrade and add a note.
 */

export type CarrierKey =
  | "verizon"
  | "att"
  | "tmobile"
  | "us_cellular"
  | "mint"
  | "visible"
  | "cricket"
  | "boost"
  | "metro"
  | "bell"
  | "rogers"
  | "telus"
  | "freedom"
  | "fido"
  | "koodo"
  | "virgin"
  | "public_mobile"
  | "unknown";

export type CarrierStyle =
  | "cdma_combined"
  | "gsm_mmi"
  | "device_settings_only";

export type CarrierMarket = "US" | "CA";

export interface CarrierCodes {
  activateAll: string | null;
  deactivateAll: string | null;
  activateNoAnswer?: string | null;
  activateBusy?: string | null;
  activateUnreachable?: string | null;
}

export interface CarrierEntry {
  key: CarrierKey;
  displayName: string;
  market: CarrierMarket;
  parent?: CarrierKey;
  style: CarrierStyle;
  codes: CarrierCodes;
  preconditionNote?: string;
  confidence: "high" | "medium" | "low";
}

const GSM_STANDARD_CODES: CarrierCodes = {
  activateAll: "*004*{num}#",
  deactivateAll: "##004#",
  activateNoAnswer: "*61*{num}#",
  activateBusy: "*67*{num}#",
  activateUnreachable: "*62*{num}#",
};

const CDMA_VERIZON_CODES: CarrierCodes = {
  activateAll: "*71{num}",
  deactivateAll: "*73",
  activateNoAnswer: "*71{num}",
  activateBusy: "*71{num}",
  activateUnreachable: "*71{num}",
};

const DEVICE_SETTINGS_ONLY_CODES: CarrierCodes = {
  activateAll: null,
  deactivateAll: "*73",
  activateNoAnswer: null,
  activateBusy: null,
  activateUnreachable: null,
};

export const CARRIERS: Record<Exclude<CarrierKey, "unknown">, CarrierEntry> = {
  verizon:        { key: "verizon",        displayName: "Verizon",            market: "US",                       style: "cdma_combined",        codes: CDMA_VERIZON_CODES,        confidence: "high" },
  att:            { key: "att",            displayName: "AT&T",               market: "US",                       style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        confidence: "high" },
  tmobile:        { key: "tmobile",        displayName: "T-Mobile",           market: "US",                       style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        confidence: "high" },
  us_cellular:    { key: "us_cellular",    displayName: "US Cellular",        market: "US",                       style: "cdma_combined",        codes: { ...CDMA_VERIZON_CODES, activateUnreachable: null }, confidence: "medium" },
  mint:           { key: "mint",           displayName: "Mint Mobile",        market: "US", parent: "tmobile",    style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        confidence: "high" },
  visible:        { key: "visible",        displayName: "Visible",            market: "US", parent: "verizon",    style: "cdma_combined",        codes: CDMA_VERIZON_CODES,        confidence: "medium" },
  cricket:        { key: "cricket",        displayName: "Cricket Wireless",   market: "US", parent: "att",        style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        confidence: "high" },
  boost:          { key: "boost",          displayName: "Boost Mobile",       market: "US", parent: "tmobile",    style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        confidence: "medium" },
  metro:          { key: "metro",          displayName: "Metro by T-Mobile",  market: "US", parent: "tmobile",    style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        confidence: "high" },
  bell:           { key: "bell",           displayName: "Bell",               market: "CA",                       style: "device_settings_only", codes: DEVICE_SETTINGS_ONLY_CODES, preconditionNote: "Bell Mobility does not officially support conditional call-forwarding codes. The wizard will guide you through your phone's call-forwarding settings instead.",                                                                            confidence: "high" },
  rogers:         { key: "rogers",         displayName: "Rogers",             market: "CA",                       style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        preconditionNote: "Disable Rogers Call Answer (voicemail) before activating — otherwise the code silently fails.",                                                                  confidence: "high" },
  telus:          { key: "telus",          displayName: "Telus",              market: "CA",                       style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        confidence: "high" },
  freedom:        { key: "freedom",        displayName: "Freedom Mobile",     market: "CA",                       style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        confidence: "medium" },
  fido:           { key: "fido",           displayName: "Fido",               market: "CA", parent: "rogers",     style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        preconditionNote: "Disable Fido voicemail before activating — otherwise the code silently fails.",                                                                                confidence: "high" },
  koodo:          { key: "koodo",          displayName: "Koodo Mobile",       market: "CA", parent: "telus",      style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        confidence: "high" },
  virgin:         { key: "virgin",         displayName: "Virgin Plus",        market: "CA", parent: "bell",       style: "device_settings_only", codes: DEVICE_SETTINGS_ONLY_CODES, preconditionNote: "Virgin Plus (Bell MVNO) does not support conditional call-forwarding codes. The wizard will guide you through your phone's call-forwarding settings instead.", confidence: "high" },
  public_mobile:  { key: "public_mobile",  displayName: "Public Mobile",      market: "CA", parent: "telus",      style: "gsm_mmi",              codes: GSM_STANDARD_CODES,        confidence: "high" },
};

/**
 * Maps Twilio Lookup v2 `carrier.name` strings → our CarrierKey.
 * Twilio's name strings are not 100% stable across regions/dates — keep this
 * permissive (regex patterns) and extend liberally.
 */
const TWILIO_LOOKUP_NAME_MAP: ReadonlyArray<[RegExp, CarrierKey]> = [
  [/^verizon/i, "verizon"],
  [/^at[&\s]?t/i, "att"],
  [/^t-mobile/i, "tmobile"],
  [/^u\.?s\.? cellular/i, "us_cellular"],
  [/^mint mobile/i, "mint"],
  [/^visible/i, "visible"],
  [/^cricket/i, "cricket"],
  [/^boost mobile/i, "boost"],
  [/^metro( by t-mobile)?/i, "metro"],
  [/^bell( canada| mobility)?/i, "bell"],
  [/^rogers/i, "rogers"],
  [/^telus/i, "telus"],
  [/^freedom mobile/i, "freedom"],
  [/^fido/i, "fido"],
  [/^koodo/i, "koodo"],
  [/^virgin plus|^bell virgin/i, "virgin"],
  [/^public mobile/i, "public_mobile"],
];

export function normalizeCarrierName(lookupName: string | null | undefined): CarrierKey {
  if (!lookupName) return "unknown";
  for (const [re, key] of TWILIO_LOOKUP_NAME_MAP) {
    if (re.test(lookupName)) return key;
  }
  return "unknown";
}

export function getCarrierEntry(key: CarrierKey): CarrierEntry | null {
  if (key === "unknown") return null;
  return CARRIERS[key] ?? null;
}

export type ActivationCondition = "all" | "no_answer" | "busy" | "unreachable";

/**
 * Builds the `tel:` URI for the "Call now to activate" button.
 * Returns null when the carrier doesn't support MMI activation
 * (e.g., Bell/Virgin → device-settings flow).
 */
export function buildActivationTelUri(
  carrier: CarrierEntry,
  weFixTradesNumber: string,
  condition: ActivationCondition = "all",
): string | null {
  const codeByCondition: Record<ActivationCondition, string | null | undefined> = {
    all: carrier.codes.activateAll,
    no_answer: carrier.codes.activateNoAnswer,
    busy: carrier.codes.activateBusy,
    unreachable: carrier.codes.activateUnreachable,
  };
  const raw = codeByCondition[condition];
  if (!raw) return null;
  const digits = weFixTradesNumber.replace(/[^\d]/g, "");
  const dialString = raw.replace("{num}", digits);
  return `tel:${dialString.replace(/#/g, "%23")}`;
}

/**
 * Generic GSM combined-conditional code shown when carrier === "unknown".
 * Most modern non-CDMA carriers honour `*004*<num>#`.
 */
export const UNKNOWN_CARRIER_FALLBACK = {
  activateAll: "*004*{num}#",
  deactivateAll: "##004#",
  note:
    "We couldn't identify your carrier from your number. The code below is the standard GSM combined-conditional code that most carriers globally honour. If it doesn't work, contact your carrier or use your phone's call-forwarding settings.",
} as const;
