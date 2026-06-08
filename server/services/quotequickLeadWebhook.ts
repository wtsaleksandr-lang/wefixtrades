/**
 * QuoteQuick outbound LEAD webhook — best-effort, signed, SSRF-guarded.
 *
 * Fired from server/routes/leadRoutes.ts AFTER a lead is persisted and the
 * normal notifications are enqueued. The owner configures a single webhook
 * URL per calculator via the wizard (calculator_settings.integrations.webhook).
 * Any inbound-webhook consumer works: Zapier, Make, n8n, HubSpot,
 * GoHighLevel, Google Sheets (via Zapier/Make), Slack, or a custom backend.
 *
 * Design notes:
 *  - DIRECT best-effort POST (not the api_webhook_deliveries worker). The
 *    delivery worker is keyed to API-platform `apiWebhooks` SUBSCRIPTIONS
 *    owned by a logged-in API user; a calculator's owner-configured lead
 *    hook is a different, simpler source (no subscription row, anonymous
 *    portal calcs included). A direct POST with a tiny retry is the
 *    lower-risk path and keeps lead capture decoupled from that table.
 *  - NON-BLOCKING: the caller fire-and-forgets this; it never throws. Lead
 *    capture succeeds even if delivery fails. All failures are LOGGED loudly
 *    (no silent catch).
 *  - SIGNED with the SAME signer the API webhooks use (signWebhookPayload),
 *    sent as `X-WFT-Signature: t=<unix>,v1=<hex>` so the published verify
 *    snippet works identically for both event sources.
 *  - SSRF-guarded via the shared assertPublicHttpsUrl helper.
 */

import crypto from "crypto";
import type { Calculator, Lead } from "@shared/schema";
import { createLogger } from "../lib/logger";
import { assertPublicHttpsUrl } from "../lib/webhookSsrfGuard";
import { signWebhookPayload } from "./apiWebhookDispatcher";

const log = createLogger("QuoteQuickLeadWebhook");

const DELIVERY_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3; // 1 initial + 2 retries on network failure

export interface LeadWebhookConfig {
  url: string;
  enabled: boolean;
  secret: string;
}

/** Generate a per-calculator signing secret. Matches the apiV1 webhooks format. */
export function generateLeadWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64url").replace(/[-_]/g, "")}`;
}

/**
 * Read + validate the integrations webhook config off a calculator's
 * calculator_settings JSONB. Returns null when absent or malformed.
 */
export function readWebhookConfig(calc: Pick<Calculator, "calculator_settings">): LeadWebhookConfig | null {
  const settings = (calc.calculator_settings as any) || {};
  const wh = settings?.integrations?.webhook;
  if (!wh || typeof wh !== "object") return null;
  const url = typeof wh.url === "string" ? wh.url.trim() : "";
  const secret = typeof wh.secret === "string" ? wh.secret : "";
  const enabled = wh.enabled === true;
  if (!url || !secret) return null;
  return { url, enabled, secret };
}

/** Resolve the calculator's display currency from its advanced number-format. */
function resolveCurrency(calc: Pick<Calculator, "calculator_settings">): string {
  const settings = (calc.calculator_settings as any) || {};
  const code =
    settings?.advanced?.numberFormat?.currency ||
    settings?.numberFormat?.currency;
  return typeof code === "string" && code.trim() ? code.trim().toUpperCase() : "USD";
}

/** Resolve the configured deposit (whole currency units) if deposit is enabled. */
function resolveDeposit(calc: Pick<Calculator, "calculator_settings">): number | null {
  const settings = (calc.calculator_settings as any) || {};
  const dep = settings?.appearance?.deposit ?? settings?.advanced?.style?.deposit;
  if (dep && dep.enabled === true && typeof dep.amount === "number" && Number.isFinite(dep.amount)) {
    return dep.amount;
  }
  return null;
}

export interface BuildPayloadOpts {
  /** When true, marks the payload as a test ping (from the "Send test" UI). */
  test?: boolean;
}

/**
 * Build the stable `lead.created` payload. Field names are clean + documented
 * (kept in sync with client/src/pages/marketing/docs/webhooks.tsx).
 */
export function buildLeadWebhookPayload(
  calc: Pick<Calculator, "id" | "business_name" | "calculator_settings">,
  lead: Lead,
  opts: BuildPayloadOpts = {},
): Record<string, any> {
  return {
    event: "lead.created",
    ...(opts.test ? { test: true } : {}),
    calculator_id: calc.id,
    business_name: calc.business_name,
    lead_id: lead.id,
    contact: {
      name: lead.name ?? null,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      company: lead.company ?? null,
    },
    answers: (lead.answers as Record<string, any> | null) ?? null,
    total: lead.quote_amount ?? null,
    deposit: resolveDeposit(calc),
    currency: resolveCurrency(calc),
    created_at: (lead.created_date instanceof Date
      ? lead.created_date
      : lead.created_date
        ? new Date(lead.created_date as any)
        : new Date()
    ).toISOString(),
  };
}

export interface DeliveryResult {
  ok: boolean;
  status?: number;
  error?: string;
  attempts: number;
}

/**
 * POST a signed JSON body to `url` with SSRF guard, a 5s timeout, and up to
 * MAX_ATTEMPTS attempts on NETWORK failure (a non-2xx is treated as a final,
 * non-retryable result — the consumer answered, just unhappily). Never throws.
 */
export async function deliverSignedWebhook(
  url: string,
  secret: string,
  payload: Record<string, any>,
): Promise<DeliveryResult> {
  const body = JSON.stringify(payload);
  const { header } = signWebhookPayload(secret, body);

  // SSRF guard up front — a private/loopback/non-https URL is a hard reject,
  // not a retryable error.
  try {
    await assertPublicHttpsUrl(url);
  } catch (err: any) {
    log.warn("[lead-webhook] SSRF guard rejected destination", {
      error: err?.message,
      // host only, never the secret
      host: safeHost(url),
    });
    return { ok: false, error: err?.message ?? "blocked by SSRF guard", attempts: 0 };
  }

  let attempt = 0;
  let lastError = "";
  while (attempt < MAX_ATTEMPTS) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WFT-Signature": header,
          "User-Agent": "QuoteQuick-Webhook/1.0",
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        return { ok: true, status: resp.status, attempts: attempt };
      }
      // Endpoint responded but rejected — final, don't retry.
      log.warn("[lead-webhook] endpoint returned non-2xx", {
        status: resp.status,
        host: safeHost(url),
        attempts: attempt,
      });
      return { ok: false, status: resp.status, error: `HTTP ${resp.status}`, attempts: attempt };
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err?.name === "AbortError" ? "timeout" : (err?.message ?? "network error");
      log.warn("[lead-webhook] delivery attempt failed", {
        error: lastError,
        host: safeHost(url),
        attempt,
        maxAttempts: MAX_ATTEMPTS,
      });
      // fall through to retry on network/timeout
    }
  }
  return { ok: false, error: lastError || "delivery failed", attempts: attempt };
}

/** Host-only for logging — never logs the full URL (it may carry a token). */
function safeHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return "invalid-url";
  }
}

/**
 * Fire-and-forget entry point used by leadRoutes. Builds the payload, delivers
 * it best-effort, and LOGS the outcome. Never throws — lead capture is never
 * blocked by webhook delivery.
 */
export async function fireLeadWebhook(
  calc: Pick<Calculator, "id" | "business_name" | "calculator_settings">,
  lead: Lead,
): Promise<void> {
  const config = readWebhookConfig(calc);
  if (!config || !config.enabled) return;

  try {
    const payload = buildLeadWebhookPayload(calc, lead);
    const result = await deliverSignedWebhook(config.url, config.secret, payload);
    if (result.ok) {
      log.info("[lead-webhook] delivered", {
        calculatorId: calc.id,
        leadId: lead.id,
        status: result.status,
        attempts: result.attempts,
      });
    } else {
      log.error("[lead-webhook] delivery failed after retries", {
        calculatorId: calc.id,
        leadId: lead.id,
        status: result.status,
        error: result.error,
        attempts: result.attempts,
      });
    }
  } catch (err: any) {
    // Defensive: deliverSignedWebhook never throws, but if payload building
    // ever does, we log loudly and swallow so capture is unaffected.
    log.error("[lead-webhook] unexpected error firing webhook", {
      calculatorId: calc.id,
      leadId: lead.id,
      error: err?.message,
    });
  }
}
