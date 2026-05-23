/**
 * Google Business Profile (GBP) shim — partial automation.
 *
 * GBP API access requires Google to approve the OAuth client for the
 * `business.manage` scope (manual application, multi-week review). Until
 * the listing is created + verified outside the system, the API surface
 * here is a scaffold + prepared draft that Alex can use to seed the
 * listing manually in the GBP UI.
 *
 * After approval + listing creation, this module is the wiring point
 * for: auto-sync hours, post weekly updates, fetch performance metrics,
 * alert on negative reviews.
 *
 * For v1 scaffold:
 *   - generatePrepFile() returns a listing draft (name/categories/hours
 *     /description/photos placeholder) ready for paste into GBP UI
 *   - isApiAvailable() probes whether `business.manage` was granted
 */

import { getToken } from "./oauthTokenStore";
import { createLogger } from "../logger";

const log = createLogger("GbpClient");

export interface GbpListingDraft {
  business_name: string;
  primary_category: string;
  additional_categories: string[];
  description: string;
  hours: Record<string, { open: string; close: string } | "closed">;
  phone_e164: string;
  website: string;
  service_areas: string[];
  attributes: string[];
  manual_steps: string[];
}

export function generateListingDraft(): GbpListingDraft {
  return {
    business_name: "WeFixTrades",
    primary_category: "Marketing Agency",
    additional_categories: [
      "Software Company",
      "Website Designer",
      "Business Consultant",
    ],
    description: [
      "WeFixTrades gives trades businesses (plumbers, electricians, HVAC, roofers, ",
      "landscapers, garage doors, fencing, and 20+ more) the website, quote ",
      "calculator, booking, review funnel, and AI receptionist they need to win ",
      "more jobs — without a designer, developer, or marketing agency.",
    ].join(""),
    hours: {
      monday:    { open: "08:00", close: "18:00" },
      tuesday:   { open: "08:00", close: "18:00" },
      wednesday: { open: "08:00", close: "18:00" },
      thursday:  { open: "08:00", close: "18:00" },
      friday:    { open: "08:00", close: "18:00" },
      saturday:  { open: "10:00", close: "14:00" },
      sunday:    "closed",
    },
    phone_e164: "+18000000000",
    website: "https://wefixtrades.com",
    service_areas: ["United States"],
    attributes: [
      "Online appointments",
      "Online classes",
      "Wheelchair accessible",
    ],
    manual_steps: [
      "Visit https://business.google.com and click 'Add business'.",
      "Select 'Service business' (no storefront).",
      "Paste the prepared business name + category from this draft.",
      "Add the description, hours, phone, and website.",
      "Request verification (Google will mail a postcard with a code).",
      "Once verified, return to /admin/integrations/google and click 'Connect GBP'.",
    ],
  };
}

/**
 * Check whether the connected Google token actually has the
 * `business.manage` scope (it may have been omitted from consent).
 */
export async function isApiAvailable(): Promise<boolean> {
  const tok = await getToken("google");
  if (!tok) return false;
  return tok.scopes.includes("https://www.googleapis.com/auth/business.manage");
}

/**
 * Stub for the post-approval performance-fetch operation. Returns null
 * until the GBP API integration is wired up after Google approves the
 * scope for production use.
 */
export async function fetchPerformanceMetrics(_locationId: string): Promise<null> {
  log.info("GBP performance metrics not yet wired — pending API approval + listing verification");
  return null;
}
