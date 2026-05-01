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
  type ClientService,
} from "@shared/schema";
import { getTradeLineReadiness } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("ReadinessChecker");

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

  const configReadiness = getTradeLineReadiness(config);
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
