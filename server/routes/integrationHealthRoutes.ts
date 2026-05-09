/**
 * Integration health probes for the admin dashboard.
 *
 * Each external dependency (Stripe, Twilio, SMTP, Vapi, Anthropic,
 * OpenAI, Postgres) gets a small probe that returns one of four
 * statuses:
 *
 *   ok              — credentials present, ping succeeded
 *   degraded        — credentials present but ping took unusually
 *                      long (>2s) or returned a soft warning
 *   down            — credentials present but ping failed
 *   not_configured  — credentials missing (expected in dev / pre-launch)
 *
 * Probes run in parallel, each with its own 5-second timeout. Where
 * a vendor charges per call (Anthropic, OpenAI), we deliberately
 * skip the network round-trip and just report `ok` if creds are set
 * — those probes shouldn't burn tokens to confirm liveness.
 *
 * GET /api/admin/integration-health
 *   → { generated_at, items: ProbeResult[] }
 */

import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { getEmailTransporter } from "../lib/emailTransport";
import { isTwilioConfigured, getTwilioClient } from "../twilioClient";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";

const log = createLogger("IntegrationHealth");

export type ProbeStatus = "ok" | "degraded" | "down" | "not_configured";

export interface ProbeResult {
  /** Slug used as a key on the frontend (stable). */
  service: string;
  /** Human-readable label. */
  label: string;
  /** What category this is in for grouping in the UI. */
  category: "payments" | "comms" | "ai" | "infra";
  status: ProbeStatus;
  latency_ms: number | null;
  /** Optional one-line context. May contain an error message when status=down. */
  details: string | null;
  /** ISO timestamp when this probe ran. */
  last_checked: string;
}

const TIMEOUT_MS = 5_000;
const DEGRADED_THRESHOLD_MS = 2_000;

/** Wraps a probe with a timeout and a uniform error → `down` mapping. */
async function runProbe(
  meta: Pick<ProbeResult, "service" | "label" | "category">,
  fn: () => Promise<{ status: ProbeStatus; details?: string | null }>,
): Promise<ProbeResult> {
  const started = Date.now();
  const last_checked = new Date().toISOString();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<{ status: ProbeStatus; details: string }>((_, reject) =>
        setTimeout(() => reject(new Error(`Probe timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
      ),
    ]);
    const latency_ms = Date.now() - started;
    let status = result.status;
    if (status === "ok" && latency_ms > DEGRADED_THRESHOLD_MS) status = "degraded";
    return {
      ...meta,
      status,
      latency_ms,
      details: result.details ?? null,
      last_checked,
    };
  } catch (err) {
    return {
      ...meta,
      status: "down",
      latency_ms: Date.now() - started,
      details: err instanceof Error ? err.message : String(err),
      last_checked,
    };
  }
}

/* ─── Individual probes ─── */

async function probeStripe(): Promise<{ status: ProbeStatus; details?: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { status: "not_configured", details: "STRIPE_SECRET_KEY not set" };
  const stripe = new Stripe(key, { apiVersion: "2025-01-27.acacia" as any });
  // balance.retrieve is the cheapest authenticated round-trip.
  const balance = await stripe.balance.retrieve();
  return {
    status: "ok",
    details: balance.livemode ? "live mode" : "test mode",
  };
}

async function probeTwilio(): Promise<{ status: ProbeStatus; details?: string }> {
  if (!isTwilioConfigured()) {
    return { status: "not_configured", details: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / from-number missing" };
  }
  const client = getTwilioClient();
  // Fetching the account itself is the cheapest authenticated check.
  const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID!).fetch();
  if (account.status !== "active") {
    return { status: "degraded", details: `account status: ${account.status}` };
  }
  return { status: "ok", details: `account ${account.status}` };
}

async function probeSmtp(): Promise<{ status: ProbeStatus; details?: string }> {
  const t = getEmailTransporter();
  if (!t) return { status: "not_configured", details: "SMTP_HOST not set" };
  await t.verify();
  return { status: "ok", details: "verified" };
}

async function probeVapi(): Promise<{ status: ProbeStatus; details?: string }> {
  const key = process.env.VAPI_API_KEY;
  if (!key) return { status: "not_configured", details: "VAPI_API_KEY not set" };
  const res = await fetch("https://api.vapi.ai/assistant?limit=1", {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (res.status === 401 || res.status === 403) {
    return { status: "down", details: `auth rejected (${res.status})` };
  }
  if (!res.ok) {
    return { status: "down", details: `HTTP ${res.status}` };
  }
  return { status: "ok" };
}

async function probeAnthropic(): Promise<{ status: ProbeStatus; details?: string }> {
  // Deliberately don't burn tokens on a real model call. Presence of
  // the key + any past successful invocation is what matters.
  if (!process.env.ANTHROPIC_API_KEY) {
    return { status: "not_configured", details: "ANTHROPIC_API_KEY not set" };
  }
  return { status: "ok", details: "key present (probe is non-invasive)" };
}

async function probeOpenAI(): Promise<{ status: ProbeStatus; details?: string }> {
  if (!process.env.OPENAI_API_KEY) {
    return { status: "not_configured", details: "OPENAI_API_KEY not set" };
  }
  return { status: "ok", details: "key present (probe is non-invasive)" };
}

async function probePostgres(): Promise<{ status: ProbeStatus; details?: string }> {
  // SELECT 1 — confirms the pool is alive.
  await db.execute(sql`select 1`);
  return { status: "ok" };
}

/* ─── Route registration ─── */

export function registerIntegrationHealthRoutes(app: Express): void {
  app.get(
    "/api/admin/integration-health",
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const probes = await Promise.all([
          runProbe({ service: "postgres", label: "Database", category: "infra" }, probePostgres),
          runProbe({ service: "stripe", label: "Stripe", category: "payments" }, probeStripe),
          runProbe({ service: "twilio", label: "Twilio (SMS / WhatsApp)", category: "comms" }, probeTwilio),
          runProbe({ service: "smtp", label: "SMTP (Email)", category: "comms" }, probeSmtp),
          runProbe({ service: "vapi", label: "Vapi (Voice)", category: "comms" }, probeVapi),
          runProbe({ service: "anthropic", label: "Anthropic Claude", category: "ai" }, probeAnthropic),
          runProbe({ service: "openai", label: "OpenAI", category: "ai" }, probeOpenAI),
        ]);
        res.json({ generated_at: new Date().toISOString(), items: probes });
      } catch (err) {
        log.error("integration-health failed", { error: String(err) });
        res.status(500).json({ error: "Failed to gather health" });
      }
    },
  );
}
