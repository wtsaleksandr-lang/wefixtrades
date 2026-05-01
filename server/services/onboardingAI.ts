/**
 * AI Onboarding Processor
 *
 * When a non-TradeLine customer submits their onboarding form, this service:
 *  1. Reads the raw responses and the service type
 *  2. Asks Claude to extract structured data (client fields + service config)
 *  3. Fills in client.business_name / contact_email / contact_phone /
 *     website_url / google_place_id / metadata if we learned anything new
 *  4. Stores service-specific config in client_service.metadata.config
 *  5. Logs the processing to admin_activity_log for auditability
 *
 * Idempotent — writes `processed_at` to submission metadata so repeated
 * submissions don't re-process.
 *
 * Safe-fail — if Claude is unavailable or returns invalid JSON, the form
 * submission still succeeds; the admin just has to review responses manually
 * instead of getting them pre-parsed.
 */

import { db } from "../db";
import { clients, clientServices, serviceCatalog, onboardingSubmissions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { chat } from "./aiService";
import { storage } from "../storage";
import type { OnboardingSubmission, Client } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { encryptToken, isEncryptionConfigured } from "./socialSync/tokenEncryption";

const log = createLogger("OnboardingAI");

export interface ProcessResult {
  processed: boolean;
  reason?: string;
  clientFieldsUpdated?: string[];
  serviceConfigKeys?: string[];
}

/** Fields on the clients table that AI can safely populate if empty. */
const CLIENT_FIELDS = [
  "business_name",
  "contact_name",
  "contact_email",
  "contact_phone",
  "website_url",
  "google_place_id",
  "facebook_page_url",
  "trade_type",
] as const;

interface ExtractedData {
  client: Partial<Record<(typeof CLIENT_FIELDS)[number], string>>;
  service_config: Record<string, any>;
  summary: string;
}

function buildSystemPrompt(serviceId: string, serviceName: string): string {
  return `You extract structured setup data from a trade-business onboarding form.

The customer just purchased "${serviceName}" (service_id: ${serviceId}). Their raw answers to the onboarding form are below.

Return STRICT JSON matching this TypeScript interface:

interface Output {
  client: {
    business_name?: string;
    contact_name?: string;
    contact_email?: string;
    contact_phone?: string;         // E.164 format if possible, e.g. "+14155551234"
    website_url?: string;           // include https://
    google_place_id?: string;
    facebook_page_url?: string;
    trade_type?: string;            // lowercase, e.g. "plumber", "hvac", "roofer"
  };
  service_config: Record<string, any>;   // service-specific extracted config
  summary: string;                        // one sentence summarizing this customer's setup
}

Rules:
- Only include client fields you can extract with HIGH confidence from the responses. If not present, omit the field entirely (don't guess).
- Normalize phone numbers to E.164 when possible.
- Add https:// prefix to website URLs if missing.
- service_config should capture the service-specific working data the fulfillment team will need — e.g. for MapGuard: target keywords, service areas, competitors; for QuoteQuick: pricing model + base rates; for ReputationShield: review strategy + tone; for SocialSync: platforms + posting frequency; for SiteLaunch: style + extras; for RankFlow: target keywords + CMS access; for WebFix: main issue + URL.
- summary is a single concise sentence (under 25 words) an admin can scan.
- Return ONLY the JSON object. No prose, no markdown fences, no commentary.`;
}

function tryParseJSON(text: string): ExtractedData | null {
  // Strip markdown fences if present
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== "object" || !parsed) return null;
    return {
      client: parsed.client || {},
      service_config: parsed.service_config || {},
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
    };
  } catch {
    return null;
  }
}

export async function processOnboardingSubmission(
  submissionId: number,
): Promise<ProcessResult> {
  const [submission] = await db.select().from(onboardingSubmissions)
    .where(eq(onboardingSubmissions.id, submissionId)).limit(1);
  if (!submission) return { processed: false, reason: "submission_not_found" };

  // Idempotency — skip if already processed
  const prevMeta = (submission.metadata as any) || {};
  if (prevMeta.ai_processed_at) {
    return { processed: false, reason: "already_processed" };
  }

  if (!submission.client_service_id) {
    return { processed: false, reason: "no_client_service" };
  }

  const cs = await storage.getClientServiceById(submission.client_service_id);
  if (!cs) return { processed: false, reason: "client_service_not_found" };

  // Skip TradeLine — handled by a dedicated pipeline (mapOnboardingToTradeLineConfig)
  if (cs.service_id.startsWith("tradeline")) {
    return { processed: false, reason: "tradeline_handled_separately" };
  }

  // Gather context for the prompt
  const [svc] = await db.select().from(serviceCatalog)
    .where(eq(serviceCatalog.id, cs.service_id)).limit(1);
  const serviceName = svc?.name || cs.service_id;

  const responses = submission.responses || {};
  if (!responses || Object.keys(responses).length === 0) {
    return { processed: false, reason: "empty_responses" };
  }

  // Call Claude
  let extracted: ExtractedData | null;
  try {
    const response = await chat({
      system: buildSystemPrompt(cs.service_id, serviceName),
      messages: [{
        role: "user",
        content: `Onboarding form responses (JSON):\n${JSON.stringify(responses, null, 2)}`,
      }],
      maxTokens: 800,
    });
    extracted = tryParseJSON(response);
  } catch (err: any) {
    log.warn(`[onboarding-ai] Claude call failed for submission #${submissionId}:`, err.message);
    return { processed: false, reason: `ai_call_failed: ${err.message}` };
  }

  if (!extracted) {
    log.warn(`[onboarding-ai] Failed to parse Claude output for submission #${submissionId}`);
    return { processed: false, reason: "invalid_ai_response" };
  }

  // Update client fields — only fill gaps, never overwrite existing values
  const [client] = await db.select().from(clients).where(eq(clients.id, submission.client_id!)).limit(1);
  const clientUpdates: Partial<Client> = {};
  const fieldsUpdated: string[] = [];

  if (client) {
    for (const field of CLIENT_FIELDS) {
      const existing = (client as any)[field];
      const incoming = extracted.client[field];
      // Only fill if existing is empty/null and we have a new value
      if ((!existing || existing === "") && incoming && typeof incoming === "string" && incoming.trim()) {
        (clientUpdates as any)[field] = incoming.trim();
        fieldsUpdated.push(field);
      }
    }

    // Store AI summary in client.metadata.ai_onboarding_summary (most recent wins)
    const existingMeta = (client.metadata as any) || {};
    const newMeta = {
      ...existingMeta,
      ai_onboarding_summary: extracted.summary,
      ai_onboarding_processed_at: new Date().toISOString(),
    };
    (clientUpdates as any).metadata = newMeta;
    (clientUpdates as any).updated_at = new Date();

    if (Object.keys(clientUpdates).length > 0) {
      await db.update(clients)
        .set(clientUpdates as any)
        .where(eq(clients.id, client.id));
    }
  }

  // Store service config in client_service.metadata.config
  const csMeta = (cs.metadata as any) || {};
  const newCsMeta = {
    ...csMeta,
    config: {
      ...(csMeta.config || {}),
      ...extracted.service_config,
    },
    ai_processed_at: new Date().toISOString(),
  };
  await db.update(clientServices)
    .set({ metadata: newCsMeta, updated_at: new Date() })
    .where(eq(clientServices.id, cs.id));

  // Mark submission as processed
  await db.update(onboardingSubmissions)
    .set({
      metadata: { ...prevMeta, ai_processed_at: new Date().toISOString(), ai_summary: extracted.summary },
      updated_at: new Date(),
    } as any)
    .where(eq(onboardingSubmissions.id, submissionId));

  // Admin activity log (non-blocking)
  try {
    await storage.logAdminActivity({
      actor_type: "ai_agent",
      actor_name: "onboarding-ai",
      action: "onboarding.ai_processed",
      entity_type: "onboarding_submission",
      entity_id: submissionId,
      summary: `AI extracted ${fieldsUpdated.length} client field(s) + ${Object.keys(extracted.service_config).length} service config key(s) for ${serviceName}`,
      metadata: {
        service_id: cs.service_id,
        fields_updated: fieldsUpdated,
        service_config_keys: Object.keys(extracted.service_config),
        summary: extracted.summary,
      },
    });
  } catch (err) {
    log.warn("[onboarding-ai] Failed to log admin activity:", { error: String(err) });
  }

  // WebCare-specific: extract and store WordPress credentials if present
  if (cs.service_id.startsWith("webcare")) {
    try {
      await extractAndStoreWebcareCredentials(cs.id, submission.client_id!, responses as Record<string, any>, extracted.service_config);
    } catch (err: any) {
      log.warn(`[onboarding-ai] WebCare credential extraction failed for submission #${submissionId}:`, { error: err.message });
    }
  }

  log.info(`[onboarding-ai] Processed submission #${submissionId} for ${serviceName} — ${fieldsUpdated.length} client fields, ${Object.keys(extracted.service_config).length} config keys`);

  return {
    processed: true,
    clientFieldsUpdated: fieldsUpdated,
    serviceConfigKeys: Object.keys(extracted.service_config),
  };
}

/* ─── WebCare Credential Extraction ────────────────────────────────── */

/**
 * Extract CMS credentials from onboarding form responses and store them
 * encrypted in client_service.metadata.
 *
 * Supports multiple CMS platforms:
 * - WordPress: cms_url, cms_username, cms_app_password
 * - Wix: wix_api_key, wix_site_id
 * - Shopify: shopify_store, shopify_access_token, shopify_blog_id
 * - Squarespace: squarespace_api_key
 *
 * Looks for credentials in both:
 * 1. Raw form responses
 * 2. AI-extracted service_config
 *
 * NOTE: WordPress Application Passwords are different from regular login
 * passwords. The onboarding instructions should tell the client to generate
 * an Application Password from: WordPress Admin → Users → Profile →
 * Application Passwords.
 */
async function extractAndStoreWebcareCredentials(
  clientServiceId: number,
  clientId: number,
  responses: Record<string, any>,
  serviceConfig: Record<string, any>,
): Promise<void> {
  if (!isEncryptionConfigured()) {
    log.warn("[onboarding-ai] TOKEN_ENCRYPTION_KEY not set — cannot encrypt credentials");
    return;
  }

  // Merge raw responses and AI-extracted config — raw responses take priority
  const merged: Record<string, string> = {};
  const allSources = [serviceConfig, responses];
  for (const source of allSources) {
    if (!source || typeof source !== "object") continue;
    for (const [key, val] of Object.entries(source)) {
      if (typeof val === "string" && val.trim()) {
        merged[key.toLowerCase().replace(/[^a-z0-9_]/g, "_")] = val.trim();
      } else if (val && typeof val === "object" && "value" in val && typeof val.value === "string") {
        // Handle { value: "...", completed_at: "..." } response format
        merged[key.toLowerCase().replace(/[^a-z0-9_]/g, "_")] = val.value.trim();
      }
    }
  }

  // Detect CMS platform from form responses
  const cmsPlatform = (
    merged.cms_platform || merged.platform || ""
  ).toLowerCase().trim();

  const cs = await storage.getClientServiceById(clientServiceId);
  if (!cs) return;
  const csMeta = (cs.metadata as Record<string, any>) || {};

  // Route to platform-specific credential extraction
  if (cmsPlatform === "wix" || cmsPlatform === "wix.com") {
    await extractWixCredentials(clientServiceId, clientId, merged, csMeta);
  } else if (cmsPlatform === "shopify" || cmsPlatform === "shopify.com") {
    await extractShopifyCredentials(clientServiceId, clientId, merged, csMeta);
  } else if (cmsPlatform === "squarespace" || cmsPlatform === "squarespace.com") {
    await extractSquarespaceCredentials(clientServiceId, clientId, merged, csMeta);
  } else {
    // Default to WordPress credential extraction (backwards compatible)
    await extractWordpressCredentials(clientServiceId, clientId, merged, csMeta);
  }

  // Store CMS platform in metadata for platform detection
  if (cmsPlatform) {
    const freshCs = await storage.getClientServiceById(clientServiceId);
    const freshMeta = (freshCs?.metadata as Record<string, any>) || {};
    await db.update(clientServices)
      .set({
        metadata: { ...freshMeta, cms_platform: cmsPlatform },
        updated_at: new Date(),
      })
      .where(eq(clientServices.id, clientServiceId));
  }
}

async function extractWordpressCredentials(
  clientServiceId: number,
  clientId: number,
  merged: Record<string, string>,
  csMeta: Record<string, any>,
): Promise<void> {
  // Attempt to find CMS URL
  const cmsUrl =
    merged.cms_url || merged.admin_url || merged.wordpress_url ||
    merged.wp_url || merged.website_admin_url || merged.site_url ||
    merged.cms_admin_url || null;

  // Attempt to find username
  const username =
    merged.cms_username || merged.wp_username || merged.wordpress_username ||
    merged.admin_username || merged.wp_user || null;

  // Attempt to find application password
  const appPassword =
    merged.cms_password || merged.wp_app_password || merged.wordpress_password ||
    merged.cms_app_password || merged.application_password ||
    merged.wp_password || merged.admin_password || null;

  // Need all three to store credentials
  if (!cmsUrl || !username || !appPassword) {
    log.debug("[onboarding-ai] WebCare onboarding: incomplete WordPress credentials", {
      hasUrl: !!cmsUrl,
      hasUsername: !!username,
      hasPassword: !!appPassword,
    });
    return;
  }

  // Normalize the CMS URL — strip trailing slashes and /wp-admin paths
  let normalizedUrl = cmsUrl
    .replace(/\/wp-admin\/?$/, "")
    .replace(/\/wp-login\.php\/?$/, "")
    .replace(/\/+$/, "");

  // Ensure https:// prefix
  if (!normalizedUrl.startsWith("http")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  // Encrypt the application password
  const encryptedPassword = encryptToken(appPassword);

  const updatedMeta = {
    ...csMeta,
    wordpress_credentials: {
      cms_url: normalizedUrl,
      cms_username: username,
      cms_app_password: encryptedPassword,
      configured_at: new Date().toISOString(),
      source: "onboarding_form",
    },
  };

  await db.update(clientServices)
    .set({ metadata: updatedMeta, updated_at: new Date() })
    .where(eq(clientServices.id, clientServiceId));

  log.info(`[onboarding-ai] Stored WordPress credentials for cs#${clientServiceId} (client#${clientId})`);
}

async function extractWixCredentials(
  clientServiceId: number,
  clientId: number,
  merged: Record<string, string>,
  csMeta: Record<string, any>,
): Promise<void> {
  const apiKey = merged.wix_api_key || merged.wix_key || merged.api_key || null;
  const siteId = merged.wix_site_id || merged.site_id || null;

  if (!apiKey) {
    log.debug("[onboarding-ai] WebCare onboarding: missing Wix API key");
    return;
  }

  const updatedMeta = {
    ...csMeta,
    wix_credentials: {
      wix_api_key: encryptToken(apiKey),
      wix_site_id: siteId || "",
      configured_at: new Date().toISOString(),
      source: "onboarding_form",
    },
  };

  await db.update(clientServices)
    .set({ metadata: updatedMeta, updated_at: new Date() })
    .where(eq(clientServices.id, clientServiceId));

  log.info(`[onboarding-ai] Stored Wix credentials for cs#${clientServiceId} (client#${clientId})`);
}

async function extractShopifyCredentials(
  clientServiceId: number,
  clientId: number,
  merged: Record<string, string>,
  csMeta: Record<string, any>,
): Promise<void> {
  const store = merged.shopify_store || merged.store_name || merged.shopify_store_name || null;
  const accessToken = merged.shopify_access_token || merged.access_token || merged.shopify_token || null;
  const blogId = merged.shopify_blog_id || merged.blog_id || null;

  if (!store || !accessToken) {
    log.debug("[onboarding-ai] WebCare onboarding: incomplete Shopify credentials", {
      hasStore: !!store,
      hasToken: !!accessToken,
      hasBlogId: !!blogId,
    });
    return;
  }

  const updatedMeta = {
    ...csMeta,
    shopify_credentials: {
      shopify_store: store,
      shopify_access_token: encryptToken(accessToken),
      shopify_blog_id: blogId || "",
      configured_at: new Date().toISOString(),
      source: "onboarding_form",
    },
  };

  await db.update(clientServices)
    .set({ metadata: updatedMeta, updated_at: new Date() })
    .where(eq(clientServices.id, clientServiceId));

  log.info(`[onboarding-ai] Stored Shopify credentials for cs#${clientServiceId} (client#${clientId})`);
}

async function extractSquarespaceCredentials(
  clientServiceId: number,
  clientId: number,
  merged: Record<string, string>,
  csMeta: Record<string, any>,
): Promise<void> {
  const apiKey = merged.squarespace_api_key || merged.squarespace_key || null;

  // Squarespace uses email fallback, so API key is optional
  const updatedMeta = {
    ...csMeta,
    squarespace_credentials: {
      squarespace_api_key: apiKey ? encryptToken(apiKey) : null,
      configured_at: new Date().toISOString(),
      source: "onboarding_form",
    },
  };

  await db.update(clientServices)
    .set({ metadata: updatedMeta, updated_at: new Date() })
    .where(eq(clientServices.id, clientServiceId));

  log.info(`[onboarding-ai] Stored Squarespace credentials for cs#${clientServiceId} (client#${clientId})`);
}
