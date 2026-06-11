/**
 * Sending-domain pool — Lane OA.
 *
 * Cold outreach NEVER sends from the primary brand domain. This module owns:
 *   1. The HARD DENYLIST: wefixtrades.com and every subdomain are rejected
 *      at insert (routes) AND at campaign verify-link (here).
 *   2. verify-link: the FROZEN response contract Lane C compiles against —
 *      `{ linked, verified, platform_status, email_accounts: [{email, domain}] }`.
 *      `verified` additionally asserts the campaign's Smartlead email-account
 *      domains are a subset of the ACTIVE pool.
 *   3. Domain health sync from Smartlead analytics (trailing 7 days) with
 *      auto-pause at bounce > 3% or complaint > 0.1%.
 *
 * DB access is lazy-imported so the pure helpers (denylist, health
 * evaluation, verify-link assembly) stay hermetically testable without
 * DATABASE_URL.
 */

import { eq, and, isNotNull, inArray } from "drizzle-orm";
import type {
  SmartleadClientLike,
  SmartleadEmailAccount,
} from "./smartleadClient";
import { createLogger } from "../../lib/logger";

const log = createLogger("sendingDomainPool");

/* ─── Hard denylist (pure) ─── */

/** The brand domain cold outreach must NEVER send from. */
export const DENYLISTED_ROOT_DOMAIN = "wefixtrades.com";

/** Lowercase, trim, strip trailing dot and any accidental scheme/path. */
export function normalizeDomain(raw: string): string {
  let d = String(raw ?? "").trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // scheme
  d = d.split("/")[0].split("?")[0].split("#")[0]; // path/query/fragment
  d = d.replace(/^.*@/, ""); // userinfo (defensive)
  d = d.split(":")[0]; // port
  if (d.endsWith(".")) d = d.slice(0, -1); // trailing dot (DNS root)
  return d;
}

/**
 * True when `domain` is wefixtrades.com or ANY subdomain of it.
 * Suffix-with-dot matching: `notwefixtrades.com` and
 * `wefixtrades.com.attacker.com` are NOT denied (different domains).
 */
export function isDeniedSendingDomain(domain: string): boolean {
  const d = normalizeDomain(domain);
  return d === DENYLISTED_ROOT_DOMAIN || d.endsWith(`.${DENYLISTED_ROOT_DOMAIN}`);
}

/** Domain part of an email address ("" when malformed). */
export function extractEmailDomain(email: string): string {
  const at = String(email ?? "").lastIndexOf("@");
  if (at < 0) return "";
  return normalizeDomain(String(email).slice(at + 1));
}

/* ─── Verify-link (FROZEN CONTRACT — Lane C compiles against this) ─── */

export interface VerifyLinkEmailAccount {
  email: string;
  domain: string;
}

/**
 * FROZEN: `GET /api/admin/outbound/campaigns/:id/verify-link` returns
 * exactly this shape. Do NOT add, rename, or remove keys.
 */
export interface VerifyLinkResult {
  linked: boolean;
  verified: boolean;
  platform_status: string;
  email_accounts: VerifyLinkEmailAccount[];
}

function accountEmail(acct: SmartleadEmailAccount): string {
  return String(acct.from_email ?? acct.email ?? acct.username ?? "").trim().toLowerCase();
}

/**
 * Pure assembly of the verify-link result from already-fetched platform
 * data + the set of ACTIVE pool domains. Exported separately so the frozen
 * shape is unit-testable without a DB or network.
 *
 * verified = linked AND ≥1 email account AND every account domain is
 * (a) NOT denylisted and (b) ∈ active pool.
 */
export function buildVerifyLinkResult(input: {
  campaignStatus: string | null;
  emailAccounts: SmartleadEmailAccount[];
  activePoolDomains: ReadonlySet<string>;
}): VerifyLinkResult {
  const linked = input.campaignStatus !== null;
  const email_accounts: VerifyLinkEmailAccount[] = input.emailAccounts
    .map((a) => {
      const email = accountEmail(a);
      return { email, domain: extractEmailDomain(email) };
    })
    .filter((a) => a.email.length > 0);

  const allDomainsHealthy =
    email_accounts.length > 0 &&
    email_accounts.every(
      (a) =>
        a.domain.length > 0 &&
        !isDeniedSendingDomain(a.domain) &&
        input.activePoolDomains.has(a.domain),
    );

  return {
    linked,
    verified: linked && allDomainsHealthy,
    platform_status: input.campaignStatus ?? "not_found",
    email_accounts,
  };
}

/**
 * Full verify-link flow against the platform: fetch campaign + email
 * accounts from Smartlead, fetch the ACTIVE pool from the DB, assemble the
 * frozen contract.
 */
export async function verifyCampaignLink(
  client: SmartleadClientLike,
  externalCampaignId: string,
): Promise<VerifyLinkResult> {
  const campaign = await client.getCampaign(externalCampaignId);
  if (!campaign) {
    return buildVerifyLinkResult({
      campaignStatus: null,
      emailAccounts: [],
      activePoolDomains: new Set(),
    });
  }
  const [accounts, activePoolDomains] = await Promise.all([
    client.listCampaignEmailAccounts(externalCampaignId),
    getActivePoolDomains(),
  ]);
  return buildVerifyLinkResult({
    campaignStatus: String(campaign.status ?? "unknown"),
    emailAccounts: accounts,
    activePoolDomains,
  });
}

/** Set of pool domains currently in status 'active'. */
export async function getActivePoolDomains(): Promise<Set<string>> {
  const { db } = await import("../../db");
  const { outreachSendingDomains } = await import("@shared/schema");
  const rows = await db
    .select({ domain: outreachSendingDomains.domain })
    .from(outreachSendingDomains)
    .where(eq(outreachSendingDomains.status, "active"));
  return new Set(rows.map((r) => normalizeDomain(r.domain)));
}

/* ─── Domain health (pure evaluation + sync) ─── */

/** Auto-pause thresholds over the trailing 7-day window (fractions). */
export const BOUNCE_RATE_PAUSE_THRESHOLD = 0.03; // > 3%
export const COMPLAINT_RATE_PAUSE_THRESHOLD = 0.001; // > 0.1%

/** Below this many sends the rates are statistical noise — never auto-pause. */
export const MIN_SENT_FOR_AUTO_PAUSE = 50;

export interface DomainHealthInput {
  sent: number;
  bounced: number;
  complaints: number;
}

export interface DomainHealthVerdict {
  bounceRate: number;
  complaintRate: number;
  shouldPause: boolean;
  reason: string | null;
}

export function evaluateDomainHealth(input: DomainHealthInput): DomainHealthVerdict {
  const sent = Math.max(0, input.sent);
  const bounceRate = sent > 0 ? input.bounced / sent : 0;
  const complaintRate = sent > 0 ? input.complaints / sent : 0;

  let reason: string | null = null;
  if (sent >= MIN_SENT_FOR_AUTO_PAUSE) {
    if (bounceRate > BOUNCE_RATE_PAUSE_THRESHOLD) {
      reason = `bounce rate ${(bounceRate * 100).toFixed(2)}% > ${BOUNCE_RATE_PAUSE_THRESHOLD * 100}% over trailing 7d (${input.bounced}/${sent})`;
    } else if (complaintRate > COMPLAINT_RATE_PAUSE_THRESHOLD) {
      reason = `complaint rate ${(complaintRate * 100).toFixed(3)}% > ${COMPLAINT_RATE_PAUSE_THRESHOLD * 100}% over trailing 7d (${input.complaints}/${sent})`;
    }
  }
  return { bounceRate, complaintRate, shouldPause: reason !== null, reason };
}

/**
 * Pure aggregation of per-campaign analytics into per-domain stats.
 * Smartlead exposes analytics per CAMPAIGN, not per domain, so a
 * campaign's counts are split EVENLY across its distinct sending domains
 * (documented approximation — accounts on the same campaign share load
 * via Smartlead rotation).
 */
export function aggregateDomainStats(
  campaigns: Array<{ domains: string[]; sent: number; bounced: number; complaints: number }>,
): Map<string, DomainHealthInput> {
  const byDomain = new Map<string, DomainHealthInput>();
  for (const c of campaigns) {
    const domains = [...new Set(c.domains.map(normalizeDomain).filter((d) => d.length > 0))];
    if (domains.length === 0) continue;
    const share = 1 / domains.length;
    for (const d of domains) {
      const agg = byDomain.get(d) ?? { sent: 0, bounced: 0, complaints: 0 };
      agg.sent += c.sent * share;
      agg.bounced += c.bounced * share;
      agg.complaints += c.complaints * share;
      byDomain.set(d, agg);
    }
  }
  return byDomain;
}

export interface DomainHealthSyncSummary {
  campaignsScanned: number;
  domainsSynced: number;
  autoPaused: Array<{ domain: string; reason: string }>;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Syncs pool-domain health from Smartlead: for every smartlead-linked
 * campaign in outbound_campaigns, pull trailing-7-day analytics + email
 * accounts, aggregate per domain, persist bounce/complaint rates, and
 * auto-pause warming/active domains that breach the thresholds.
 * 'paused' and 'burned' domains get their rates refreshed but never
 * transition automatically.
 */
export async function syncDomainHealth(
  client: SmartleadClientLike,
  nowFn: () => Date = () => new Date(),
): Promise<DomainHealthSyncSummary> {
  const { db } = await import("../../db");
  const { outboundCampaigns, outreachSendingDomains } = await import("@shared/schema");

  const campaignRows = await db
    .select({
      id: outboundCampaigns.id,
      external_campaign_id: outboundCampaigns.external_campaign_id,
    })
    .from(outboundCampaigns)
    .where(
      and(
        eq(outboundCampaigns.platform, "smartlead"),
        isNotNull(outboundCampaigns.external_campaign_id),
        inArray(outboundCampaigns.status, ["active", "paused"]),
      ),
    );

  const now = nowFn();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const perCampaign: Array<{ domains: string[]; sent: number; bounced: number; complaints: number }> = [];
  for (const row of campaignRows) {
    const extId = row.external_campaign_id as string;
    try {
      const [accounts, analytics] = await Promise.all([
        client.listCampaignEmailAccounts(extId),
        client.getCampaignAnalyticsByDate(extId, isoDate(start), isoDate(now)),
      ]);
      perCampaign.push({
        domains: accounts
          .map((a) => extractEmailDomain(String(a.from_email ?? a.email ?? a.username ?? "")))
          .filter((d) => d.length > 0),
        sent: analytics.sent_count,
        bounced: analytics.bounce_count,
        complaints: analytics.complaint_count,
      });
    } catch (err) {
      // Skip this campaign but keep the sweep going; client already redacts.
      log.warn("domain health sync: campaign fetch failed", {
        campaign_id: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const statsByDomain = aggregateDomainStats(perCampaign);
  const poolRows = await db.select().from(outreachSendingDomains);

  const summary: DomainHealthSyncSummary = {
    campaignsScanned: campaignRows.length,
    domainsSynced: 0,
    autoPaused: [],
  };

  for (const pool of poolRows) {
    const stats = statsByDomain.get(normalizeDomain(pool.domain));
    if (!stats) continue;
    const verdict = evaluateDomainHealth({
      sent: Math.round(stats.sent),
      bounced: Math.round(stats.bounced),
      complaints: Math.round(stats.complaints),
    });

    const autoPause =
      verdict.shouldPause && (pool.status === "active" || pool.status === "warming");

    await db
      .update(outreachSendingDomains)
      .set({
        bounce_rate: verdict.bounceRate,
        complaint_rate: verdict.complaintRate,
        last_synced_at: now,
        updated_at: now,
        ...(autoPause
          ? { status: "paused", paused_reason: `auto: ${verdict.reason}` }
          : {}),
      })
      .where(eq(outreachSendingDomains.id, pool.id));

    summary.domainsSynced += 1;
    if (autoPause) {
      summary.autoPaused.push({ domain: pool.domain, reason: verdict.reason as string });
      log.warn("sending domain AUTO-PAUSED", { domain: pool.domain, reason: verdict.reason });
    }
  }

  return summary;
}
