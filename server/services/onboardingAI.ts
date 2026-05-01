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
    console.warn(`[onboarding-ai] Claude call failed for submission #${submissionId}:`, err.message);
    return { processed: false, reason: `ai_call_failed: ${err.message}` };
  }

  if (!extracted) {
    console.warn(`[onboarding-ai] Failed to parse Claude output for submission #${submissionId}`);
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
    console.warn("[onboarding-ai] Failed to log admin activity:", err);
  }

  console.log(`[onboarding-ai] Processed submission #${submissionId} for ${serviceName} — ${fieldsUpdated.length} client fields, ${Object.keys(extracted.service_config).length} config keys`);

  return {
    processed: true,
    clientFieldsUpdated: fieldsUpdated,
    serviceConfigKeys: Object.keys(extracted.service_config),
  };
}
