/**
 * Portal SMS templates routes.
 *
 * Mounted under /api/portal/sms-templates/*. Auth: requireClient.
 *
 * Wave 82 backend half. Surfaces the central SMS template registry to the
 * authenticated tenant alongside any per-tenant override row from
 * `sms_template_overrides`. Wave 83 will consume these endpoints from the
 * trade-facing settings UI.
 *
 * Endpoints
 *   GET   /api/portal/sms-templates
 *     → returns one merged entry per registry id, with an `override` block
 *       when the tenant has a row.
 *
 *   PATCH /api/portal/sms-templates/:templateId
 *     → upserts the override. Body: `{ enabled?: boolean, body_override?: string | null }`.
 *       Refuses `enabled: false` on registry-pinned-mandatory templates
 *       (e.g. deposit-receipt) with 409.
 *
 *   POST  /api/portal/sms-templates/:templateId/test
 *     → resolves the template with the supplied vars and sends an SMS to
 *       `to_phone`. Rate-limited per tenant (5 / hour) so this endpoint
 *       can't be turned into a spam vector.
 */

import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { requireClient } from "../../auth";
import { db } from "../../db";
import { clients } from "@shared/schema";
import { smsTemplateOverrides } from "@shared/schemas/smsTemplateOverrides";
import {
  SMS_TEMPLATE_REGISTRY,
  SMS_TEMPLATE_IDS,
  type SmsTemplateId,
} from "../../../shared/sms/templateRegistry";
import {
  resolveSmsTemplate,
  __clearSmsTemplateResolverCache,
} from "../../lib/smsTemplateResolver";
import { isTwilioConfigured, sendSmsAsClient } from "../../twilioClient";
import { createLogger } from "../../lib/logger";

const log = createLogger("PortalSmsTemplates");

/** Resolve client_id from the authenticated user. Returns null when none. */
async function resolveClientId(userId: number): Promise<number | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.user_id, userId))
    .limit(1);
  return row?.id ?? null;
}

/** 403 unless the auth user maps to a `clients` row. Admins must impersonate. */
async function requireResolvedClientId(req: Request, res: Response): Promise<number | null> {
  if (req.user!.role === "admin" && !req.adminImpersonating) {
    res.status(403).json({
      error: "Admin must impersonate a customer for this action",
      code: "admin_no_impersonation",
    });
    return null;
  }
  const clientId = await resolveClientId(req.user!.id);
  if (!clientId) {
    res.status(403).json({ error: "No client record linked to this account", code: "no_client_linked" });
    return null;
  }
  return clientId;
}

function isSmsTemplateId(x: string): x is SmsTemplateId {
  return (SMS_TEMPLATE_IDS as string[]).includes(x);
}

// ─── /test rate limit ────────────────────────────────────────────────
// Per-tenant 5/hour cap on the test endpoint. In-memory is fine for now;
// Wave 82's test sends are low volume and a process restart only resets
// the window, which is acceptable for an abuse guard (not a billing one).
interface TestRateState {
  count: number;
  windowStartedAt: number;
}
const TEST_WINDOW_MS = 60 * 60 * 1000;
const TEST_LIMIT = 5;
const testRate = new Map<number, TestRateState>();

function consumeTestRate(clientId: number): { ok: boolean; remaining: number } {
  const now = Date.now();
  const cur = testRate.get(clientId);
  if (!cur || now - cur.windowStartedAt >= TEST_WINDOW_MS) {
    testRate.set(clientId, { count: 1, windowStartedAt: now });
    return { ok: true, remaining: TEST_LIMIT - 1 };
  }
  if (cur.count >= TEST_LIMIT) {
    return { ok: false, remaining: 0 };
  }
  cur.count += 1;
  return { ok: true, remaining: TEST_LIMIT - cur.count };
}

export function registerPortalSmsTemplatesRoutes(app: Express) {
  /**
   * GET /api/portal/sms-templates
   *
   * Returns one entry per registry template, merged with the tenant's
   * override row (if any). Shape is stable for the Wave 83 UI:
   *
   * ```
   * [
   *   {
   *     id, product, category, defaultEnabled, defaultBody, vars,
   *     description, quietHoursBypass, canBeDisabled,
   *     override?: { enabled, body_override, updated_at }
   *   },
   *   ...
   * ]
   * ```
   */
  app.get("/api/portal/sms-templates", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await requireResolvedClientId(req, res);
      if (!clientId) return;

      const overrides = await db
        .select()
        .from(smsTemplateOverrides)
        .where(eq(smsTemplateOverrides.client_id, clientId));

      const overrideByTemplate = new Map<string, typeof overrides[number]>();
      for (const row of overrides) overrideByTemplate.set(row.template_id, row);

      const merged = SMS_TEMPLATE_IDS.map((id) => {
        const reg = SMS_TEMPLATE_REGISTRY[id];
        const row = overrideByTemplate.get(id);
        return {
          ...reg,
          override: row
            ? {
                enabled: row.enabled,
                body_override: row.body_override,
                updated_at: row.updated_at,
              }
            : null,
        };
      });

      res.json({ templates: merged });
    } catch (err: any) {
      log.error("GET /sms-templates failed", { error: err?.message });
      res.status(500).json({ error: "Could not load SMS templates" });
    }
  });

  /**
   * PATCH /api/portal/sms-templates/:templateId
   *
   * Upserts the per-tenant override. Body keys are both optional:
   *   - enabled        boolean
   *   - body_override  string | null   (null clears the override)
   *
   * Returns 409 when `enabled: false` is sent against a registry-pinned
   * mandatory template (e.g. deposit-receipt). Returns 400 on unknown
   * `templateId` so a typo doesn't silently create an orphan row.
   */
  app.patch("/api/portal/sms-templates/:templateId", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await requireResolvedClientId(req, res);
      if (!clientId) return;

      const templateId = String(req.params.templateId ?? "");
      if (!isSmsTemplateId(templateId)) {
        return res.status(400).json({ error: "Unknown template id", code: "unknown_template" });
      }
      const reg = SMS_TEMPLATE_REGISTRY[templateId];

      const { enabled, body_override } = req.body ?? {};

      if (enabled !== undefined && typeof enabled !== "boolean") {
        return res.status(400).json({ error: "`enabled` must be boolean" });
      }
      if (body_override !== undefined && body_override !== null && typeof body_override !== "string") {
        return res.status(400).json({ error: "`body_override` must be string or null" });
      }
      // Reject obviously-too-long bodies upfront so we don't write rows
      // that always throw on send. 1000 chars covers the longest realistic
      // multi-segment SMS without being so generous it lets a tenant
      // store a novel.
      if (typeof body_override === "string" && body_override.length > 1000) {
        return res.status(400).json({ error: "`body_override` must be 1000 chars or fewer" });
      }

      // Refuse to mute a template the registry marks as mandatory.
      if (enabled === false && !reg.canBeDisabled) {
        return res.status(409).json({
          error: "This template cannot be disabled (compliance / carrier requirement).",
          code: "cannot_disable",
        });
      }

      // Read existing row to compute the upsert input. We avoid Drizzle's
      // onConflictDoUpdate so partial PATCH semantics (don't clobber the
      // body when only `enabled` was sent) are easy to reason about.
      const [existing] = await db
        .select()
        .from(smsTemplateOverrides)
        .where(
          and(
            eq(smsTemplateOverrides.client_id, clientId),
            eq(smsTemplateOverrides.template_id, templateId),
          ),
        )
        .limit(1);

      if (existing) {
        await db
          .update(smsTemplateOverrides)
          .set({
            enabled: enabled !== undefined ? enabled : existing.enabled,
            body_override: body_override !== undefined ? body_override : existing.body_override,
            updated_by: req.user!.id,
            updated_at: new Date(),
          })
          .where(eq(smsTemplateOverrides.id, existing.id));
      } else {
        await db.insert(smsTemplateOverrides).values({
          client_id: clientId,
          template_id: templateId,
          enabled: enabled ?? reg.defaultEnabled,
          body_override: body_override ?? null,
          updated_by: req.user!.id,
        });
      }

      // Bust the resolver cache so the next send sees the fresh row.
      __clearSmsTemplateResolverCache();

      res.json({ ok: true });
    } catch (err: any) {
      log.error("PATCH /sms-templates/:id failed", { error: err?.message });
      res.status(500).json({ error: "Could not save SMS template override" });
    }
  });

  /**
   * POST /api/portal/sms-templates/:templateId/test
   *
   * Body:
   *   - to_phone   string  E.164 phone to receive the test send
   *   - vars       Record<string, string | number>  placeholder values
   *
   * Resolves the template (so a tenant editing the body sees their
   * pending wording) and ships it via the per-tenant TradeLine number.
   * Rate-limited to 5 sends per tenant per hour as an abuse guard.
   */
  app.post("/api/portal/sms-templates/:templateId/test", requireClient, async (req: Request, res: Response) => {
    try {
      const clientId = await requireResolvedClientId(req, res);
      if (!clientId) return;

      const templateId = String(req.params.templateId ?? "");
      if (!isSmsTemplateId(templateId)) {
        return res.status(400).json({ error: "Unknown template id", code: "unknown_template" });
      }
      const reg = SMS_TEMPLATE_REGISTRY[templateId];

      const { to_phone, vars } = req.body ?? {};
      if (typeof to_phone !== "string" || !/^\+?\d{7,}$/.test(to_phone.replace(/[\s\-()]/g, ""))) {
        return res.status(400).json({ error: "`to_phone` must be a valid phone number" });
      }
      if (vars !== undefined && (typeof vars !== "object" || vars === null || Array.isArray(vars))) {
        return res.status(400).json({ error: "`vars` must be an object" });
      }

      const rate = consumeTestRate(clientId);
      if (!rate.ok) {
        return res.status(429).json({
          error: "Test send rate limit reached. Try again in an hour.",
          code: "rate_limited",
        });
      }

      if (!isTwilioConfigured()) {
        return res.status(503).json({ error: "Twilio is not configured", code: "twilio_unconfigured" });
      }

      const resolved = await resolveSmsTemplate({
        templateId,
        clientId,
        vars: (vars as Record<string, string | number>) ?? {},
      });
      if (!resolved.enabled) {
        return res.status(409).json({
          error: "This template is currently disabled for your account.",
          code: "template_disabled",
        });
      }

      try {
        const twilio_sid = await sendSmsAsClient({
          clientId,
          to: to_phone,
          body: resolved.body,
          channel: "sms",
          quietHoursBypass: reg.quietHoursBypass,
        });
        res.json({ ok: true, twilio_sid, remaining: rate.remaining });
      } catch (err: any) {
        if (err?.message === "sms_quiet_hours_blocked") {
          return res.status(409).json({
            error: "Recipient is in their quiet-hours window. Try a transactional template or another recipient.",
            code: "quiet_hours",
          });
        }
        if (err?.message === "sms_recipient_opted_out") {
          return res.status(409).json({
            error: "Recipient has opted out of SMS.",
            code: "opted_out",
          });
        }
        throw err;
      }
    } catch (err: any) {
      log.error("POST /sms-templates/:id/test failed", { error: err?.message });
      res.status(500).json({ error: "Could not send test SMS" });
    }
  });
}
