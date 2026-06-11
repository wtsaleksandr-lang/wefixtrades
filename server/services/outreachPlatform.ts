/**
 * Outreach Platform Abstraction — V1
 *
 * Provides a single interface for Instantly and Smartlead.
 * Instantly + Smartlead are both real; Smartlead rides the rate-limited,
 * query-param-redacting client in ./sending/smartleadClient.ts (Lane OA).
 *
 * DO NOT add email-sending or sequence-editing logic here.
 * This layer only: creates leads, adds them to campaigns,
 * pauses/removes leads, pushes global suppression, and parses
 * incoming webhook payloads.
 */

import {
  SmartleadClient,
  isSmartleadConfigured,
  type SmartleadClientLike,
} from "./sending/smartleadClient";
import { MockSmartleadClient } from "./sending/mockSmartlead";
import { createLogger } from "../lib/logger";

const platformLog = createLogger("outreachPlatform");

export type OutreachPlatform = "instantly" | "smartlead";

/**
 * A campaign is in dry-run mode when its metadata flag is set OR the global
 * OUTBOUND_DRY_RUN env var is "true". In dry-run, the NoopAdapter is selected:
 * it returns a `dryrun-<...>` lead id and makes ZERO external API calls — this
 * is the test-mode safety guarantee for exercising a campaign without
 * registering real leads into Instantly/Smartlead.
 */
export function isDryRun(campaignMetadata?: Record<string, unknown> | null): boolean {
  if (process.env.OUTBOUND_DRY_RUN === "true") return true;
  return campaignMetadata?.dry_run === true;
}

export interface OutreachLead {
  email: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  website?: string;
  phone?: string;
  personalizationLine?: string;
  customFields?: Record<string, string>;
}

export interface OutreachLeadResult {
  externalLeadId: string;
  status: "created" | "updated" | "exists" | "dry_run";
}

export interface OutreachWebhookEvent {
  platform: OutreachPlatform;
  eventType:
    | "email_sent"
    | "email_opened"
    | "email_clicked"
    | "replied"
    | "bounced"
    | "unsubscribed"
    | "opted_out";
  externalLeadId: string;
  externalCampaignId: string;
  email: string;
  occurredAt: Date;
  rawPayload: Record<string, unknown>;
}

/* ─── Platform adapter interface ─── */

/**
 * FROZEN CONTRACT (Lane B calls pushGlobalSuppression via this factory):
 * `pushGlobalSuppression(emails: string[]): Promise<{ suppressed: number }>`
 * — `suppressed` is the count of emails ACTUALLY suppressed on the
 * platform. Platforms without a global-suppression API return
 * `{ suppressed: 0 }` honestly (never fake success).
 */
export interface PlatformAdapter {
  addLeadToCampaign(
    campaignId: string,
    lead: OutreachLead
  ): Promise<OutreachLeadResult>;
  pauseLead(campaignId: string, externalLeadId: string): Promise<void>;
  removeLead(campaignId: string, externalLeadId: string): Promise<void>;
  pushGlobalSuppression(emails: string[]): Promise<{ suppressed: number }>;
  parseWebhook(body: Record<string, unknown>): OutreachWebhookEvent | null;
}

/* ─── Instantly adapter ─── */

class InstantlyAdapter implements PlatformAdapter {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.instantly.ai/api/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "DELETE",
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Instantly API ${method} ${path} → ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async addLeadToCampaign(
    campaignId: string,
    lead: OutreachLead
  ): Promise<OutreachLeadResult> {
    const nameParts = (lead.firstName || lead.companyName || "").split(" ");
    const payload = {
      campaign_id: campaignId,
      email: lead.email,
      first_name: lead.firstName || nameParts[0] || "",
      last_name: lead.lastName || nameParts.slice(1).join(" ") || "",
      company_name: lead.companyName || "",
      website: lead.website || "",
      phone: lead.phone || "",
      personalization: lead.personalizationLine || "",
      ...(lead.customFields || {}),
    };

    const data = await this.request<{ id?: string; lead_id?: string; status?: string }>(
      "/lead",
      "POST",
      payload
    );

    return {
      externalLeadId: data.id || data.lead_id || lead.email,
      status: "created",
    };
  }

  async pauseLead(campaignId: string, externalLeadId: string): Promise<void> {
    await this.request(`/lead/pause`, "POST", {
      campaign_id: campaignId,
      lead_id: externalLeadId,
    });
  }

  async removeLead(campaignId: string, externalLeadId: string): Promise<void> {
    await this.request(`/lead/delete`, "POST", {
      campaign_id: campaignId,
      lead_id: externalLeadId,
    });
  }

  /**
   * Instantly's v1 API exposes no verified account-wide suppression
   * endpoint, so this is HONESTLY not_supported: it suppresses nothing
   * and returns { suppressed: 0 } (per the frozen adapter contract)
   * rather than pretending. Per-campaign opt-outs still flow through the
   * webhook → outboundSafety blacklist path.
   */
  async pushGlobalSuppression(emails: string[]): Promise<{ suppressed: number }> {
    platformLog.warn("Instantly global suppression not_supported — 0 suppressed", {
      requested: emails.length,
    });
    return { suppressed: 0 };
  }

  parseWebhook(body: Record<string, unknown>): OutreachWebhookEvent | null {
    // Instantly webhook format
    const eventMap: Record<string, OutreachWebhookEvent["eventType"]> = {
      email_sent: "email_sent",
      email_opened: "email_opened",
      link_clicked: "email_clicked",
      reply_received: "replied",
      email_bounced: "bounced",
      unsubscribed: "unsubscribed",
      opted_out: "opted_out",
    };

    const rawType = String(body.event_type || body.type || "");
    const eventType = eventMap[rawType];
    if (!eventType) return null;

    return {
      platform: "instantly",
      eventType,
      externalLeadId: String(body.lead_id || body.id || ""),
      externalCampaignId: String(body.campaign_id || ""),
      email: String(body.email || ""),
      occurredAt: body.timestamp ? new Date(body.timestamp as string) : new Date(),
      rawPayload: body,
    };
  }
}

/* ─── Smartlead adapter (real — backed by sending/smartleadClient) ─── */

export class SmartleadAdapter implements PlatformAdapter {
  private readonly client: SmartleadClientLike;

  constructor(client: SmartleadClientLike) {
    this.client = client;
  }

  async addLeadToCampaign(
    campaignId: string,
    lead: OutreachLead
  ): Promise<OutreachLeadResult> {
    // Verified shape: POST /campaigns/{id}/leads with { lead_list: [...] };
    // non-standard merge fields ride inside `custom_fields`.
    const result = await this.client.addLeads(campaignId, [
      {
        email: lead.email,
        first_name: lead.firstName || "",
        last_name: lead.lastName || "",
        company_name: lead.companyName || "",
        website: lead.website || "",
        phone_number: lead.phone || "",
        custom_fields: {
          ...(lead.personalizationLine
            ? { personalization: lead.personalizationLine }
            : {}),
          ...(lead.customFields || {}),
        },
      },
    ]);

    // The bulk endpoint doesn't echo per-lead ids; resolve via lead lookup
    // (mock-safe) and fall back to the email as a stable external ref.
    const found = await this.client.getLeadByEmail(lead.email);
    const status: OutreachLeadResult["status"] =
      result.already_added_to_campaign > 0 || result.duplicate_count > 0
        ? "exists"
        : "created";
    return {
      externalLeadId: found ? String(found.id) : lead.email,
      status: this.client.isMock ? "dry_run" : status,
    };
  }

  async pauseLead(campaignId: string, externalLeadId: string): Promise<void> {
    await this.client.pauseLeadInCampaign(campaignId, externalLeadId);
  }

  async removeLead(campaignId: string, externalLeadId: string): Promise<void> {
    await this.client.deleteLeadFromCampaign(campaignId, externalLeadId);
  }

  /**
   * Smartlead global suppression: resolve each email to its lead id
   * (GET /leads?email=) then POST /leads/{id}/unsubscribe — documented to
   * unsubscribe the lead from ALL campaigns and block future re-adds.
   * Emails Smartlead has never seen cannot be suppressed there; they are
   * skipped and NOT counted (honest count, never faked).
   */
  async pushGlobalSuppression(emails: string[]): Promise<{ suppressed: number }> {
    let suppressed = 0;
    for (const email of emails) {
      const trimmed = String(email ?? "").trim();
      if (!trimmed) continue;
      const lead = await this.client.getLeadByEmail(trimmed);
      if (!lead) continue;
      await this.client.unsubscribeLeadGlobal(lead.id);
      suppressed += 1;
    }
    return { suppressed };
  }

  parseWebhook(body: Record<string, unknown>): OutreachWebhookEvent | null {
    const eventMap: Record<string, OutreachWebhookEvent["eventType"]> = {
      EMAIL_SENT: "email_sent",
      EMAIL_OPEN: "email_opened",
      LINK_CLICK: "email_clicked",
      REPLY: "replied",
      BOUNCE: "bounced",
      UNSUBSCRIBE: "unsubscribed",
    };

    const rawType = String(body.event_type || "");
    const eventType = eventMap[rawType];
    if (!eventType) return null;

    return {
      platform: "smartlead",
      eventType,
      externalLeadId: String(body.lead_id || ""),
      externalCampaignId: String(body.campaign_id || ""),
      email: String(body.to_email || body.email || ""),
      occurredAt: body.created_at ? new Date(body.created_at as string) : new Date(),
      rawPayload: body,
    };
  }
}

/* ─── No-op (dry-run / test) adapter ─── */

/**
 * Test-mode adapter. Makes NO external network calls of any kind.
 * Returns a deterministic `dryrun-<email>` lead id so callers can exercise
 * the full sync path (status transitions, event logging, rate-limit counting)
 * without registering a single real lead into Instantly/Smartlead.
 *
 * Selected by getOutreachAdapter() when isDryRun() is true. This is the
 * hard safety boundary for campaign testing.
 */
export class NoopAdapter implements PlatformAdapter {
  async addLeadToCampaign(
    _campaignId: string,
    lead: OutreachLead
  ): Promise<OutreachLeadResult> {
    return {
      externalLeadId: `dryrun-${lead.email || "lead"}`,
      status: "dry_run",
    };
  }

  async pauseLead(): Promise<void> {
    // no-op
  }

  async removeLead(): Promise<void> {
    // no-op
  }

  /**
   * Dry-run: reports the would-be suppression count without any external
   * call. Callers can distinguish dry-run via isDryRun()/campaign metadata.
   */
  async pushGlobalSuppression(emails: string[]): Promise<{ suppressed: number }> {
    return { suppressed: emails.length };
  }

  parseWebhook(): OutreachWebhookEvent | null {
    return null;
  }
}

/* ─── Factory ─── */

export function getOutreachAdapter(
  platform: OutreachPlatform,
  campaignMetadata?: Record<string, unknown> | null
): PlatformAdapter {
  // Dry-run short-circuits BEFORE any key lookup or network setup — the no-op
  // path never needs a platform API key and never touches the network.
  if (isDryRun(campaignMetadata)) {
    return new NoopAdapter();
  }

  if (platform === "instantly") {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) throw new Error("INSTANTLY_API_KEY env var is not set");
    return new InstantlyAdapter(key);
  }

  if (platform === "smartlead") {
    // Key-absent behaviour (Lane OA contract): the factory returns the
    // MOCK-backed adapter — zero network calls, results carry the honest
    // `dry_run` status marker. HTTP routes must additionally gate on
    // isSmartleadConfigured() and answer { error: "not_configured" }
    // instead of serving mock results as real.
    if (!isSmartleadConfigured()) {
      platformLog.warn(
        "SMARTLEAD_API_KEY absent — returning mock Smartlead adapter (dry_run results only)"
      );
      return new SmartleadAdapter(new MockSmartleadClient());
    }
    return new SmartleadAdapter(
      new SmartleadClient(process.env.SMARTLEAD_API_KEY as string)
    );
  }

  throw new Error(`Unknown outreach platform: ${platform}`);
}

/**
 * Parse a raw webhook body from any supported platform.
 * The platform is detected from the X-Platform header or request path.
 */
export function parseOutreachWebhook(
  platform: OutreachPlatform,
  body: Record<string, unknown>
): OutreachWebhookEvent | null {
  try {
    const adapter = getOutreachAdapter(platform);
    return adapter.parseWebhook(body);
  } catch {
    // API key not configured — still try to parse for local dev
    if (platform === "instantly") {
      return new InstantlyAdapter("dev").parseWebhook(body);
    }
    if (platform === "smartlead") {
      // parseWebhook is pure — the mock-backed adapter never touches the network.
      return new SmartleadAdapter(new MockSmartleadClient()).parseWebhook(body);
    }
    return null;
  }
}
