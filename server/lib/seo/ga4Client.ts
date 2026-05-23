/**
 * GA4 Admin / Data API shim.
 *
 * After Google OAuth authorizes us with `analytics.edit` +
 * `analytics.readonly`, we can:
 *   - list the account's GA4 properties
 *   - create a new GA4 property + web data stream programmatically
 *   - read the resulting Measurement ID
 *
 * The Measurement ID is what gets wired into every page via the global
 * gtag snippet; we cache it in process.env.GA4_MEASUREMENT_ID and the
 * /api/admin/integrations/status endpoint exposes it for the UI.
 *
 * Docs:
 * https://developers.google.com/analytics/devguides/config/admin/v1
 */

import { google } from "googleapis";
import { getFreshAccessToken } from "./googleOauth";
import { createLogger } from "../logger";

const log = createLogger("Ga4Client");

async function makeAdminClient() {
  const accessToken = await getFreshAccessToken("google");
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.analyticsadmin({ version: "v1beta", auth });
}

export interface Ga4Property {
  name: string; // "properties/123456789"
  displayName: string;
  parent: string; // "accounts/12345"
  createTime: string | null;
}

export async function listProperties(): Promise<Ga4Property[]> {
  const admin = await makeAdminClient();
  const { data } = await admin.accountSummaries.list();
  const out: Ga4Property[] = [];
  for (const acct of data.accountSummaries ?? []) {
    for (const p of acct.propertySummaries ?? []) {
      out.push({
        name: p.property ?? "",
        displayName: p.displayName ?? "",
        parent: acct.account ?? "",
        createTime: null,
      });
    }
  }
  return out;
}

export interface CreatePropertyResult {
  propertyName: string; // "properties/123"
  measurementId: string; // "G-XXXXXXX"
  streamName: string;   // "properties/123/dataStreams/456"
}

/**
 * Create a new GA4 property + web data stream and return the
 * Measurement ID for wiring into <Head>.
 *
 * `accountName` is "accounts/12345" (from listProperties' parent field).
 */
export async function createPropertyAndStream(
  accountName: string,
  displayName: string,
  websiteUrl: string,
  timeZone = "America/Chicago",
  currencyCode = "USD",
): Promise<CreatePropertyResult> {
  const admin = await makeAdminClient();

  const { data: property } = await admin.properties.create({
    requestBody: {
      parent: accountName,
      displayName,
      timeZone,
      currencyCode,
    },
  });
  if (!property.name) throw new Error("GA4 property creation returned no name");

  const { data: stream } = await admin.properties.dataStreams.create({
    parent: property.name,
    requestBody: {
      type: "WEB_DATA_STREAM",
      displayName: `${displayName} — web`,
      webStreamData: { defaultUri: websiteUrl },
    },
  });

  const measurementId = stream.webStreamData?.measurementId ?? "";
  if (!measurementId) throw new Error("GA4 stream creation returned no measurementId");

  log.info("Created GA4 property + stream", {
    propertyName: property.name,
    measurementId,
  });

  return {
    propertyName: property.name,
    measurementId,
    streamName: stream.name ?? "",
  };
}
