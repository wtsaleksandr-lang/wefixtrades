/**
 * Multi-provider transactional email orchestrator.
 *
 * Routes outbound mail across free-tier providers (Resend, Brevo,
 * MailerLite, AWS SES) before falling back to the paid SendGrid path.
 * Goal: keep ~95% of WeFixTrades transactional + marketing volume on
 * free tiers, reserving SendGrid for warmed-domain cold outreach and
 * overflow only.
 *
 * Provider preferences by category (in order — first that has free-tier
 * budget AND a healthy circuit wins):
 *   - transactional : Resend → Brevo → AWS SES → SendGrid
 *   - marketing     : MailerLite → Brevo → SendGrid
 *   - cold_outreach : SendGrid (warmed domain only)
 *
 * Capacity tracking, circuit breakers, and deliverability scores are all
 * in-memory — per-process. That is intentional: this is a single-instance
 * Replit deploy, and the daily/monthly counters are sized generously
 * enough that even a process restart mid-day costs us at most one
 * full provider's free-tier counter.
 *
 * NO new DB migration — usage state is process-local with a midnight UTC
 * reset. Persistent counters can be added later via the existing
 * audit_log scan if needed; the audit row written on every send carries
 * `provider_id` + `category` + `response_time_ms` for that purpose.
 */

import { createLogger } from "./logger";
import { writeAudit } from "./auditLog";

const log = createLogger("EmailOrchestrator");

// ─── Public types ────────────────────────────────────────────────────────

export type ProviderId = "resend" | "brevo" | "mailerlite" | "aws_ses" | "sendgrid";

export type EmailCategory = "transactional" | "marketing" | "cold_outreach";

export interface EmailProvider {
  id: ProviderId;
  name: string;
  freeTierMonthlyLimit: number;
  freeTierDailyLimit?: number;
  costPer1000?: number;
  enabled: boolean;
  envVarRequired: string;
  supportsHtml: boolean;
  supportsAttachments: boolean;
  supportsBulk: boolean;
}

export interface SendEmailOpts {
  to: string | string[];
  from: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
  category?: EmailCategory;
  headers?: Record<string, string>;
  replyTo?: string;
}

export interface SendEmailResult {
  messageId: string;
  providerUsed: ProviderId;
  cost: number;
}

// ─── Provider registry ───────────────────────────────────────────────────

/**
 * Static provider metadata. `enabled` is derived dynamically at call time
 * from the presence of the required env var(s) — this table only
 * advertises which providers *could* be used.
 */
const PROVIDER_REGISTRY: Record<ProviderId, EmailProvider> = {
  resend: {
    id: "resend",
    name: "Resend",
    freeTierMonthlyLimit: 3_000,
    freeTierDailyLimit: 100,
    costPer1000: 0.4, // $20/mo for 50k = $0.40/1k after free tier
    enabled: true,
    envVarRequired: "RESEND_API_KEY",
    supportsHtml: true,
    supportsAttachments: true,
    supportsBulk: true,
  },
  brevo: {
    id: "brevo",
    name: "Brevo",
    freeTierMonthlyLimit: 9_000, // 300/day × 30
    freeTierDailyLimit: 300,
    costPer1000: 0.55,
    enabled: true,
    envVarRequired: "BREVO_API_KEY",
    supportsHtml: true,
    supportsAttachments: true,
    supportsBulk: true,
  },
  mailerlite: {
    id: "mailerlite",
    name: "MailerLite",
    freeTierMonthlyLimit: 12_000,
    costPer1000: 1.0,
    enabled: true,
    envVarRequired: "MAILERLITE_API_KEY",
    supportsHtml: true,
    supportsAttachments: false,
    supportsBulk: true,
  },
  aws_ses: {
    id: "aws_ses",
    name: "AWS SES",
    freeTierMonthlyLimit: 62_000, // free if sent from EC2; we pay $0.10/1k otherwise
    costPer1000: 0.1,
    enabled: true,
    envVarRequired: "AWS_ACCESS_KEY_ID",
    supportsHtml: true,
    supportsAttachments: true,
    supportsBulk: true,
  },
  sendgrid: {
    id: "sendgrid",
    name: "SendGrid",
    freeTierMonthlyLimit: 0, // paid only — we treat the legacy plan as overflow
    costPer1000: 1.5,
    enabled: true,
    envVarRequired: "SENDGRID_API_KEY",
    supportsHtml: true,
    supportsAttachments: true,
    supportsBulk: true,
  },
};

// ─── Routing preferences ─────────────────────────────────────────────────

const CATEGORY_PREFERENCES: Record<EmailCategory, ProviderId[]> = {
  transactional: ["resend", "brevo", "aws_ses", "sendgrid"],
  marketing: ["mailerlite", "brevo", "sendgrid"],
  cold_outreach: ["sendgrid"],
};

// ─── In-memory state ─────────────────────────────────────────────────────

interface ProviderState {
  sentToday: number;
  sentThisMonth: number;
  dayBucket: string; // YYYY-MM-DD UTC
  monthBucket: string; // YYYY-MM UTC
  // Circuit breaker
  circuitOpenUntil: number; // epoch ms — 0 if closed
  consecutiveFailures: number;
  // Deliverability — updated via webhook handlers
  bounces: number;
  delivered: number;
  // Round-robin pointer (per category) so we don't hit the same provider
  // every time when multiple are within capacity.
  lastUsedAt: number;
}

const state: Record<ProviderId, ProviderState> = (() => {
  const today = utcDayBucket();
  const month = utcMonthBucket();
  const init = (): ProviderState => ({
    sentToday: 0,
    sentThisMonth: 0,
    dayBucket: today,
    monthBucket: month,
    circuitOpenUntil: 0,
    consecutiveFailures: 0,
    bounces: 0,
    delivered: 0,
    lastUsedAt: 0,
  });
  return {
    resend: init(),
    brevo: init(),
    mailerlite: init(),
    aws_ses: init(),
    sendgrid: init(),
  };
})();

const CIRCUIT_COOLDOWN_MS = 15 * 60 * 1000; // 15 min
const CIRCUIT_THRESHOLD = 3; // 3 consecutive failures → open
const MIN_DELIVERABILITY_SCORE = 0.92; // 92% — below this we de-prioritise

function utcDayBucket(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function utcMonthBucket(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function rollBucketsIfNeeded(p: ProviderId) {
  const today = utcDayBucket();
  const month = utcMonthBucket();
  const s = state[p];
  if (s.dayBucket !== today) {
    s.sentToday = 0;
    s.dayBucket = today;
  }
  if (s.monthBucket !== month) {
    s.sentThisMonth = 0;
    s.monthBucket = month;
  }
}

// ─── Eligibility ─────────────────────────────────────────────────────────

function isProviderConfigured(p: ProviderId): boolean {
  const meta = PROVIDER_REGISTRY[p];
  if (!meta.enabled) return false;
  const key = process.env[meta.envVarRequired];
  if (!key) return false;
  if (p === "aws_ses" && !process.env.AWS_SECRET_ACCESS_KEY) return false;
  return true;
}

function hasFreeTierBudget(p: ProviderId): boolean {
  const meta = PROVIDER_REGISTRY[p];
  rollBucketsIfNeeded(p);
  const s = state[p];
  // SendGrid is paid — always "has budget" since it's the overflow.
  if (meta.freeTierMonthlyLimit <= 0) return true;
  if (meta.freeTierDailyLimit && s.sentToday >= meta.freeTierDailyLimit) return false;
  if (s.sentThisMonth >= meta.freeTierMonthlyLimit) return false;
  return true;
}

function isCircuitClosed(p: ProviderId): boolean {
  return state[p].circuitOpenUntil <= Date.now();
}

function deliverabilityScore(p: ProviderId): number {
  const s = state[p];
  const total = s.bounces + s.delivered;
  if (total < 50) return 1; // insufficient data — trust default
  return s.delivered / total;
}

function selectProvider(category: EmailCategory): ProviderId | null {
  const candidates = CATEGORY_PREFERENCES[category]
    .filter(isProviderConfigured)
    .filter(isCircuitClosed)
    .filter((p) => hasFreeTierBudget(p) || p === "sendgrid"); // SG always usable

  if (candidates.length === 0) return null;

  // Within preferred ordering, demote providers whose deliverability has
  // dropped below the threshold (unless they're the only option).
  const healthy = candidates.filter((p) => deliverabilityScore(p) >= MIN_DELIVERABILITY_SCORE);
  const pool = healthy.length > 0 ? healthy : candidates;

  // Round-robin within free-tier providers (skip the paid SendGrid for
  // round-robin — it's the overflow, always last). Use lastUsedAt to
  // pick the least-recently-used among the top two.
  const freeTier = pool.filter((p) => p !== "sendgrid");
  if (freeTier.length >= 2) {
    const sorted = [...freeTier].sort((a, b) => state[a].lastUsedAt - state[b].lastUsedAt);
    return sorted[0];
  }
  return pool[0];
}

// ─── Provider implementations ────────────────────────────────────────────

function toRecipients(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}

function parseAddress(s: string): { email: string; name?: string } {
  // "Name <email@x>" → split; bare email → as is
  const m = s.match(/^\s*(.+?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, ""), email: m[2] };
  return { email: s.trim() };
}

async function sendViaResend(opts: SendEmailOpts): Promise<{ messageId: string }> {
  const apiKey = process.env.RESEND_API_KEY!;
  const body: any = {
    from: opts.from,
    to: toRecipients(opts.to),
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    reply_to: opts.replyTo,
    headers: opts.headers,
  };
  if (opts.attachments?.length) {
    body.attachments = opts.attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
    }));
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return { messageId: json.id || `resend-${Date.now()}` };
}

async function sendViaBrevo(opts: SendEmailOpts): Promise<{ messageId: string }> {
  const apiKey = process.env.BREVO_API_KEY!;
  const from = parseAddress(opts.from);
  const body: any = {
    sender: { email: from.email, name: from.name },
    to: toRecipients(opts.to).map((e) => {
      const a = parseAddress(e);
      return a.name ? { email: a.email, name: a.name } : { email: a.email };
    }),
    subject: opts.subject,
    htmlContent: opts.html,
    textContent: opts.text,
    replyTo: opts.replyTo ? parseAddress(opts.replyTo) : undefined,
    headers: opts.headers,
  };
  if (opts.attachments?.length) {
    body.attachment = opts.attachments.map((a) => ({
      name: a.filename,
      content: a.content.toString("base64"),
    }));
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return { messageId: json.messageId || `brevo-${Date.now()}` };
}

async function sendViaMailerLite(opts: SendEmailOpts): Promise<{ messageId: string }> {
  const apiKey = process.env.MAILERLITE_API_KEY!;
  const from = parseAddress(opts.from);
  // MailerLite's transactional endpoint expects email subscribers to exist
  // first. For free-tier transactional we use their "emails" send API.
  const body = {
    from: { email: from.email, name: from.name || "WeFixTrades" },
    to: toRecipients(opts.to).map((e) => {
      const a = parseAddress(e);
      return { email: a.email, name: a.name };
    }),
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  };
  const res = await fetch("https://connect.mailerlite.com/api/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`MailerLite ${res.status}: ${await res.text()}`);
  const json: any = await res.json().catch(() => ({}));
  return { messageId: json.id || json.message_id || `mailerlite-${Date.now()}` };
}

async function sendViaAwsSes(opts: SendEmailOpts): Promise<{ messageId: string }> {
  // Use AWS SES v2 SendEmail via SigV4. To avoid pulling in the AWS SDK
  // (the "no npm install" constraint) we shell out to a minimal SigV4
  // signer. For now we delegate to the SES SMTP interface when available;
  // otherwise we fall through to nodemailer-via-SES. Both require the
  // env vars to be present.
  const region = process.env.AWS_REGION || "us-east-1";
  const accessKey = process.env.AWS_ACCESS_KEY_ID!;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY!;
  // Use the v2 API endpoint with SigV4. We compute the signature inline
  // (HMAC-SHA256 chain) using Node's built-in crypto — no SDK install.
  const crypto = await import("crypto");
  const host = `email.${region}.amazonaws.com`;
  const endpoint = `https://${host}/v2/email/outbound-emails`;
  const from = parseAddress(opts.from);
  const payload = {
    FromEmailAddress: from.name ? `${from.name} <${from.email}>` : from.email,
    Destination: { ToAddresses: toRecipients(opts.to) },
    ReplyToAddresses: opts.replyTo ? [opts.replyTo] : undefined,
    Content: {
      Simple: {
        Subject: { Data: opts.subject, Charset: "UTF-8" },
        Body: {
          ...(opts.html ? { Html: { Data: opts.html, Charset: "UTF-8" } } : {}),
          ...(opts.text ? { Text: { Data: opts.text, Charset: "UTF-8" } } : {}),
        },
      },
    },
  };
  const body = JSON.stringify(payload);
  // SigV4 signing
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalUri = "/v2/email/outbound-emails";
  const canonicalQuery = "";
  const payloadHash = crypto.createHash("sha256").update(body).digest("hex");
  const canonicalHeaders =
    `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-date";
  const canonicalRequest = `POST\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const algorithm = "AWS4-HMAC-SHA256";
  const credScope = `${dateStamp}/${region}/ses/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;
  const kDate = crypto.createHmac("sha256", `AWS4${secretKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
  const kService = crypto.createHmac("sha256", kRegion).update("ses").digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  const authHeader =
    `${algorithm} Credential=${accessKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: host,
      "X-Amz-Date": amzDate,
      Authorization: authHeader,
    },
    body,
  });
  if (!res.ok) throw new Error(`AWS SES ${res.status}: ${await res.text()}`);
  const json: any = await res.json().catch(() => ({}));
  return { messageId: json.MessageId || `ses-${Date.now()}` };
}

async function sendViaSendGrid(opts: SendEmailOpts): Promise<{ messageId: string }> {
  const apiKey = process.env.SENDGRID_API_KEY!;
  const from = parseAddress(opts.from);
  const body: any = {
    personalizations: [
      { to: toRecipients(opts.to).map((e) => ({ email: parseAddress(e).email })) },
    ],
    from: { email: from.email, name: from.name },
    subject: opts.subject,
    content: [
      ...(opts.text ? [{ type: "text/plain", value: opts.text }] : []),
      ...(opts.html ? [{ type: "text/html", value: opts.html }] : []),
    ],
    reply_to: opts.replyTo ? { email: parseAddress(opts.replyTo).email } : undefined,
    headers: opts.headers,
    tracking_settings: {
      click_tracking: { enable: false, enable_text: false },
      open_tracking: { enable: false },
      subscription_tracking: { enable: false },
    },
  };
  if (opts.attachments?.length) {
    body.attachments = opts.attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString("base64"),
    }));
  }
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
  // SendGrid returns the message ID via the X-Message-Id header.
  const messageId = res.headers.get("x-message-id") || `sendgrid-${Date.now()}`;
  return { messageId };
}

async function dispatchTo(
  providerId: ProviderId,
  opts: SendEmailOpts,
): Promise<{ messageId: string }> {
  switch (providerId) {
    case "resend":
      return sendViaResend(opts);
    case "brevo":
      return sendViaBrevo(opts);
    case "mailerlite":
      return sendViaMailerLite(opts);
    case "aws_ses":
      return sendViaAwsSes(opts);
    case "sendgrid":
      return sendViaSendGrid(opts);
  }
}

// ─── Public send entry point ─────────────────────────────────────────────

export async function sendEmailViaOrchestrator(opts: SendEmailOpts): Promise<SendEmailResult> {
  const category: EmailCategory = opts.category || "transactional";
  const recipientCount = toRecipients(opts.to).length;

  // Build the candidate chain with fallback. We attempt up to N providers
  // before giving up, capturing each failure for the circuit breaker.
  const attempted: ProviderId[] = [];
  let lastErr: any = null;

  // Hard ceiling: try at most every distinct provider for this category.
  const chain = CATEGORY_PREFERENCES[category];

  for (let i = 0; i < chain.length; i++) {
    const selected = selectProvider(category);
    if (!selected) break;
    if (attempted.includes(selected)) {
      // Same provider re-selected (no others healthy) — give up.
      break;
    }
    attempted.push(selected);

    const meta = PROVIDER_REGISTRY[selected];
    const startedAt = Date.now();
    try {
      const { messageId } = await dispatchTo(selected, opts);
      const responseTimeMs = Date.now() - startedAt;

      // Success: bump counters, close circuit, mark used.
      const s = state[selected];
      s.sentToday += recipientCount;
      s.sentThisMonth += recipientCount;
      s.lastUsedAt = Date.now();
      s.consecutiveFailures = 0;
      s.circuitOpenUntil = 0;

      const isFreeBudget = hasFreeTierBudget(selected) && meta.freeTierMonthlyLimit > 0;
      const cost = isFreeBudget ? 0 : ((meta.costPer1000 || 0) * recipientCount) / 1000;

      writeAudit({
        actorType: "system",
        action: "email.provider_call",
        entityType: "email",
        entityId: messageId,
        metadata: {
          provider_id: selected,
          category,
          recipient_count: recipientCount,
          response_time_ms: responseTimeMs,
          attempted,
          cost,
        },
      });

      log.info(
        `[orchestrator] sent via ${selected} category=${category} recipients=${recipientCount} ` +
          `latency=${responseTimeMs}ms cost=$${cost.toFixed(4)}`,
      );

      return { messageId, providerUsed: selected, cost };
    } catch (err: any) {
      lastErr = err;
      const responseTimeMs = Date.now() - startedAt;
      const s = state[selected];
      s.consecutiveFailures += 1;
      if (s.consecutiveFailures >= CIRCUIT_THRESHOLD) {
        s.circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
        log.warn(
          `[orchestrator] circuit OPEN for ${selected} after ${s.consecutiveFailures} failures — cooldown ${CIRCUIT_COOLDOWN_MS / 60000}min`,
        );
      }
      writeAudit({
        actorType: "system",
        action: "email.provider_call",
        entityType: "email",
        entityId: `failed-${selected}-${Date.now()}`,
        metadata: {
          provider_id: selected,
          category,
          recipient_count: recipientCount,
          response_time_ms: responseTimeMs,
          error: String(err?.message || err).slice(0, 500),
          status: "failed",
        },
      });
      log.warn(`[orchestrator] ${selected} failed: ${err?.message || err} — trying next`);
      // Loop continues; selectProvider() will now skip the open-circuit provider.
    }
  }

  // All providers exhausted.
  throw new Error(
    `All providers failed for category=${category} (attempted=${attempted.join(",") || "none"}). Last error: ${lastErr?.message || lastErr || "no providers configured"}`,
  );
}

// ─── Webhook integration — update deliverability scores ──────────────────

/**
 * Called from provider-specific webhook handlers when a message is
 * confirmed delivered. Boosts the provider's deliverability score.
 */
export function recordDelivery(providerId: ProviderId): void {
  if (!PROVIDER_REGISTRY[providerId]) return;
  state[providerId].delivered += 1;
}

/**
 * Called from provider-specific webhook handlers when a message bounces
 * (hard or soft) or is marked as spam. Drops the provider's deliverability
 * score, which feeds into future routing decisions.
 */
export function recordBounce(providerId: ProviderId): void {
  if (!PROVIDER_REGISTRY[providerId]) return;
  state[providerId].bounces += 1;
}

// ─── Inspection helpers (for ops dashboards / debug routes) ──────────────

export function getProviderSnapshot(): Array<EmailProvider & {
  configured: boolean;
  circuitOpen: boolean;
  sentToday: number;
  sentThisMonth: number;
  deliverabilityScore: number;
}> {
  return (Object.keys(PROVIDER_REGISTRY) as ProviderId[]).map((p) => {
    rollBucketsIfNeeded(p);
    const meta = PROVIDER_REGISTRY[p];
    const s = state[p];
    return {
      ...meta,
      configured: isProviderConfigured(p),
      circuitOpen: !isCircuitClosed(p),
      sentToday: s.sentToday,
      sentThisMonth: s.sentThisMonth,
      deliverabilityScore: deliverabilityScore(p),
    };
  });
}

export function getCategoryChain(category: EmailCategory): ProviderId[] {
  return [...CATEGORY_PREFERENCES[category]];
}

// Export the registry read-only so callers can introspect without
// mutating the source of truth.
export function getProviderRegistry(): Readonly<Record<ProviderId, EmailProvider>> {
  return PROVIDER_REGISTRY;
}
