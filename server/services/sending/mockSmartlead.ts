/**
 * Mock Smartlead client — Lane OA.
 *
 * Selected by getSmartleadClient() whenever SMARTLEAD_API_KEY is absent,
 * and used by every Smartlead unit test. Makes ZERO network calls.
 *
 * HONESTY GUARANTEE: nothing returned by this mock can be mistaken for a
 * real platform result — campaign ids are negative, lead results carry
 * `status: "dry_run"`, and `isMock === true` so routes can answer
 * `{ error: "not_configured" }` instead of serving mock data as real.
 *
 * Tests configure fixtures via the `seed*` helpers and assert behaviour
 * via the recorded `calls` array.
 */

import type {
  SmartleadAddLeadsResult,
  SmartleadCampaign,
  SmartleadCampaignAnalytics,
  SmartleadClientLike,
  SmartleadEmailAccount,
  SmartleadLeadInput,
  SmartleadLeadSettings,
  SmartleadSequenceStep,
  SmartleadStatisticsRow,
} from "./smartleadClient";

export interface MockCall {
  method: string;
  args: unknown[];
}

let nextMockCampaignId = -1;
let nextMockLeadId = -1;

export class MockSmartleadClient implements SmartleadClientLike {
  readonly isMock = true;

  /** Every method invocation, in order — assert against this in tests. */
  readonly calls: MockCall[] = [];

  private campaigns = new Map<string, SmartleadCampaign>();
  private emailAccounts = new Map<string, SmartleadEmailAccount[]>();
  private analytics = new Map<string, SmartleadCampaignAnalytics>();
  private leadsByEmail = new Map<string, { id: number }>();
  private unsubscribedLeadIds = new Set<number>();
  private sequences = new Map<string, SmartleadSequenceStep[]>();

  private record(method: string, ...args: unknown[]): void {
    this.calls.push({ method, args });
  }

  /* ── Test fixture seeding ── */

  seedCampaign(campaign: Partial<SmartleadCampaign> & { id: number }): void {
    this.campaigns.set(String(campaign.id), {
      name: `mock-campaign-${campaign.id}`,
      status: "ACTIVE",
      ...campaign,
    } as SmartleadCampaign);
  }

  seedEmailAccounts(campaignId: string | number, accounts: SmartleadEmailAccount[]): void {
    this.emailAccounts.set(String(campaignId), accounts);
  }

  seedAnalytics(campaignId: string | number, analytics: Partial<SmartleadCampaignAnalytics>): void {
    this.analytics.set(String(campaignId), {
      sent_count: 0,
      open_count: 0,
      click_count: 0,
      reply_count: 0,
      bounce_count: 0,
      unsubscribed_count: 0,
      total_count: 0,
      complaint_count: 0,
      raw: {},
      ...analytics,
    });
  }

  seedLead(email: string, id?: number): number {
    const leadId = id ?? nextMockLeadId--;
    this.leadsByEmail.set(email.toLowerCase(), { id: leadId });
    return leadId;
  }

  getUnsubscribedLeadIds(): number[] {
    return [...this.unsubscribedLeadIds];
  }

  /* ── SmartleadClientLike ── */

  async createCampaign(name: string, clientId: number | null = null): Promise<SmartleadCampaign> {
    this.record("createCampaign", name, clientId);
    const campaign: SmartleadCampaign = {
      id: nextMockCampaignId--,
      name,
      status: "DRAFTED",
      client_id: clientId,
    };
    this.campaigns.set(String(campaign.id), campaign);
    return campaign;
  }

  async getCampaign(campaignId: string | number): Promise<SmartleadCampaign | null> {
    this.record("getCampaign", campaignId);
    return this.campaigns.get(String(campaignId)) ?? null;
  }

  async addLeads(
    campaignId: string | number,
    leads: SmartleadLeadInput[],
    settings?: SmartleadLeadSettings,
  ): Promise<SmartleadAddLeadsResult> {
    this.record("addLeads", campaignId, leads, settings);
    for (const lead of leads) {
      if (!this.leadsByEmail.has(lead.email.toLowerCase())) this.seedLead(lead.email);
    }
    return {
      ok: true,
      upload_count: leads.length,
      total_leads: leads.length,
      already_added_to_campaign: 0,
      duplicate_count: 0,
      invalid_email_count: 0,
      unsubscribed_leads: 0,
    };
  }

  async getLeadByEmail(email: string): Promise<{ id: number } | null> {
    this.record("getLeadByEmail", email);
    return this.leadsByEmail.get(email.toLowerCase()) ?? null;
  }

  async unsubscribeLeadGlobal(leadId: string | number): Promise<void> {
    this.record("unsubscribeLeadGlobal", leadId);
    this.unsubscribedLeadIds.add(Number(leadId));
  }

  async pauseLeadInCampaign(campaignId: string | number, leadId: string | number): Promise<void> {
    this.record("pauseLeadInCampaign", campaignId, leadId);
  }

  async deleteLeadFromCampaign(campaignId: string | number, leadId: string | number): Promise<void> {
    this.record("deleteLeadFromCampaign", campaignId, leadId);
  }

  async getCampaignAnalytics(campaignId: string | number): Promise<SmartleadCampaignAnalytics> {
    this.record("getCampaignAnalytics", campaignId);
    return (
      this.analytics.get(String(campaignId)) ?? {
        sent_count: 0,
        open_count: 0,
        click_count: 0,
        reply_count: 0,
        bounce_count: 0,
        unsubscribed_count: 0,
        total_count: 0,
        complaint_count: 0,
        raw: {},
      }
    );
  }

  async getCampaignAnalyticsByDate(
    campaignId: string | number,
    startDate: string,
    endDate: string,
  ): Promise<SmartleadCampaignAnalytics> {
    this.record("getCampaignAnalyticsByDate", campaignId, startDate, endDate);
    return this.getCampaignAnalytics(campaignId);
  }

  async getCampaignStatistics(
    campaignId: string | number,
    opts: { offset?: number; limit?: number; email_status?: string } = {},
  ): Promise<{ data: SmartleadStatisticsRow[]; total_stats?: number }> {
    this.record("getCampaignStatistics", campaignId, opts);
    return { data: [], total_stats: 0 };
  }

  async listCampaignEmailAccounts(campaignId: string | number): Promise<SmartleadEmailAccount[]> {
    this.record("listCampaignEmailAccounts", campaignId);
    return this.emailAccounts.get(String(campaignId)) ?? [];
  }

  async saveSequences(
    campaignId: string | number,
    sequences: SmartleadSequenceStep[],
  ): Promise<void> {
    this.record("saveSequences", campaignId, sequences);
    this.sequences.set(String(campaignId), sequences);
  }
}
