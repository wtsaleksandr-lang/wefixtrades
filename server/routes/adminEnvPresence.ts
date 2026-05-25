/**
 * Admin Env Presence — diagnostic endpoint for deploy verification.
 *
 * Reports presence-only (boolean true/false) of critical env vars in the
 * running container. NEVER exposes values, lengths, prefixes, hashes, or
 * any other characteristic of the value — only !!process.env[name].
 *
 * Useful for confirming what's actually loaded in the running Replit
 * container without touching the secrets vault.
 *
 * All routes require admin authentication.
 */

import type { Express, Request, Response } from "express";
import { requireAdmin } from "../auth";
import { createLogger } from "../lib/logger";

const log = createLogger("AdminEnvPresence");

/** Boolean-only presence check. Never returns or logs the value. */
const has = (name: string): boolean => !!process.env[name];

/**
 * Critical env vars grouped by category. Edit this list when a new
 * critical secret is introduced — keep the categories disjoint.
 */
const CATEGORIES = {
  meta_webhook: [
    "META_WEBHOOK_VERIFY_TOKEN",
    "FACEBOOK_OAUTH_CLIENT_ID",
    "FACEBOOK_OAUTH_CLIENT_SECRET",
    "FACEBOOK_APP_SECRET",
  ],
  stripe_contentflow_v2: [
    "STRIPE_PRICE_CONTENTFLOW_STARTER",
    "STRIPE_PRICE_CONTENTFLOW_CREATOR_V2",
    "STRIPE_PRICE_CONTENTFLOW_STUDIO_V2",
    "STRIPE_PRICE_CONTENTFLOW_AGENCY_V2",
  ],
  ai_orchestrator_providers: [
    "GROQ_API_KEY",
    "RESEND_API_KEY",
    "HUGGINGFACE_API_KEY",
    "TOGETHER_API_KEY",
    "BREVO_API_KEY",
    "COHERE_API_KEY",
    "MISTRAL_API_KEY",
    "OPENROUTER_API_KEY",
    "STABILITY_API_KEY",
    "REPLICATE_API_TOKEN",
    "MAILERLITE_API_KEY",
  ],
  existing_critical: [
    "STRIPE_SECRET_KEY",
    "DATABASE_URL",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "SENDGRID_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "SENTRY_DSN",
  ],
} as const;

export function registerAdminEnvPresenceRoutes(app: Express): void {
  /**
   * GET /api/admin/env-presence
   * Returns boolean-only presence of critical env vars + process metadata.
   * Admin-only. Safe to share — no values are exposed.
   */
  app.get("/api/admin/env-presence", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const categories: Record<string, Record<string, boolean>> = {};
      for (const [category, names] of Object.entries(CATEGORIES)) {
        const group: Record<string, boolean> = {};
        for (const name of names) {
          group[name] = has(name);
        }
        categories[category] = group;
      }

      res.json({
        ok: true,
        checked_at: new Date().toISOString(),
        categories,
        process_uptime_seconds: Math.round(process.uptime()),
        process_pid: process.pid,
        node_version: process.version,
      });
    } catch (err: any) {
      log.error("[env-presence] GET error", { error: err?.message ?? String(err) });
      res.status(500).json({ ok: false, error: "Failed to read env presence" });
    }
  });
}
