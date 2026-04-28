/**
 * ContentFlow Sprint 14 — calendar + control metadata helper.
 *
 * Adds a standardized `metadata.calendar` shape to every draft so the
 * admin calendar view, scheduling, pause/resume, and daily caps all
 * read from one place. NOT a new table — sits on existing
 * content_drafts.metadata jsonb column.
 *
 * Shape:
 *   metadata.calendar = {
 *     scheduled_for:    ISO string | null,
 *     channel:          "facebook" | "instagram" | "google_business"
 *                       | "email" | "wordpress",
 *     parent_draft_id?: number,
 *     auto_generated:   boolean,
 *     repurposed:       boolean,
 *     paused?:          boolean   // true while admin has paused publishing
 *   }
 *
 * Pause/resume + scheduled_for here are SOURCE OF TRUTH for the
 * publish queue. The legacy per-channel scheduled_for (e.g.
 * metadata.wordpress.scheduled_for) remains as a secondary gate so
 * older specs that wrote there still work.
 */

import { storage } from "../../storage";
import type { ContentDraft } from "@shared/schema";

export type CalendarChannel =
  | "facebook"
  | "instagram"
  | "google_business"
  | "email"
  | "wordpress";

export interface CalendarMetadata {
  scheduled_for: string | null;
  channel: CalendarChannel;
  parent_draft_id?: number;
  auto_generated: boolean;
  repurposed: boolean;
  paused?: boolean;
}

const CHANNEL_BY_TARGET: Record<string, CalendarChannel> = {
  facebook: "facebook",
  instagram: "instagram",
  google_business: "google_business",
  email: "email",
  website: "wordpress",
};

/* Sprint 14: max number of drafts that can publish per (client, channel)
 * inside any rolling 24-hour window. Caps are conservative; production
 * may tune via SocialSyncProfile-style overrides later. Email is high
 * because broadcasts are deliberate; wordpress is high because articles
 * are infrequent. */
export const MAX_PER_CHANNEL_PER_DAY: Record<CalendarChannel, number> = {
  facebook: 10,
  instagram: 10,
  google_business: 5,
  email: 5,
  wordpress: 10,
};

/** Resolve a calendar channel from a draft's target_platform. Returns null
 * for kinds that don't publish (e.g. caption, review_reply). */
export function channelForDraft(draft: ContentDraft): CalendarChannel | null {
  if (!draft.target_platform) {
    /* WordPress articles use kind=article, surface=rankflow but
     * target_platform is null in some legacy paths — fall back. */
    if (draft.kind === "article" && draft.surface === "rankflow") return "wordpress";
    return null;
  }
  const tp = draft.target_platform as keyof typeof CHANNEL_BY_TARGET;
  return CHANNEL_BY_TARGET[tp] ?? null;
}

/** Build the calendar metadata for a brand-new draft. */
export function buildCalendarMetadata(args: {
  channel: CalendarChannel;
  scheduled_for?: string | null;
  parent_draft_id?: number | null;
  auto_generated?: boolean;
  repurposed?: boolean;
}): CalendarMetadata {
  const meta: CalendarMetadata = {
    scheduled_for: args.scheduled_for ?? null,
    channel: args.channel,
    auto_generated: args.auto_generated ?? false,
    repurposed: args.repurposed ?? false,
    paused: false,
  };
  if (args.parent_draft_id != null) meta.parent_draft_id = args.parent_draft_id;
  return meta;
}

/** Read calendar metadata from a draft, falling back where possible.
 * Existing drafts (pre-Sprint-14) won't have metadata.calendar set —
 * we synthesize a best-effort view from per-channel + parent_draft_id. */
export function getCalendarMetadata(draft: ContentDraft): CalendarMetadata | null {
  const meta = (draft.metadata || {}) as Record<string, any>;
  const cal = meta.calendar as Partial<CalendarMetadata> | undefined;
  const channel = channelForDraft(draft);
  if (!channel) return null;
  if (cal && typeof cal === "object") {
    return {
      scheduled_for: typeof cal.scheduled_for === "string" ? cal.scheduled_for : null,
      channel: (cal.channel as CalendarChannel) ?? channel,
      parent_draft_id: typeof cal.parent_draft_id === "number" ? cal.parent_draft_id : undefined,
      auto_generated: cal.auto_generated === true,
      repurposed: cal.repurposed === true,
      paused: cal.paused === true,
    };
  }
  /* Legacy fallback: read per-channel scheduled_for + metadata.parent_draft_id. */
  const channelMeta = (meta[channel] || {}) as Record<string, any>;
  const fallbackScheduled =
    typeof channelMeta.scheduled_for === "string" ? channelMeta.scheduled_for : null;
  const parentId = typeof meta.parent_draft_id === "number" ? meta.parent_draft_id : undefined;
  return {
    scheduled_for: fallbackScheduled,
    channel,
    parent_draft_id: parentId,
    auto_generated: parentId != null,
    repurposed: parentId != null,
    paused: false,
  };
}

/** Race-protected merge into metadata.calendar — re-reads fresh draft,
 * shallow-merges patch into existing calendar sub-object, writes back.
 * Mirrors mergeWpMetadata / mergeChannelMetadata. */
export async function mergeCalendarMetadata(
  draftId: number,
  patch: Partial<CalendarMetadata>,
): Promise<void> {
  const fresh = await storage.getContentDraftById(draftId);
  if (!fresh) return;
  const meta = (fresh.metadata || {}) as Record<string, any>;
  const existing = (meta.calendar || {}) as Record<string, any>;
  await storage.updateContentDraft(draftId, {
    metadata: { ...meta, calendar: { ...existing, ...patch } },
  } as any);
}

/** Project a draft for the calendar view — clean, no raw metadata dump. */
export function projectDraftForCalendar(draft: ContentDraft): {
  id: number;
  client_id: number;
  kind: string;
  surface: string;
  target_platform: string | null;
  status: string;
  title: string | null;
  channel: CalendarChannel | null;
  scheduled_for: string | null;
  parent_draft_id?: number;
  auto_generated: boolean;
  repurposed: boolean;
  paused: boolean;
  created_at: Date | null;
} {
  const cal = getCalendarMetadata(draft);
  return {
    id: draft.id,
    client_id: draft.client_id,
    kind: draft.kind,
    surface: draft.surface,
    target_platform: draft.target_platform,
    status: draft.status,
    title: draft.title ?? null,
    channel: cal?.channel ?? channelForDraft(draft),
    scheduled_for: cal?.scheduled_for ?? null,
    parent_draft_id: cal?.parent_draft_id,
    auto_generated: cal?.auto_generated ?? false,
    repurposed: cal?.repurposed ?? false,
    paused: cal?.paused === true,
    created_at: (draft as any).created_at ?? null,
  };
}

/** Count drafts that successfully published in the last 24h for
 * (clientId, channel). Used by the daily cap guard.
 *
 * Channel → metadata-key mapping for the success marker:
 *   wordpress       → metadata.wordpress.published_at
 *   facebook        → metadata.facebook.posted_at
 *   instagram       → metadata.instagram.posted_at
 *   google_business → metadata.gbp_post.posted_at (from Sprint 12)
 *   email           → metadata.email.sent_at
 */
export async function countPublishedInLast24h(
  clientId: number,
  channel: CalendarChannel,
  windowMs: number = 24 * 60 * 60 * 1000,
): Promise<number> {
  const channelKey =
    channel === "google_business" ? "gbp_post"
    : channel === "wordpress" ? "wordpress"
    : channel;
  const stampKey =
    channel === "wordpress" ? "published_at"
    : channel === "email" ? "sent_at"
    : "posted_at";
  const since = new Date(Date.now() - windowMs).toISOString();
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  const result: any = await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM content_drafts
    WHERE client_id = ${clientId}
      AND status = 'published'
      AND metadata->${channelKey}::text->>${stampKey} IS NOT NULL
      AND (metadata->${channelKey}::text->>${stampKey})::timestamptz >= ${since}::timestamptz
  `);
  const rows: any[] = (result?.rows ?? result) as any[];
  return Array.isArray(rows) && rows.length > 0 ? Number(rows[0].n) : 0;
}
