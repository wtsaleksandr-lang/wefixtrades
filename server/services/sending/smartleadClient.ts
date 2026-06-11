/**
 * Smartlead API client — Lane OA (cold-outreach rail).
 *
 * Verified against the live docs on 2026-06-10:
 *   https://helpcenter.smartlead.ai/en/articles/125-full-api-documentation
 *   https://api.smartlead.ai/introduction (+ /llms.txt index)
 *
 * Facts confirmed from those docs:
 *   - Base URL:  https://server.smartlead.ai/api/v1
 *   - Auth:      `?api_key=` QUERY PARAMETER on every request.
 *   - Add leads: POST /campaigns/{id}/leads with `{ lead_list: [...] }`,
 *                max 400 leads per request (client batches automatically).
 *   - Global unsubscribe: POST /leads/{lead_id}/unsubscribe.
 *   - Sequences: POST /campaigns/{id}/sequences with `{ sequences: [...] }`
 *                (wrapped in a "sequences" key — verified verbatim).
 *   - Analytics: GET /campaigns/{id}/analytics and /analytics-by-date
 *                (max 30-day span). Count fields may come back as strings.
 *   - Email accounts: GET /campaigns/{id}/email-accounts.
 *   - Rate limit: 10 requests / 2 seconds → client-side sliding-window
 *                 throttle below; 429 → exponential backoff with jitter.
 *
 * SECURITY — the api_key rides the query string. NO full URL may ever
 * appear in a log line or a thrown error. Every error path goes through
 * redactSecrets(); SmartleadApiError carries only the path WITHOUT query.
 */

import { setTimeout as nodeSleep } from "node:timers/promises";
// Value import of the mock is safe: mockSmartlead.ts only imports TYPES from
// this file (erased at runtime), so there is no runtime import cycle.
import { MockSmartleadClient } from "./mockSmartlead";

/* ─── Redaction ─── */

/**
 * Strip anything that could leak the API key from a string destined for a
 * log or an Error message: the api_key query param (any casing) and the
 * raw key value itself if known.
 */
export function redactSecrets(text: string, apiKey?: string): string {
  let out = text.replace(/([?&]api_key=)[^&\s"']*/gi, "$1REDACTED");
  if (apiKey && apiKey.length > 0) {
    out = out.split(apiKey).join("REDACTED");
  }
  return out;
}

/** Error thrown for non-2xx Smartlead responses. NEVER contains the key. */
export class SmartleadApiError extends Error {
  readonly status: number;
  /** Path only — query string (and thus api_key) is never included. */
  readonly path: string;

  constructor(status: number, method: string, path: string, bodySnippet: string, apiKey?: string) {
    const cleanPath = path.split("?")[0];
    super(
      redactSecrets(
        `Smartlead API ${method} ${cleanPath} → ${status}: ${bodySnippet.slice(0, 300)}`,
        apiKey,
      ),
    );
    this.name = "SmartleadApiError";
    this.status = status;
    this.path = cleanPath;
  }
}

/* ─── Response types (fields verified against live docs; counts parsed
       defensively because Smartlead returns some numerics as strings) ─── */

export interface SmartleadCampaign {
  id: number;
  name: string;
  status: string; // DRAFTED | ACTIVE | COMPLETED | STOPPED | PAUSED
  created_at?: string;
  updated_at?: string;
  max_leads_per_day?: number;
  client_id?: number | null;
  [key: string]: unknown;
}

export interface SmartleadEmailAccount {
  id: number;
  from_name?: string;
  from_email?: string;
  // Some payload variants use `email` / `username`; read defensively.
  email?: string;
  username?: string;
  [key: string]: unknown;
}

export interface SmartleadAddLeadsResult {
  ok: boolean;
  upload_count: number;
  total_leads: number;
  already_added_to_campaign: number;
  duplicate_count: number;
  invalid_email_count: number;
  unsubscribed_leads: number;
  [key: string]: unknown;
}

export interface SmartleadCampaignAnalytics {
  sent_count: number;
  open_count: number;
  click_count: number;
  reply_count: number;
  bounce_count: number;
  unsubscribed_count: number;
  total_count: number;
  /** Spam/complaint count if the plan exposes it; 0 when absent. */
  complaint_count: number;
  raw: Record<string, unknown>;
}

export interface SmartleadLeadInput {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  phone_number?: string;
  website?: string;
  location?: string;
  custom_fields?: Record<string, string>;
}

export interface SmartleadLeadSettings {
  ignore_global_block_list?: boolean;
  ignore_unsubscribe_list?: boolean;
  ignore_community_bounce_list?: boolean;
  ignore_duplicate_leads_in_other_campaign?: boolean;
}

export interface SmartleadSequenceVariant {
  subject: string;
  email_body: string;
  variant_label?: string;
}

export interface SmartleadSequenceStep {
  id?: number | null;
  seq_number: number;
  seq_delay_details: { delay_in_days: number };
  /** Single-variant form (subject/email_body inline) — verified shape. */
  subject?: string;
  email_body?: string;
  /** Multi-variant form. */
  variant_distribution_type?: "MANUALLY_EQUAL" | "AI_EQUAL";
  variants?: SmartleadSequenceVariant[];
}

/** Statistics row from GET /campaigns/{id}/statistics (per sent email). */
export interface SmartleadStatisticsRow {
  lead_email?: string;
  email_status?: string;
  sent_time?: string;
  [key: string]: unknown;
}

/* ─── Client interface (mockSmartlead implements the same surface) ─── */

export interface SmartleadClientLike {
  readonly isMock: boolean;
  createCampaign(name: string, clientId?: number | null): Promise<SmartleadCampaign>;
  getCampaign(campaignId: string | number): Promise<SmartleadCampaign | null>;
  addLeads(
    campaignId: string | number,
    leads: SmartleadLeadInput[],
    settings?: SmartleadLeadSettings,
  ): Promise<SmartleadAddLeadsResult>;
  getLeadByEmail(email: string): Promise<{ id: number } | null>;
  unsubscribeLeadGlobal(leadId: string | number): Promise<void>;
  getCampaignAnalytics(campaignId: string | number): Promise<SmartleadCampaignAnalytics>;
  getCampaignAnalyticsByDate(
    campaignId: string | number,
    startDate: string,
    endDate: string,
  ): Promise<SmartleadCampaignAnalytics>;
  getCampaignStatistics(
    campaignId: string | number,
    opts?: { offset?: number; limit?: number; email_status?: string },
  ): Promise<{ data: SmartleadStatisticsRow[]; total_stats?: number }>;
  listCampaignEmailAccounts(campaignId: string | number): Promise<SmartleadEmailAccount[]>;
  saveSequences(campaignId: string | number, sequences: SmartleadSequenceStep[]): Promise<void>;
  pauseLeadInCampaign(campaignId: string | number, leadId: string | number): Promise<void>;
  deleteLeadFromCampaign(campaignId: string | number, leadId: string | number): Promise<void>;
}

/* ─── Injectables (tests swap these; production uses the defaults) ─── */

export interface SmartleadClientOptions {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
  /** Max retries for 429 responses (default 4). */
  maxRetries?: number;
  /** Base backoff ms for the first 429 retry (default 1000). */
  backoffBaseMs?: number;
  /** Disable jitter for deterministic tests. */
  jitter?: boolean;
}

const RATE_LIMIT_MAX = 10; // requests
const RATE_LIMIT_WINDOW_MS = 2_000; // per 2 seconds (documented Smartlead limit)
const MAX_LEADS_PER_REQUEST = 400; // documented hard cap on POST .../leads

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function parseAnalytics(raw: Record<string, unknown>): SmartleadCampaignAnalytics {
  return {
    sent_count: toNum(raw.sent_count),
    open_count: toNum(raw.open_count ?? raw.unique_open_count),
    click_count: toNum(raw.click_count ?? raw.unique_click_count),
    reply_count: toNum(raw.reply_count),
    bounce_count: toNum(raw.bounce_count),
    unsubscribed_count: toNum(raw.unsubscribed_count),
    total_count: toNum(raw.total_count ?? raw.campaign_lead_count),
    complaint_count: toNum(raw.complaint_count ?? raw.spam_count ?? raw.spam_complaint_count),
    raw,
  };
}

/* ─── Real client ─── */

export class SmartleadClient implements SmartleadClientLike {
  readonly isMock = false;

  private readonly apiKey: string;
  private readonly baseUrl = "https://server.smartlead.ai/api/v1";
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly nowFn: () => number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly jitter: boolean;

  /** Sliding-window timestamps of recent request starts (rate limiter). */
  private recentRequests: number[] = [];
  /** Serializes throttle decisions so parallel callers can't stampede. */
  private throttleChain: Promise<unknown> = Promise.resolve();

  constructor(apiKey: string, opts: SmartleadClientOptions = {}) {
    if (!apiKey) throw new Error("SmartleadClient requires an API key");
    this.apiKey = apiKey;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleepFn = opts.sleepFn ?? ((ms) => nodeSleep(ms));
    this.nowFn = opts.nowFn ?? Date.now;
    this.maxRetries = opts.maxRetries ?? 4;
    this.backoffBaseMs = opts.backoffBaseMs ?? 1_000;
    this.jitter = opts.jitter ?? true;
  }

  /** Wait (if needed) so we never exceed 10 requests per rolling 2s. */
  private acquireSlot(): Promise<void> {
    const next = this.throttleChain.then(async () => {
      // Loop because a long sleep can still land inside a full window.
      for (;;) {
        const now = this.nowFn();
        this.recentRequests = this.recentRequests.filter(
          (t) => now - t < RATE_LIMIT_WINDOW_MS,
        );
        if (this.recentRequests.length < RATE_LIMIT_MAX) {
          this.recentRequests.push(now);
          return;
        }
        const oldest = this.recentRequests[0];
        const waitMs = Math.max(1, oldest + RATE_LIMIT_WINDOW_MS - now);
        await this.sleepFn(waitMs);
      }
    });
    // Keep the chain alive even if this caller's slot acquisition fails
    // (the rejection still surfaces to the caller via `next`).
    this.throttleChain = next.catch(() => false);
    return next;
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "DELETE" | "PATCH",
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const params = new URLSearchParams({ api_key: this.apiKey });
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined) params.set(k, String(v));
    }
    const url = `${this.baseUrl}${path}?${params.toString()}`;

    let attempt = 0;
    for (;;) {
      await this.acquireSlot();

      let res: Response;
      try {
        res = await this.fetchFn(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        // Network-level failure: fetch errors can embed the full URL —
        // rethrow with the query string scrubbed.
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          redactSecrets(`Smartlead network error ${method} ${path}: ${msg}`, this.apiKey),
        );
      }

      if (res.status === 429 && attempt < this.maxRetries) {
        attempt += 1;
        const retryAfterHeader = res.headers?.get?.("retry-after");
        const retryAfterMs = retryAfterHeader ? toNum(retryAfterHeader) * 1_000 : 0;
        const expo = this.backoffBaseMs * 2 ** (attempt - 1);
        const jitterMs = this.jitter ? Math.floor(Math.random() * 250) : 0;
        await this.sleepFn(Math.max(retryAfterMs, expo) + jitterMs);
        continue;
      }

      if (!res.ok) {
        let text = "";
        try {
          text = await res.text();
        } catch {
          text = "<unreadable body>";
        }
        throw new SmartleadApiError(res.status, method, path, text, this.apiKey);
      }

      if (res.status === 204) return undefined as T;
      const text = await res.text();
      if (!text) return undefined as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new SmartleadApiError(res.status, method, path, "non-JSON response body", this.apiKey);
      }
    }
  }

  /* ── Campaigns ── */

  async createCampaign(name: string, clientId: number | null = null): Promise<SmartleadCampaign> {
    return this.request<SmartleadCampaign>("/campaigns/create", "POST", {
      name,
      client_id: clientId,
    });
  }

  async getCampaign(campaignId: string | number): Promise<SmartleadCampaign | null> {
    try {
      const data = await this.request<SmartleadCampaign>(`/campaigns/${campaignId}`, "GET");
      return data && data.id !== undefined && data.id !== null ? data : null;
    } catch (err) {
      if (err instanceof SmartleadApiError && err.status === 404) return null;
      throw err;
    }
  }

  /* ── Leads ── */

  /**
   * Adds leads in batches of 400 (the documented per-request cap) and
   * aggregates the per-batch results.
   */
  async addLeads(
    campaignId: string | number,
    leads: SmartleadLeadInput[],
    settings?: SmartleadLeadSettings,
  ): Promise<SmartleadAddLeadsResult> {
    const totals: SmartleadAddLeadsResult = {
      ok: true,
      upload_count: 0,
      total_leads: leads.length,
      already_added_to_campaign: 0,
      duplicate_count: 0,
      invalid_email_count: 0,
      unsubscribed_leads: 0,
    };

    for (let i = 0; i < leads.length; i += MAX_LEADS_PER_REQUEST) {
      const batch = leads.slice(i, i + MAX_LEADS_PER_REQUEST);
      const raw = await this.request<Record<string, unknown>>(
        `/campaigns/${campaignId}/leads`,
        "POST",
        { lead_list: batch, ...(settings ? { settings } : {}) },
      );
      totals.ok = totals.ok && raw?.ok !== false;
      totals.upload_count += toNum(raw?.upload_count);
      totals.already_added_to_campaign += toNum(raw?.already_added_to_campaign);
      totals.duplicate_count += toNum(raw?.duplicate_count);
      totals.invalid_email_count += toNum(raw?.invalid_email_count);
      totals.unsubscribed_leads += toNum(raw?.unsubscribed_leads);
    }
    return totals;
  }

  async getLeadByEmail(email: string): Promise<{ id: number } | null> {
    // Documented: GET /leads?email=<address> → lead object (or empty).
    const data = await this.request<{ id?: number | string } | null>("/leads", "GET", undefined, {
      email,
    });
    const id = data ? toNum(data.id) : 0;
    return id > 0 ? { id } : null;
  }

  async unsubscribeLeadGlobal(leadId: string | number): Promise<void> {
    // Documented: globally unsubscribes the lead from ALL campaigns and
    // blocks re-adding in future campaigns.
    await this.request(`/leads/${leadId}/unsubscribe`, "POST");
  }

  async pauseLeadInCampaign(campaignId: string | number, leadId: string | number): Promise<void> {
    await this.request(`/campaigns/${campaignId}/leads/${leadId}/pause`, "POST");
  }

  async deleteLeadFromCampaign(campaignId: string | number, leadId: string | number): Promise<void> {
    await this.request(`/campaigns/${campaignId}/leads/${leadId}`, "DELETE");
  }

  /* ── Analytics / statistics ── */

  async getCampaignAnalytics(campaignId: string | number): Promise<SmartleadCampaignAnalytics> {
    const raw = await this.request<Record<string, unknown>>(
      `/campaigns/${campaignId}/analytics`,
      "GET",
    );
    return parseAnalytics(raw ?? {});
  }

  async getCampaignAnalyticsByDate(
    campaignId: string | number,
    startDate: string,
    endDate: string,
  ): Promise<SmartleadCampaignAnalytics> {
    // Documented max span: 30 days. Dates: YYYY-MM-DD.
    const raw = await this.request<Record<string, unknown>>(
      `/campaigns/${campaignId}/analytics-by-date`,
      "GET",
      undefined,
      { start_date: startDate, end_date: endDate },
    );
    return parseAnalytics(raw ?? {});
  }

  async getCampaignStatistics(
    campaignId: string | number,
    opts: { offset?: number; limit?: number; email_status?: string } = {},
  ): Promise<{ data: SmartleadStatisticsRow[]; total_stats?: number }> {
    const raw = await this.request<{
      data?: SmartleadStatisticsRow[];
      total_stats?: number | string;
    }>(`/campaigns/${campaignId}/statistics`, "GET", undefined, {
      offset: opts.offset ?? 0,
      limit: opts.limit ?? 100,
      email_status: opts.email_status,
    });
    return { data: raw?.data ?? [], total_stats: toNum(raw?.total_stats) };
  }

  /* ── Email accounts / sequences ── */

  async listCampaignEmailAccounts(campaignId: string | number): Promise<SmartleadEmailAccount[]> {
    const raw = await this.request<SmartleadEmailAccount[] | { email_accounts?: SmartleadEmailAccount[] }>(
      `/campaigns/${campaignId}/email-accounts`,
      "GET",
    );
    if (Array.isArray(raw)) return raw;
    return raw?.email_accounts ?? [];
  }

  async saveSequences(
    campaignId: string | number,
    sequences: SmartleadSequenceStep[],
  ): Promise<void> {
    // Verified verbatim: body is `{ "sequences": [...] }` (wrapped, not bare).
    await this.request(`/campaigns/${campaignId}/sequences`, "POST", { sequences });
  }
}

/* ─── Factory + configured check ─── */

export function isSmartleadConfigured(): boolean {
  return Boolean(process.env.SMARTLEAD_API_KEY);
}

let cachedClient: SmartleadClientLike | null = null;
let cachedKeyPresent: boolean | null = null;

/**
 * Returns the real client when SMARTLEAD_API_KEY is present, otherwise the
 * in-memory mock (server/services/sending/mockSmartlead.ts). Routes MUST
 * additionally gate on isSmartleadConfigured() and answer
 * `{ error: "not_configured" }` rather than serving mock data as real.
 */
export function getSmartleadClient(): SmartleadClientLike {
  const keyPresent = isSmartleadConfigured();
  if (cachedClient && cachedKeyPresent === keyPresent) return cachedClient;
  if (keyPresent) {
    cachedClient = new SmartleadClient(process.env.SMARTLEAD_API_KEY as string);
  } else {
    cachedClient = new MockSmartleadClient();
  }
  cachedKeyPresent = keyPresent;
  return cachedClient;
}

/** Test hook: clear the cached singleton (e.g. after env changes). */
export function resetSmartleadClientCache(): void {
  cachedClient = null;
  cachedKeyPresent = null;
}
