/**
 * Outreach Platform Abstraction — V1
 *
 * Provides a single interface for Instantly and Smartlead.
 * V1 implements Instantly; Smartlead is stubbed and ready.
 *
 * DO NOT add email-sending or sequence-editing logic here.
 * This layer only: creates leads, adds them to campaigns,
 * pauses/removes leads, and parses incoming webhook payloads.
 */

export type OutreachPlatform = "instantly" | "smartlead";

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
  status: "created" | "updated" | "exists";
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

interface PlatformAdapter {
  addLeadToCampaign(
    campaignId: string,
    lead: OutreachLead
  ): Promise<OutreachLeadResult>;
  pauseLead(campaignId: string, externalLeadId: string): Promise<void>;
  removeLead(campaignId: string, externalLeadId: string): Promise<void>;
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

/* ─── Smartlead adapter (stubbed for V1) ─── */

class SmartleadAdapter implements PlatformAdapter {
  private readonly apiKey: string;
  private readonly baseUrl = "https://server.smartlead.ai/api/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "DELETE",
    body?: unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}?api_key=${this.apiKey}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Smartlead API ${method} ${path} → ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async addLeadToCampaign(
    campaignId: string,
    lead: OutreachLead
  ): Promise<OutreachLeadResult> {
    const data = await this.request<{ id?: number; data?: { id: number } }>(
      `/campaigns/${campaignId}/leads`,
      "POST",
      {
        lead_list: [
          {
            email: lead.email,
            first_name: lead.firstName || "",
            last_name: lead.lastName || "",
            company_name: lead.companyName || "",
            website: lead.website || "",
            phone_number: lead.phone || "",
            personalization: lead.personalizationLine || "",
            ...(lead.customFields || {}),
          },
        ],
      }
    );

    const id = data.data?.id ?? data.id;
    return {
      externalLeadId: id ? String(id) : lead.email,
      status: "created",
    };
  }

  async pauseLead(campaignId: string, externalLeadId: string): Promise<void> {
    await this.request(`/campaigns/${campaignId}/leads/${externalLeadId}`, "POST", {
      status: "PAUSED",
    });
  }

  async removeLead(campaignId: string, externalLeadId: string): Promise<void> {
    await this.request(`/campaigns/${campaignId}/leads/${externalLeadId}`, "DELETE");
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

/* ─── Factory ─── */

export function getOutreachAdapter(platform: OutreachPlatform): PlatformAdapter {
  if (platform === "instantly") {
    const key = process.env.INSTANTLY_API_KEY;
    if (!key) throw new Error("INSTANTLY_API_KEY env var is not set");
    return new InstantlyAdapter(key);
  }

  if (platform === "smartlead") {
    const key = process.env.SMARTLEAD_API_KEY;
    if (!key) throw new Error("SMARTLEAD_API_KEY env var is not set");
    return new SmartleadAdapter(key);
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
      return new SmartleadAdapter("dev").parseWebhook(body);
    }
    return null;
  }
}
