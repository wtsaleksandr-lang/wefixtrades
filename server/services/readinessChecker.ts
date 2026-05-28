/**
 * Service Readiness Checker
 *
 * Exports per-service readiness functions that determine whether a
 * client_service in "onboarding" status meets all prerequisites for
 * auto-activation. Each function returns { ready, issues } — the
 * issues array lists what is still missing.
 *
 * Used by the auto-activation worker to eliminate manual go-live gates.
 */

import { db } from "../db";
import { storage } from "../storage";
import {
  fulfillmentTasks,
  tradelinePhoneSetups,
  type ClientService,
} from "@shared/schema";
import { getTradeLineReadiness, type TradeLinePhoneSetupHealth } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { getTwilioClient, isTwilioConfigured } from "../twilioClient";

const log = createLogger("ReadinessChecker");

/**
 * Wave 76 — small in-memory cache keyed by IncomingPhoneNumber SID so the
 * readiness check doesn't spam Twilio every time the worker tick fires.
 * 5-minute TTL is generous — webhook URLs only drift when ops mutates them.
 */
const WEBHOOK_CACHE_TTL_MS = 5 * 60 * 1000;
interface WebhookCacheEntry {
  voiceAttached: boolean;
  smsAttached: boolean;
  cachedAt: number;
}
const WEBHOOK_CACHE = new Map<string, WebhookCacheEntry>();

async function fetchTwilioWebhookAttachment(sid: string): Promise<{ voiceAttached: boolean; smsAttached: boolean } | null> {
  const now = Date.now();
  const cached = WEBHOOK_CACHE.get(sid);
  if (cached && now - cached.cachedAt < WEBHOOK_CACHE_TTL_MS) {
    return { voiceAttached: cached.voiceAttached, smsAttached: cached.smsAttached };
  }
  if (!isTwilioConfigured()) return null;
  try {
    const client = getTwilioClient();
    const resource: any = await client.incomingPhoneNumbers(sid).fetch();
    const voiceUrl: string = resource?.voiceUrl ?? resource?.voice_url ?? "";
    const smsUrl: string = resource?.smsUrl ?? resource?.sms_url ?? "";
    const entry: WebhookCacheEntry = {
      voiceAttached: typeof voiceUrl === "string" && voiceUrl.trim().length > 0,
      smsAttached: typeof smsUrl === "string" && smsUrl.trim().length > 0,
      cachedAt: now,
    };
    WEBHOOK_CACHE.set(sid, entry);
    return { voiceAttached: entry.voiceAttached, smsAttached: entry.smsAttached };
  } catch (err) {
    log.warn("Twilio incomingPhoneNumbers fetch failed (treating as no signal)", {
      sid: `...${sid.slice(-4)}`,
      err: (err as Error).message,
    });
    return null;
  }
}

export interface ReadinessResult {
  ready: boolean;
  issues: string[];
}

/** Service IDs that must stay manual (one-time design/build services) */
const MANUAL_SERVICES = new Set([
  "sitelaunch",
  "sitelaunch-template",
  "webfix",
]);

/**
 * Returns true if the given service_id should never be auto-activated.
 */
export function isManualService(serviceId: string): boolean {
  return MANUAL_SERVICES.has(serviceId);
}

// ────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────

/**
 * Count non-human-review fulfillment tasks that are not yet delivered or cancelled.
 * These are the tasks the system expects to be done before auto-activation.
 */
async function countIncompleteNonHumanReviewTasks(clientServiceId: number): Promise<number> {
  const [row] = await db.select({ total: sql<number>`count(*)::int` })
    .from(fulfillmentTasks)
    .where(and(
      eq(fulfillmentTasks.client_service_id, clientServiceId),
      eq(fulfillmentTasks.human_review_required, false),
      sql`${fulfillmentTasks.status} NOT IN ('delivered', 'cancelled')`,
    ));
  return row?.total ?? 0;
}

/**
 * Build the standard "non-human-review tasks incomplete" issue if any remain.
 */
async function checkNonHumanReviewTasks(clientServiceId: number): Promise<string[]> {
  const count = await countIncompleteNonHumanReviewTasks(clientServiceId);
  if (count > 0) {
    return [`${count} non-human-review fulfillment task(s) still pending`];
  }
  return [];
}

// ────────────────────────────────────────────────────────────────
// Per-service readiness checkers
// ────────────────────────────────────────────────────────────────

/**
 * TradeLine — reuses the existing pure-logic readiness function from the schema,
 * plus checks that non-human-review tasks are done.
 */
async function checkTradeLine(cs: ClientService): Promise<ReadinessResult> {
  const issues: string[] = [];

  const config = await storage.getTradeLineConfig(cs.id);
  if (!config) {
    return { ready: false, issues: ["TradeLine config not initialized"] };
  }

  // Wave 76 — pull tradeline_phone_setups for this client to extend the
  // readiness check with provisioning_status + live Twilio webhook attachment.
  // Mirrors the audit fix: a number can be marked "provisioned" in our DB but
  // still have empty voiceUrl/smsUrl on Twilio's side if the webhooks were
  // never wired on the create call.
  let phoneSetupHealth: TradeLinePhoneSetupHealth | undefined;
  try {
    const [setupRow] = await db
      .select({
        provisioningStatus: tradelinePhoneSetups.provisioning_status,
        assignedNumberSid: tradelinePhoneSetups.assigned_number_sid,
      })
      .from(tradelinePhoneSetups)
      .where(eq(tradelinePhoneSetups.client_id, cs.client_id))
      .limit(1);

    if (setupRow) {
      phoneSetupHealth = {
        provisioningStatus: (setupRow.provisioningStatus as TradeLinePhoneSetupHealth["provisioningStatus"]) ?? null,
        voiceWebhookAttached: null,
        smsWebhookAttached: null,
      };

      if (setupRow.assignedNumberSid && setupRow.provisioningStatus === "provisioned") {
        const live = await fetchTwilioWebhookAttachment(setupRow.assignedNumberSid);
        if (live) {
          phoneSetupHealth.voiceWebhookAttached = live.voiceAttached;
          phoneSetupHealth.smsWebhookAttached = live.smsAttached;
        }
      }
    }
  } catch (err) {
    log.warn("phone-setup health lookup failed (treating as no signal)", {
      clientId: cs.client_id,
      err: (err as Error).message,
    });
  }

  const configReadiness = getTradeLineReadiness(config, phoneSetupHealth);
  issues.push(...configReadiness.issues);

  const taskIssues = await checkNonHumanReviewTasks(cs.id);
  issues.push(...taskIssues);

  return { ready: issues.length === 0, issues };
}

/**
 * QuoteQuick — calculator exists with at least 1 question configured,
 * plus non-human-review tasks done.
 */
async function checkQuoteQuick(cs: ClientService): Promise<ReadinessResult> {
  const issues: string[] = [];

  // Find calculator for this client via client → user → calculator
  const client = await storage.getClientById(cs.client_id);
  if (!client) {
    return { ready: false, issues: ["Client not found"] };
  }

  if (client.user_id) {
    const calcs = await storage.getCalculatorsByUserId(client.user_id);
    if (calcs.length === 0) {
      issues.push("No calculator exists for this client");
    } else {
      // Check that at least one calculator has a valid pricing config
      const hasConfig = calcs.some((calc) => {
        const config = calc.pricing_config as any;
        return config && typeof config === "object" && config.pricingType;
      });
      if (!hasConfig) {
        issues.push("Calculator has no pricing configuration");
      }
    }
  } else {
    issues.push("Client has no linked user account — cannot locate calculator");
  }

  const taskIssues = await checkNonHumanReviewTasks(cs.id);
  issues.push(...taskIssues);

  return { ready: issues.length === 0, issues };
}

/**
 * ReputationShield — client has google_place_id (monitored review source),
 * plus non-human-review tasks done.
 */
async function checkReputationShield(cs: ClientService): Promise<ReadinessResult> {
  const issues: string[] = [];

  const client = await storage.getClientById(cs.client_id);
  if (!client) {
    return { ready: false, issues: ["Client not found"] };
  }

  if (!client.google_place_id) {
    issues.push("Client has no Google Place ID — required for review monitoring");
  }

  const taskIssues = await checkNonHumanReviewTasks(cs.id);
  issues.push(...taskIssues);

  return { ready: issues.length === 0, issues };
}

/**
 * SocialSync / ContentFlow — client has at least 1 social connection,
 * plus non-human-review tasks done.
 */
async function checkSocialSync(cs: ClientService): Promise<ReadinessResult> {
  const issues: string[] = [];

  const connections = await storage.listSocialSyncConnections(cs.client_id);
  const connected = connections.filter(
    (c) => c.connection_status === "connected" || c.connection_status === "expiring_soon",
  );
  if (connected.length === 0) {
    issues.push("No connected social platform accounts found");
  }

  const taskIssues = await checkNonHumanReviewTasks(cs.id);
  issues.push(...taskIssues);

  return { ready: issues.length === 0, issues };
}

/**
 * MapGuard — client has google_place_id set,
 * plus non-human-review tasks done.
 */
async function checkMapGuard(cs: ClientService): Promise<ReadinessResult> {
  const issues: string[] = [];

  const client = await storage.getClientById(cs.client_id);
  if (!client) {
    return { ready: false, issues: ["Client not found"] };
  }

  if (!client.google_place_id) {
    issues.push("Client has no Google Place ID set");
  }

  const taskIssues = await checkNonHumanReviewTasks(cs.id);
  issues.push(...taskIssues);

  return { ready: issues.length === 0, issues };
}

/**
 * RankFlow — client has a rankflow profile,
 * plus non-human-review tasks done.
 */
async function checkRankFlow(cs: ClientService): Promise<ReadinessResult> {
  const issues: string[] = [];

  const profile = await storage.getRankFlowProfile(cs.client_id);
  if (!profile) {
    issues.push("No RankFlow profile exists for this client");
  }

  const taskIssues = await checkNonHumanReviewTasks(cs.id);
  issues.push(...taskIssues);

  return { ready: issues.length === 0, issues };
}

/**
 * WebCare — client has website_url set,
 * plus non-human-review tasks done.
 */
async function checkWebCare(cs: ClientService): Promise<ReadinessResult> {
  const issues: string[] = [];

  const client = await storage.getClientById(cs.client_id);
  if (!client) {
    return { ready: false, issues: ["Client not found"] };
  }

  if (!client.website_url) {
    issues.push("Client has no website URL set");
  }

  const taskIssues = await checkNonHumanReviewTasks(cs.id);
  issues.push(...taskIssues);

  return { ready: issues.length === 0, issues };
}

// ────────────────────────────────────────────────────────────────
// Dispatcher
// ────────────────────────────────────────────────────────────────

/**
 * Map a service_id prefix to the appropriate readiness checker.
 * Returns null for services that should stay manual.
 */
function getCheckerForService(serviceId: string): ((cs: ClientService) => Promise<ReadinessResult>) | null {
  if (isManualService(serviceId)) return null;

  // TradeLine variants
  if (serviceId.startsWith("tradeline")) return checkTradeLine;

  // QuoteQuick
  if (serviceId.startsWith("quotequick")) return checkQuoteQuick;

  // ReputationShield
  if (serviceId.startsWith("reputationshield")) return checkReputationShield;

  // SocialSync / ContentFlow
  if (serviceId.startsWith("socialsync") || serviceId.startsWith("contentflow")) return checkSocialSync;

  // MapGuard
  if (serviceId.startsWith("mapguard")) return checkMapGuard;

  // RankFlow
  if (serviceId.startsWith("rankflow")) return checkRankFlow;

  // WebCare
  if (serviceId.startsWith("webcare")) return checkWebCare;

  // Unknown service type — skip auto-activation
  log.debug(`No readiness checker for service type: ${serviceId}`);
  return null;
}

/**
 * Check readiness for a given client service. Returns null if the
 * service type does not support auto-activation.
 */
export async function checkReadiness(cs: ClientService): Promise<ReadinessResult | null> {
  const checker = getCheckerForService(cs.service_id);
  if (!checker) return null;
  return checker(cs);
}
