/**
 * Per-product / per-tool health-signal registry — Wave 140.
 *
 * Produces health SIGNALS only. No UI, no auto-resolution, no SMS/WhatsApp,
 * no systemAlerts writes, no cron — those land in later waves (141–144).
 *
 * Mirrors the probe pattern in `server/routes/healthz.ts`:
 *   - each probe returns a small structured outcome (no secret VALUES),
 *   - probes only check key PRESENCE / cheap reachability (never burn quota
 *     or money to confirm liveness — see healthz google_maps / stripe probes),
 *   - the aggregator (adminHealthRoutes) wraps every probe so one failure
 *     can't crash the aggregate.
 *
 * Status reduction (per product):
 *   - any check `ok:false` flagged `critical`  → "down"
 *   - any check `ok:false` non-critical        → "degraded"
 *   - otherwise                                → "ok"
 *
 * EXEMPLAR probes (done properly): mapguard, tradeline, quotequick.
 * Every other product gets a clearly-marked TODO stub that returns "ok" with
 * a single "no probe yet" check, so the aggregator returns all 13 products
 * without faking health.
 */

import Stripe from "stripe";
import { ALL_PRODUCTS } from "@shared/pricing";
import { isTwilioConfigured, getTwilioClient } from "../../twilioClient";
import { readyFallbackProviders } from "../llmFallbackChain";
import { getPrimaryCircuitState } from "../aiService";

/* ─── Types ─── */

export interface ProductCheck {
  name: string;
  ok: boolean;
  detail: string;
  latencyMs?: number;
  /**
   * When true, an `ok:false` result forces the product to "down" rather than
   * "degraded". Critical = the product cannot function without it (missing
   * payment processor for a paid product, etc.). Defaults to false.
   */
  critical?: boolean;
}

export type ProductStatus = "ok" | "degraded" | "down";

export interface ProductHealth {
  productId: string;
  status: ProductStatus;
  checks: ProductCheck[];
  lastCheckedAt: string;
}

export interface ToolHealth {
  toolId: string;
  status: ProductStatus;
  checks: ProductCheck[];
  lastCheckedAt: string;
}

/** A product probe returns its raw checks; the registry stamps status + time. */
export type ProductProbeFn = () => Promise<ProductCheck[]>;

/* ─── Shared helpers (mirror healthz) ─── */

/**
 * Stripe reachability — cheap authenticated round-trip. Mirrors healthz's
 * checkStripe (products.list limit:1). Never logs the key value.
 */
async function stripeReachable(): Promise<ProductCheck> {
  const started = Date.now();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return {
      name: "stripe",
      ok: false,
      detail: "STRIPE_SECRET_KEY not set",
      critical: true,
      latencyMs: Date.now() - started,
    };
  }
  try {
    const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
    const list = await stripe.products.list({ limit: 1 });
    return {
      name: "stripe",
      ok: true,
      detail: `reachable (${list.data[0]?.livemode === false ? "test" : "live"} mode)`,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      name: "stripe",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      critical: true,
      latencyMs: Date.now() - started,
    };
  }
}

/**
 * Twilio reachability — fetch account info (cheap, ~50 ms). Mirrors healthz's
 * checkTwilio. Never logs credentials.
 */
async function twilioReachable(): Promise<ProductCheck> {
  const started = Date.now();
  if (!isTwilioConfigured()) {
    return {
      name: "twilio",
      ok: false,
      detail: "Twilio not configured",
      critical: true,
      latencyMs: Date.now() - started,
    };
  }
  try {
    const client = getTwilioClient();
    const account = await client.api
      .accounts(process.env.TWILIO_ACCOUNT_SID!)
      .fetch();
    if (account.status !== "active") {
      return {
        name: "twilio",
        ok: false,
        detail: `account status ${account.status}`,
        critical: true,
        latencyMs: Date.now() - started,
      };
    }
    return {
      name: "twilio",
      ok: true,
      detail: "account active",
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      name: "twilio",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
      critical: true,
      latencyMs: Date.now() - started,
    };
  }
}

/** Synchronous env-presence check helper. Checks PRESENCE only — never value. */
function presenceCheck(
  name: string,
  present: boolean,
  opts: { presentDetail: string; missingDetail: string; critical?: boolean },
): ProductCheck {
  return present
    ? { name, ok: true, detail: opts.presentDetail }
    : {
        name,
        ok: false,
        detail: opts.missingDetail,
        critical: opts.critical ?? false,
      };
}

/* ─── Exemplar probes (3) ─── */

/**
 * MapGuard — Google API key present + non-invasive reachability note.
 * Mirrors healthz's google_maps probe: key-presence only, NO geocode call
 * (that would burn quota on every dashboard tick).
 */
async function probeMapguard(): Promise<ProductCheck[]> {
  const googleKey =
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.VITE_GOOGLE_MAPS_API_KEY;
  return [
    presenceCheck("google_api_key", !!googleKey, {
      presentDetail: "Google API key present (probe is non-invasive)",
      missingDetail: "Google Maps/API key not set",
      critical: true,
    }),
  ];
}

/**
 * TradeLine — Twilio reachable (reuse healthz twilio probe) + A2P campaign
 * SID present in env. A2P campaign is required for compliant SMS delivery;
 * its absence is degraded (voice still works) not down.
 */
async function probeTradeline(): Promise<ProductCheck[]> {
  const twilio = await twilioReachable();
  const campaignSid = process.env.TWILIO_CAMPAIGN_SID?.trim();
  const a2p = presenceCheck("a2p_campaign", !!campaignSid, {
    presentDetail: "A2P campaign SID present",
    missingDetail: "TWILIO_CAMPAIGN_SID not set (A2P SMS may be blocked)",
    critical: false,
  });
  return [twilio, a2p];
}

/**
 * QuoteQuick — Stripe reachable (reuse healthz stripe probe) + at least one
 * QQ price ID present in env. Without a price ID, QQ checkout can't proceed,
 * so a missing price is critical.
 */
async function probeQuotequick(): Promise<ProductCheck[]> {
  const stripe = await stripeReachable();
  const qqPriceEnvVars = [
    "STRIPE_PRICE_QQ_PRO_MONTHLY",
    "STRIPE_PRICE_QQ_PRO_ANNUAL",
    "STRIPE_PRICE_QQ_BUSINESS_MONTHLY",
    "STRIPE_PRICE_QQ_BUSINESS_ANNUAL",
    "STRIPE_PRICE_QQ_STARTER_MONTHLY",
    "STRIPE_PRICE_QQ_STARTER_ANNUAL",
    "STRIPE_PRICE_QQ_INSTALL",
    "STRIPE_QUOTEQUICK_INSTALL_PRICE",
  ];
  const hasPrice = qqPriceEnvVars.some((v) => !!process.env[v]?.trim());
  const price = presenceCheck("qq_price_id", hasPrice, {
    presentDetail: "at least one QuoteQuick Stripe price ID present",
    missingDetail: "no QuoteQuick Stripe price ID set (checkout cannot proceed)",
    critical: true,
  });
  return [stripe, price];
}

/* ─── TODO stub (every non-exemplar product) ─── */

/**
 * TODO(wave-141+): implement a real probe for this product. Returns "ok" with
 * a single explicit "no probe yet" check so the aggregator reports all 13
 * products without faking health — the check is `ok:true` because we have no
 * signal to assert otherwise, and the detail makes the gap obvious.
 */
async function probeStub(): Promise<ProductCheck[]> {
  return [
    {
      name: "no_probe_yet",
      ok: true,
      detail: "TODO: no health probe implemented for this product yet (Wave 140 stub)",
    },
  ];
}

/* ─── Registry ─── */

/** productId → async probe fn. Exemplars implemented; rest are stubs. */
const PROBES: Record<string, ProductProbeFn> = {
  mapguard: probeMapguard,
  tradeline: probeTradeline,
  quotequick: probeQuotequick,
};

/** Reduce a product's checks to a single status. */
export function reduceStatus(checks: ProductCheck[]): ProductStatus {
  let worst: ProductStatus = "ok";
  for (const c of checks) {
    if (!c.ok) {
      if (c.critical) return "down";
      worst = "degraded";
    }
  }
  return worst;
}

/**
 * Run a single product's probe (exemplar or stub) and stamp status + time.
 * The aggregator wraps this so a thrown probe degrades to "down" rather than
 * crashing the aggregate.
 */
export async function runProductProbe(productId: string): Promise<ProductHealth> {
  const probe = PROBES[productId] ?? probeStub;
  const checks = await probe();
  return {
    productId,
    status: reduceStatus(checks),
    checks,
    lastCheckedAt: new Date().toISOString(),
  };
}

/** All product IDs, in ALL_PRODUCTS order. */
export function allProductIds(): string[] {
  return ALL_PRODUCTS.map((p) => p.id);
}

/**
 * AI-providers probe — business-continuity visibility for the LLM stack.
 *
 * Zero-cost (presence + in-memory circuit state only; never calls a provider).
 * Surfaces three things Alex needs to trust the "never rely on one LLM" design:
 *   - anthropic_primary  : the primary LLM key is present (critical if missing).
 *   - fallback_providers : how many backup providers are configured. ZERO
 *                          backups = degraded (a single-provider SPOF), even
 *                          though the primary still works.
 *   - anthropic_circuit  : when OPEN, the primary is failing and live traffic
 *                          is failing over to the backup chain right now.
 */
export async function runAiProvidersProbe(): Promise<ToolHealth> {
  const checks: ProductCheck[] = [];

  const anthropicPresent = !!process.env.ANTHROPIC_API_KEY?.trim();
  checks.push(
    presenceCheck("anthropic_primary", anthropicPresent, {
      presentDetail: "Anthropic (primary LLM) key present",
      missingDetail: "ANTHROPIC_API_KEY not set — primary LLM unavailable",
      critical: true,
    }),
  );

  const backups = readyFallbackProviders();
  checks.push({
    name: "fallback_providers",
    ok: backups.length > 0,
    detail:
      backups.length > 0
        ? `${backups.length} backup provider(s) configured: ${backups.join(", ")}`
        : "NO backup LLM providers configured — single point of failure",
    critical: false,
  });

  const circuit = getPrimaryCircuitState();
  checks.push({
    name: "anthropic_circuit",
    ok: circuit === "closed",
    detail:
      circuit === "closed"
        ? "primary circuit closed (healthy)"
        : circuit === "half_open"
          ? "primary circuit half-open (probing recovery)"
          : "primary circuit OPEN — failing over to backup providers",
    critical: false,
  });

  return {
    toolId: "ai_providers",
    status: reduceStatus(checks),
    checks,
    lastCheckedAt: new Date().toISOString(),
  };
}

/**
 * Tools probe — the free tools depend on external-API keys. Wave 140 checks
 * PRESENCE of the Serper key (the primary SERP provider the free tools and
 * MapGuard monitor rely on). Returns one ToolHealth entry.
 */
export async function runToolsProbe(): Promise<ToolHealth> {
  const serper = presenceCheck("serper_api_key", !!process.env.SERPER_API_KEY?.trim(), {
    presentDetail: "SERPER_API_KEY present (powers free-tool SERP lookups)",
    missingDetail: "SERPER_API_KEY not set (free tools relying on SERP will degrade)",
    critical: false,
  });
  const checks = [serper];
  return {
    toolId: "free_tools",
    status: reduceStatus(checks),
    checks,
    lastCheckedAt: new Date().toISOString(),
  };
}
