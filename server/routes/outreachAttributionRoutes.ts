/**
 * Outreach attribution + visibility routes — Lane OC.
 *
 * Four endpoints (registered in server/routes/index.ts):
 *
 *  1. POST /api/internal/outreach/attribution
 *     Called by the signup flow / Stripe conversion webhook when a new
 *     customer converts. Links the converting email back to its cold-outreach
 *     prospect, marks the prospect `converted`, records the source campaign
 *     in an append-only prospect event, and (when a sales opportunity exists)
 *     advances it to `paid`.
 *
 *     AUTH: internal shared-secret header `x-internal-token`, compared in
 *     constant time against INTERNAL_API_TOKEN (falls back to
 *     OUTREACH_WEBHOOK_SECRET so no new secret is strictly required).
 *     If neither env var is configured the endpoint refuses with 503 —
 *     never open-by-default.
 *
 *     Idempotent: a prospect already `converted` returns
 *     { matched: true, already_converted: true } and writes no duplicate
 *     event — safe for Stripe webhook retries.
 *
 *  2. GET /api/admin/outbound/attribution/funnel
 *     Admin-only per-campaign funnel: sent → opened → replied → positive →
 *     converted. Backs the funnel strip on the Campaigns page.
 *
 *  3. GET /api/admin/outbound/budget/status
 *     Admin-only readout of Lane OB's global send ramp: today's effective
 *     cap, sends consumed, remaining, ramp week, and the env hard cap.
 *     Read-only mirror of the EXACT enforcement math (computeGlobalDailyCap
 *     + the same sent_to_platform event filter the workers consume).
 *
 *  4. GET /api/admin/outbound/campaigns/:id/blocked-reasons
 *     Admin-only per-campaign consent-gate breakdown: distinct prospects
 *     held back, grouped by Lane OB's block code (prospect_events with
 *     event_type='blocked_consent', metadata.campaign_id/code). Backs the
 *     compliance strip in the campaign detail panel.
 */

import type { Express, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { requireAdmin } from "../auth";
import { db } from "../db";
import {
  prospects, campaignProspects, prospectEvents, salesOpportunities,
  outboundCampaigns,
} from "@shared/schema";
import { and, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { z } from "zod";
import {
  computeGlobalDailyCap, RAMP_BASE_DAILY, RAMP_WEEKLY_INCREMENT,
} from "../services/outboundSafety";
import {
  countGlobalSyncedSince, getFirstRealSendAt, startOfDayUtc,
} from "../jobs/outboundSyncWorker";

const log = createLogger("OutreachAttribution");

/* ─── Internal-token auth ───────────────────────────────────────────── */

/**
 * Constant-time shared-secret compare (mirrors the webhook receiver in
 * adminOutboundRoutes.ts — that helper is module-private, so re-declared
 * here rather than exported across lane-owned files).
 */
export function safeTokenEqual(provided: string | string[] | undefined, expected: string): boolean {
  if (typeof provided !== "string" || expected.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch (err) {
    log.warn("safeTokenEqual compare failed", { error: String(err) });
    return false;
  }
}

/** The configured internal token, or null when none is set. */
export function internalToken(): string | null {
  return process.env.INTERNAL_API_TOKEN || process.env.OUTREACH_WEBHOOK_SECRET || null;
}

/* ─── Request schema ────────────────────────────────────────────────── */

export const attributionBodySchema = z.object({
  /** The email address that signed up / paid. */
  email: z.string().trim().toLowerCase().email(),
  /** Where the conversion was observed. */
  source: z.enum(["signup", "stripe"]).default("signup"),
  /** Optional external reference — Stripe customer/session id, user id, etc. */
  external_ref: z.string().max(200).optional(),
  /** Optional ISO timestamp of the conversion (defaults to now). */
  converted_at: z.string().datetime({ offset: true }).optional(),
});
export type AttributionBody = z.infer<typeof attributionBodySchema>;

/* ─── Funnel shape ──────────────────────────────────────────────────── */

export interface CampaignFunnelRow {
  campaign_id: number;
  name: string;
  sent: number;
  opened: number;
  replied: number;
  positive: number;
  converted: number;
}

export function registerOutreachAttributionRoutes(app: Express): void {
  /**
   * POST /api/internal/outreach/attribution
   * Body: { email, source?, external_ref?, converted_at? }
   *
   * Always 200 on auth success — `matched: false` when the email doesn't
   * belong to any prospect, so signup/Stripe callers never fail their own
   * flow on a non-outbound customer.
   */
  app.post("/api/internal/outreach/attribution", async (req: Request, res: Response) => {
    const expected = internalToken();
    if (!expected) {
      // Refuse rather than run open: this endpoint mutates prospect state.
      return res.status(503).json({ error: "attribution endpoint not configured (set INTERNAL_API_TOKEN)" });
    }
    if (!safeTokenEqual(req.headers["x-internal-token"], expected)) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const parsed = attributionBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "invalid body", details: parsed.error.flatten().fieldErrors });
    }
    const { email, source, external_ref, converted_at } = parsed.data;
    const convertedAt = converted_at ? new Date(converted_at) : new Date();

    try {
      // 1. Find the prospect by exact (case-insensitive) email. ilike with no
      //    wildcards = case-insensitive equality in Postgres.
      const [prospect] = await db.select().from(prospects)
        .where(ilike(prospects.primary_email, email))
        .limit(1);
      if (!prospect) {
        return res.json({ matched: false });
      }

      // Idempotency: Stripe retries / double-fires must not duplicate events.
      if (prospect.status === "converted") {
        return res.json({ matched: true, prospect_id: prospect.id, already_converted: true });
      }

      // 2. Source campaign = the most recent campaign assignment.
      const [cp] = await db.select({
        id: campaignProspects.id,
        campaign_id: campaignProspects.campaign_id,
      })
        .from(campaignProspects)
        .where(eq(campaignProspects.prospect_id, prospect.id))
        .orderBy(desc(campaignProspects.assigned_at))
        .limit(1);

      // 3. Mark converted.
      await db.update(prospects)
        .set({ status: "converted", updated_at: new Date() })
        .where(eq(prospects.id, prospect.id));

      // 4. Append-only audit event recording the source campaign.
      await db.insert(prospectEvents).values({
        prospect_id: prospect.id,
        campaign_prospect_id: cp?.id ?? null,
        event_type: "converted",
        actor_type: "system",
        summary: `Converted via ${source}${external_ref ? ` (${external_ref})` : ""}`,
        metadata: {
          source,
          external_ref: external_ref ?? null,
          campaign_id: cp?.campaign_id ?? null,
          converted_at: convertedAt.toISOString(),
        },
      });

      // 5. If a sales opportunity is open, advance it to paid so the
      //    pipeline board reflects the conversion. Never demote paid/lost.
      const [opp] = await db.select().from(salesOpportunities)
        .where(eq(salesOpportunities.prospect_id, prospect.id))
        .orderBy(desc(salesOpportunities.created_at))
        .limit(1);
      if (opp && opp.stage !== "paid" && opp.stage !== "lost") {
        await db.update(salesOpportunities)
          .set({ stage: "paid", paid_at: convertedAt, updated_at: new Date() })
          .where(eq(salesOpportunities.id, opp.id));
      }

      log.info("attribution recorded", {
        prospect_id: prospect.id,
        campaign_id: cp?.campaign_id ?? null,
        source,
      });
      return res.json({
        matched: true,
        prospect_id: prospect.id,
        campaign_id: cp?.campaign_id ?? null,
        opportunity_updated: !!(opp && opp.stage !== "paid" && opp.stage !== "lost"),
      });
    } catch (err: any) {
      log.error("attribution failed", { error: err?.message ?? String(err) });
      return res.status(500).json({ error: "attribution failed" });
    }
  });

  /**
   * GET /api/admin/outbound/attribution/funnel
   * Per-campaign funnel counts: sent → opened → replied → positive → converted.
   *
   * Stage definitions (each stage is cumulative-ish — a reply implies an
   * open, so later statuses count toward earlier stages):
   *   sent      — pushed + at least one email out (emails_sent > 0 or any
   *               post-send outreach_status)
   *   opened    — outreach_status opened/clicked, or replied (reply ⇒ open)
   *   replied   — last_replied_at set or outreach_status = replied
   *   positive  — reply classified positive (sentiment or type)
   *   converted — joined prospect.status = converted
   */
  app.get("/api/admin/outbound/attribution/funnel", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const postSend = ["sent", "opened", "clicked", "replied", "bounced", "unsubscribed", "opted_out"];
      const openedStatuses = ["opened", "clicked", "replied"];

      const rows = await db.select({
        campaign_id: outboundCampaigns.id,
        name: outboundCampaigns.name,
        sent: sql<number>`coalesce(sum(case when ${campaignProspects.emails_sent} > 0 or ${campaignProspects.outreach_status} in (${sql.join(postSend.map((s) => sql`${s}`), sql`, `)}) then 1 else 0 end), 0)`,
        opened: sql<number>`coalesce(sum(case when ${campaignProspects.outreach_status} in (${sql.join(openedStatuses.map((s) => sql`${s}`), sql`, `)}) or ${campaignProspects.last_replied_at} is not null then 1 else 0 end), 0)`,
        replied: sql<number>`coalesce(sum(case when ${campaignProspects.last_replied_at} is not null or ${campaignProspects.outreach_status} = 'replied' then 1 else 0 end), 0)`,
        positive: sql<number>`coalesce(sum(case when ${campaignProspects.reply_sentiment} = 'positive' or ${campaignProspects.reply_type} = 'positive' then 1 else 0 end), 0)`,
        converted: sql<number>`coalesce(sum(case when ${prospects.status} = 'converted' then 1 else 0 end), 0)`,
      })
        .from(outboundCampaigns)
        .leftJoin(campaignProspects, eq(campaignProspects.campaign_id, outboundCampaigns.id))
        .leftJoin(prospects, eq(prospects.id, campaignProspects.prospect_id))
        .where(inArray(outboundCampaigns.status, ["active", "paused"]))
        .groupBy(outboundCampaigns.id, outboundCampaigns.name);

      const funnel: CampaignFunnelRow[] = rows.map((r) => ({
        campaign_id: r.campaign_id,
        name: r.name,
        sent: Number(r.sent),
        opened: Number(r.opened),
        replied: Number(r.replied),
        positive: Number(r.positive),
        converted: Number(r.converted),
      }));
      return res.json({ funnel });
    } catch (err: any) {
      log.error("funnel query failed", { error: err?.message ?? String(err) });
      return res.status(500).json({ error: "funnel query failed" });
    }
  });

  /**
   * GET /api/admin/outbound/budget/status
   * Read-only mirror of Lane OB's global send ramp for the Sending page.
   *
   * { first_real_send_at, ramp_week, ramp_cap, env_cap, effective_cap,
   *   sent_today, remaining }
   *
   * effective_cap reuses computeGlobalDailyCap() and sent_today reuses
   * countGlobalSyncedSince() — the dashboard can never disagree with what
   * the workers actually enforce.
   */
  app.get("/api/admin/outbound/budget/status", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const firstRealSendAt = await getFirstRealSendAt();

      const rampWeek = firstRealSendAt
        ? Math.max(0, Math.floor((now.getTime() - firstRealSendAt.getTime()) / (7 * 24 * 60 * 60 * 1000)))
        : 0;
      const rampCap = RAMP_BASE_DAILY + rampWeek * RAMP_WEEKLY_INCREMENT;

      // Same validation computeGlobalDailyCap applies: positive integer or ignored.
      const envCapRaw = process.env.OUTBOUND_GLOBAL_DAILY_CAP;
      const envCapParsed = envCapRaw ? parseInt(envCapRaw, 10) : NaN;
      const envCap = Number.isFinite(envCapParsed) && envCapParsed > 0 ? envCapParsed : null;

      const effectiveCap = computeGlobalDailyCap(firstRealSendAt, now);
      const sentToday = await countGlobalSyncedSince(startOfDayUtc());

      return res.json({
        first_real_send_at: firstRealSendAt ? firstRealSendAt.toISOString() : null,
        ramp_week: rampWeek,
        ramp_cap: rampCap,
        env_cap: envCap,
        effective_cap: effectiveCap,
        sent_today: sentToday,
        remaining: Math.max(0, effectiveCap - sentToday),
      });
    } catch (err: any) {
      log.error("budget status query failed", { error: err?.message ?? String(err) });
      return res.status(500).json({ error: "budget status query failed" });
    }
  });

  /**
   * GET /api/admin/outbound/campaigns/:id/blocked-reasons
   * Per-campaign consent-gate breakdown for the compliance strip.
   *
   * Counts DISTINCT prospects (not raw events — re-assign attempts can log
   * the same prospect twice) per Lane OB block code, scoped to this campaign
   * via the metadata both OB call sites write:
   *   assign-time: { campaign_id, code, confidence }   (adminOutboundRoutes)
   *   push-time:   { code, campaign_id }               (worker + manual sync)
   *
   * → { campaign_id, total, reasons: [{ code, count }] }
   */
  app.get("/api/admin/outbound/campaigns/:id/blocked-reasons", requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "invalid_id" });
      }

      const rows = await db
        .select({
          code: sql<string>`coalesce(${prospectEvents.metadata}->>'code', 'unknown')`,
          count: sql<number>`count(distinct ${prospectEvents.prospect_id})`,
        })
        .from(prospectEvents)
        .where(and(
          eq(prospectEvents.event_type, "blocked_consent"),
          sql`${prospectEvents.metadata}->>'campaign_id' = ${String(id)}`,
        ))
        .groupBy(sql`coalesce(${prospectEvents.metadata}->>'code', 'unknown')`);

      const reasons = rows
        .map((r) => ({ code: r.code, count: Number(r.count) }))
        .sort((a, b) => b.count - a.count);
      const total = reasons.reduce((sum, r) => sum + r.count, 0);

      return res.json({ campaign_id: id, total, reasons });
    } catch (err: any) {
      log.error("blocked-reasons query failed", { error: err?.message ?? String(err) });
      return res.status(500).json({ error: "blocked-reasons query failed" });
    }
  });
}
