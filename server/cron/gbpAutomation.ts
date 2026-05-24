/**
 * Google Business Profile (GBP) daily automation cron jobs.
 *
 * Three independent ticks, each safe to call before GBP is connected:
 *
 *   runDailyPostTick      — 13:47 UTC (= 09:47 AM Toronto). Drains
 *                           gbp_post_queue. When the queue is empty,
 *                           generates ONE auto-post from a rotating
 *                           template (service highlight / pro tip /
 *                           business hours / promo).
 *
 *   runReviewMonitorTick  — every hour at minute 23. Lists reviews,
 *                           diffs against gbp_seen_reviews, persists
 *                           net-new ones, and emits an automation-log
 *                           row per new review (downstream notification
 *                           layer can subscribe).
 *
 *   runHoursSyncTick      — 05:37 UTC (= 01:37 AM Toronto). Reads
 *                           business_hours / special_hours from the
 *                           primary clients row (WFX_PRIMARY_CLIENT_ID,
 *                           default = lowest id) and PATCHes the GBP
 *                           location to match.
 *
 * All three jobs no-op gracefully if `oauth_tokens` has no row for
 * provider='gbp' (or provider='google' with business.manage scope) —
 * they log "GBP not connected, skipping" + a tick_skipped row in
 * gbp_automation_log, then return.
 *
 * Registered from server/jobs/scheduler.ts.
 */

import { db } from "../db";
import {
  gbpAutomationLog,
  gbpPostQueue,
  gbpSeenReviews,
  clients,
  type GbpPostQueueRow,
} from "@shared/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import {
  createLocalPost,
  getAutomationContext,
  listReviews,
  patchLocationHours,
  type GbpAutomationContext,
  type GbpReview,
} from "../lib/seo/gbpClient";

const log = createLogger("GbpAutomationCron");

type JobName = "daily_post" | "review_monitor" | "hours_sync";

/* ─── Log helper ──────────────────────────────────────────────────── */

interface LogArgs {
  job: JobName;
  event_type: string;
  status?: "ok" | "error" | "noop";
  reference_id?: string | null;
  http_status?: number | null;
  message?: string | null;
  payload?: Record<string, unknown> | null;
}

async function writeLog(args: LogArgs): Promise<void> {
  try {
    await db.insert(gbpAutomationLog).values({
      job: args.job,
      event_type: args.event_type,
      status: args.status ?? null,
      reference_id: args.reference_id ?? null,
      http_status: args.http_status ?? null,
      message: args.message ?? null,
      payload: (args.payload as any) ?? null,
    });
  } catch (err: any) {
    log.error("Failed to write gbp_automation_log", { error: err?.message, job: args.job });
  }
}

async function resolveContext(job: JobName): Promise<GbpAutomationContext | null> {
  const ctx = await getAutomationContext();
  if (!ctx) {
    log.info(`${job}: GBP not connected, skipping`);
    await writeLog({
      job,
      event_type: "tick_skipped",
      status: "noop",
      message: "GBP not connected (no oauth_tokens row for provider=gbp/google with business.manage scope, or GBP_LOCATION_NAME unset)",
    });
  }
  return ctx;
}

/* ═══════════════════════════════════════════════════════════════════
 * 1) Daily auto-post
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Rotating fallback templates used when the queue is empty. Picked by
 * UTC day-of-year mod templates.length — deterministic across multi-
 * instance scheduling without needing a "last template index" column.
 */
const FALLBACK_TEMPLATES: Array<{
  topicType: "STANDARD" | "OFFER";
  summary: string;
}> = [
  {
    topicType: "STANDARD",
    summary:
      "Running a trades business? WeFixTrades hands you the website, " +
      "quote calculator, booking flow, review funnel, and AI receptionist " +
      "in one package — no designer, developer, or marketing agency needed.",
  },
  {
    topicType: "STANDARD",
    summary:
      "Pro tip: half of homeowners abandon a quote request that takes " +
      "more than 60 seconds. A live online calculator that prices the job " +
      "instantly keeps them on your site instead of the next plumber's.",
  },
  {
    topicType: "STANDARD",
    summary:
      "Open today: 8 AM – 6 PM. Need a website, quote tool, or AI " +
      "answering service for your trades business? Book a free demo at " +
      "wefixtrades.com — see your branded site live in under 10 minutes.",
  },
  {
    topicType: "OFFER",
    summary:
      "Launch special: new trades customers get the QuoteQuick widget, a " +
      "branded mini-site, and the AI review funnel free for the first 14 " +
      "days. Cancel anytime. See it live at wefixtrades.com.",
  },
];

function pickFallbackTemplate(now: Date = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const diff = now.getTime() - start;
  const dayOfYear = Math.floor(diff / 86_400_000);
  return FALLBACK_TEMPLATES[dayOfYear % FALLBACK_TEMPLATES.length];
}

export interface DailyPostTickResult {
  ran: boolean;
  source: "queue" | "fallback" | "skipped";
  posted_id?: string | null;
  remote_post_id?: string | null;
  error?: string;
}

export async function runDailyPostTick(): Promise<DailyPostTickResult> {
  const ctx = await resolveContext("daily_post");
  if (!ctx) return { ran: false, source: "skipped" };

  await writeLog({ job: "daily_post", event_type: "tick_start" });

  // 1. Try the queue (oldest pending first).
  const queued: GbpPostQueueRow[] = await db
    .select()
    .from(gbpPostQueue)
    .where(eq(gbpPostQueue.status, "pending"))
    .orderBy(asc(gbpPostQueue.scheduled_for), asc(gbpPostQueue.created_at))
    .limit(1);

  const useQueue = queued.length > 0;
  const queuedRow = useQueue ? queued[0] : null;
  const postPayload = useQueue
    ? {
        summary: queuedRow!.summary,
        topicType: (queuedRow!.topic_type as any) || "STANDARD",
        languageCode: queuedRow!.language_code || "en",
        callToAction: (queuedRow!.call_to_action as any) || undefined,
        media: (queuedRow!.media as any) || undefined,
      }
    : (() => {
        const tpl = pickFallbackTemplate();
        return {
          summary: tpl.summary,
          topicType: tpl.topicType,
          languageCode: "en",
        };
      })();

  const result = await createLocalPost(ctx, postPayload);

  if (!result.ok) {
    log.error("daily_post: createLocalPost failed", {
      status: result.status,
      error: result.error,
    });
    if (useQueue && queuedRow) {
      await db
        .update(gbpPostQueue)
        .set({
          status: result.permanent ? "failed" : "pending",
          error: result.error ?? "unknown",
          updated_at: new Date(),
        })
        .where(eq(gbpPostQueue.id, queuedRow.id));
    }
    await writeLog({
      job: "daily_post",
      event_type: "api_error",
      status: "error",
      reference_id: queuedRow?.id ?? null,
      http_status: result.status ?? null,
      message: result.error ?? "createLocalPost failed",
    });
    return {
      ran: true,
      source: useQueue ? "queue" : "fallback",
      posted_id: queuedRow?.id ?? null,
      error: result.error,
    };
  }

  const remoteId = result.data?.name ?? null;

  if (useQueue && queuedRow) {
    await db
      .update(gbpPostQueue)
      .set({
        status: "posted",
        remote_post_id: remoteId,
        posted_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(gbpPostQueue.id, queuedRow.id));
  }

  await writeLog({
    job: "daily_post",
    event_type: "post_created",
    status: "ok",
    reference_id: queuedRow?.id ?? remoteId,
    http_status: result.status ?? null,
    message: useQueue ? "Posted queued GBP update" : "Posted rotating fallback template",
    payload: {
      remote_post_id: remoteId,
      source: useQueue ? "queue" : "fallback",
      topic_type: postPayload.topicType,
    },
  });

  return {
    ran: true,
    source: useQueue ? "queue" : "fallback",
    posted_id: queuedRow?.id ?? null,
    remote_post_id: remoteId,
  };
}

/* ═══════════════════════════════════════════════════════════════════
 * 2) Hourly review monitoring
 * ═══════════════════════════════════════════════════════════════════ */

const STAR_MAP: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
  ONE_STAR: 1, TWO_STAR: 2, THREE_STAR: 3, FOUR_STAR: 4, FIVE_STAR: 5,
};

function parseStarRating(rating: string): number | null {
  if (!rating) return null;
  if (STAR_MAP[rating] !== undefined) return STAR_MAP[rating];
  const n = parseInt(rating, 10);
  return Number.isFinite(n) ? n : null;
}

function reviewKey(r: GbpReview, locationName: string): string {
  // Prefer `name` (full resource path) when present; fall back to reviewId.
  return r.name && r.name.length > 0 ? r.name : `${locationName}/reviews/${r.reviewId}`;
}

export interface ReviewMonitorTickResult {
  ran: boolean;
  fetched: number;
  new_reviews: number;
  error?: string;
}

export async function runReviewMonitorTick(): Promise<ReviewMonitorTickResult> {
  const ctx = await resolveContext("review_monitor");
  if (!ctx) return { ran: false, fetched: 0, new_reviews: 0 };

  await writeLog({ job: "review_monitor", event_type: "tick_start" });

  const result = await listReviews(ctx, { pageSize: 50 });
  if (!result.ok) {
    log.error("review_monitor: listReviews failed", {
      status: result.status,
      error: result.error,
    });
    await writeLog({
      job: "review_monitor",
      event_type: "api_error",
      status: "error",
      http_status: result.status ?? null,
      message: result.error ?? "listReviews failed",
    });
    return { ran: true, fetched: 0, new_reviews: 0, error: result.error };
  }

  const reviews = result.data?.reviews ?? [];
  if (reviews.length === 0) {
    await writeLog({
      job: "review_monitor",
      event_type: "tick_ok",
      status: "ok",
      message: "No reviews on listing",
      payload: { fetched: 0, new_reviews: 0 },
    });
    return { ran: true, fetched: 0, new_reviews: 0 };
  }

  const keys = reviews.map((r) => reviewKey(r, ctx.locationName));
  const seen = await db
    .select({ review_id: gbpSeenReviews.review_id })
    .from(gbpSeenReviews)
    .where(inArray(gbpSeenReviews.review_id, keys));
  const seenSet = new Set(seen.map((s) => s.review_id));

  const fresh = reviews.filter((r) => !seenSet.has(reviewKey(r, ctx.locationName)));

  if (fresh.length > 0) {
    await db
      .insert(gbpSeenReviews)
      .values(
        fresh.map((r) => ({
          review_id: reviewKey(r, ctx.locationName),
          location_name: ctx.locationName,
          star_rating: parseStarRating(r.starRating),
        })),
      )
      .onConflictDoNothing({ target: gbpSeenReviews.review_id });

    for (const r of fresh) {
      await writeLog({
        job: "review_monitor",
        event_type: "new_review",
        status: "ok",
        reference_id: reviewKey(r, ctx.locationName),
        message: `New GBP review (${r.starRating}) from ${r.reviewer?.displayName ?? "anonymous"}`,
        payload: {
          star_rating: parseStarRating(r.starRating),
          star_rating_raw: r.starRating,
          reviewer: r.reviewer?.displayName ?? null,
          comment_excerpt: r.comment ? r.comment.slice(0, 280) : null,
          create_time: r.createTime,
        },
      });
    }
  }

  await writeLog({
    job: "review_monitor",
    event_type: "tick_ok",
    status: "ok",
    payload: { fetched: reviews.length, new_reviews: fresh.length },
  });

  return { ran: true, fetched: reviews.length, new_reviews: fresh.length };
}

/* ═══════════════════════════════════════════════════════════════════
 * 3) Daily hours / services sync
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Translate the internal business_hours JSON shape:
 *   { tz, mon: { opens, closes } | { closed: true }, ... sun: ... }
 * into the GBP regularHours shape:
 *   { periods: [{ openDay, openTime: { hours, minutes }, closeDay, closeTime: { hours, minutes } }] }
 */
const DAY_MAP: Record<string, string> = {
  mon: "MONDAY",
  tue: "TUESDAY",
  wed: "WEDNESDAY",
  thu: "THURSDAY",
  fri: "FRIDAY",
  sat: "SATURDAY",
  sun: "SUNDAY",
};

function toGbpTime(hhmm: string): { hours: number; minutes: number } | null {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return { hours: h, minutes: m };
}

export function buildRegularHours(businessHours: any): unknown | undefined {
  if (!businessHours || typeof businessHours !== "object") return undefined;
  const periods: unknown[] = [];
  for (const [shortDay, gbpDay] of Object.entries(DAY_MAP)) {
    const day = businessHours[shortDay];
    if (!day || day.closed === true) continue;
    const opens = day.opens || day.open;
    const closes = day.closes || day.close;
    const openTime = toGbpTime(opens);
    const closeTime = toGbpTime(closes);
    if (!openTime || !closeTime) continue;
    periods.push({
      openDay: gbpDay,
      openTime,
      closeDay: gbpDay,
      closeTime,
    });
  }
  if (periods.length === 0) return undefined;
  return { periods };
}

export function buildSpecialHours(specialHours: any): unknown | undefined {
  if (!Array.isArray(specialHours) || specialHours.length === 0) return undefined;
  const periods: unknown[] = [];
  for (const entry of specialHours) {
    if (!entry || !entry.date) continue;
    const [y, m, d] = String(entry.date).split("-").map((s: string) => parseInt(s, 10));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) continue;
    const startDate = { year: y, month: m, day: d };
    if (entry.closed) {
      periods.push({ startDate, endDate: startDate, closed: true });
      continue;
    }
    const openTime = toGbpTime(entry.opens || entry.open);
    const closeTime = toGbpTime(entry.closes || entry.close);
    if (!openTime || !closeTime) continue;
    periods.push({
      startDate,
      endDate: startDate,
      openTime,
      closeTime,
      closed: false,
    });
  }
  if (periods.length === 0) return undefined;
  return { specialHourPeriods: periods };
}

export interface HoursSyncTickResult {
  ran: boolean;
  source_client_id?: number;
  patched_fields: string[];
  error?: string;
}

async function loadPrimaryClientHours(): Promise<{
  client_id: number;
  business_hours: any;
  special_hours: any;
} | null> {
  const overrideId = process.env.WFX_PRIMARY_CLIENT_ID
    ? parseInt(process.env.WFX_PRIMARY_CLIENT_ID, 10)
    : null;

  if (overrideId && Number.isFinite(overrideId)) {
    const rows = await db
      .select({
        id: clients.id,
        business_hours: clients.business_hours,
        special_hours: clients.special_hours,
      })
      .from(clients)
      .where(eq(clients.id, overrideId))
      .limit(1);
    if (rows.length === 0) return null;
    return {
      client_id: rows[0].id,
      business_hours: rows[0].business_hours,
      special_hours: rows[0].special_hours,
    };
  }

  // Fallback: lowest-id client row (typically the WeFixTrades-internal client).
  const rows = await db
    .select({
      id: clients.id,
      business_hours: clients.business_hours,
      special_hours: clients.special_hours,
    })
    .from(clients)
    .orderBy(asc(clients.id))
    .limit(1);
  if (rows.length === 0) return null;
  return {
    client_id: rows[0].id,
    business_hours: rows[0].business_hours,
    special_hours: rows[0].special_hours,
  };
}

export async function runHoursSyncTick(): Promise<HoursSyncTickResult> {
  const ctx = await resolveContext("hours_sync");
  if (!ctx) return { ran: false, patched_fields: [] };

  await writeLog({ job: "hours_sync", event_type: "tick_start" });

  const source = await loadPrimaryClientHours();
  if (!source) {
    await writeLog({
      job: "hours_sync",
      event_type: "tick_skipped",
      status: "noop",
      message: "No clients row found to source business_hours from",
    });
    return { ran: true, patched_fields: [] };
  }

  const regularHours = buildRegularHours(source.business_hours);
  const specialHours = buildSpecialHours(source.special_hours);

  const payload: Record<string, unknown> = {};
  if (regularHours !== undefined) payload.regularHours = regularHours;
  if (specialHours !== undefined) payload.specialHours = specialHours;

  if (Object.keys(payload).length === 0) {
    await writeLog({
      job: "hours_sync",
      event_type: "tick_skipped",
      status: "noop",
      reference_id: String(source.client_id),
      message: "Source client has no business_hours or special_hours to sync",
    });
    return { ran: true, source_client_id: source.client_id, patched_fields: [] };
  }

  const result = await patchLocationHours(ctx, payload as any);

  if (!result.ok) {
    log.error("hours_sync: patchLocationHours failed", {
      status: result.status,
      error: result.error,
    });
    await writeLog({
      job: "hours_sync",
      event_type: "api_error",
      status: "error",
      reference_id: String(source.client_id),
      http_status: result.status ?? null,
      message: result.error ?? "patchLocationHours failed",
    });
    return {
      ran: true,
      source_client_id: source.client_id,
      patched_fields: [],
      error: result.error,
    };
  }

  const patchedFields = Object.keys(payload);
  await writeLog({
    job: "hours_sync",
    event_type: "hours_patched",
    status: "ok",
    reference_id: String(source.client_id),
    http_status: result.status ?? null,
    message: `Patched ${patchedFields.join(", ")} on ${ctx.locationName}`,
    payload: { fields: patchedFields, location_name: ctx.locationName },
  });

  return {
    ran: true,
    source_client_id: source.client_id,
    patched_fields: patchedFields,
  };
}
