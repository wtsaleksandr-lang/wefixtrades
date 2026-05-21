/**
 * Per-channel AI kill switch (W-BA-1, Phase 3a).
 *
 * The runtime emergency safety net the founder must have in hand BEFORE
 * autonomous responses go live. One row per customer-facing channel
 * ('email' | 'sms' | 'voice' | 'chat') in ai_channel_gates with rich audit
 * metadata (who flipped it, when, why).
 *
 *   const on = await aiChannelGateOn("email");
 *   if (!on) { /* send the auto-reply fallback, skip AI *\/ }
 *
 * Distinct from the older aiChannelSettings — both gates are evaluated; if
 * EITHER is OFF, the AI does not respond. This table's defaults are OFF
 * across the board so a missed admin toggle defaults to "no AI replies"
 * rather than "AI everywhere".
 *
 * Fail-CLOSED: unlike aiSystemGate, this gate fails CLOSED on infrastructure
 * error. The point of an emergency kill switch is that it errs on the side
 * of not responding — if we can't read the gate, we don't respond.
 */

import { db } from "../db";
import { aiChannelGates } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("AI:ChannelGate");

export const AI_CHANNEL_LIST = ["email", "sms", "voice", "chat"] as const;
export type AiChannel = (typeof AI_CHANNEL_LIST)[number];

export function isAiChannel(value: string): value is AiChannel {
  return (AI_CHANNEL_LIST as readonly string[]).includes(value);
}

/** Ensure a row exists for every known channel; safe to call repeatedly. */
async function ensureSeeded(): Promise<void> {
  for (const channel of AI_CHANNEL_LIST) {
    await db
      .insert(aiChannelGates)
      .values({ channel })
      .onConflictDoNothing();
  }
}

/**
 * Primary gate check — call BEFORE the AI responds on a channel.
 *
 * Returns true ONLY when the channel's row has enabled = true. Fails CLOSED
 * (returns false) on any infrastructure error — an emergency kill switch
 * must err on the side of not responding.
 */
export async function aiChannelGateOn(channel: AiChannel): Promise<boolean> {
  try {
    const [row] = await db
      .select({ enabled: aiChannelGates.enabled })
      .from(aiChannelGates)
      .where(eq(aiChannelGates.channel, channel))
      .limit(1);
    if (!row) return false; // row missing → treat as disabled
    return row.enabled === true;
  } catch (err: any) {
    log.warn("gate read failed — failing CLOSED", { channel, error: err?.message });
    return false;
  }
}

export interface ChannelGateRow {
  channel: string;
  enabled: boolean;
  emergency_disabled_by: number | null;
  emergency_disabled_at: Date | null;
  notes: string | null;
  updated_at: Date | null;
  updated_by: number | null;
  created_at: Date | null;
}

/** List every channel gate. Lazy-seeds any missing rows. */
export async function listAiChannelGates(): Promise<ChannelGateRow[]> {
  await ensureSeeded();
  const rows = await db.select().from(aiChannelGates);
  // Stable ordering: email → sms → voice → chat
  const order: Record<string, number> = { email: 0, sms: 1, voice: 2, chat: 3 };
  return rows
    .map((r) => ({
      channel: r.channel,
      enabled: r.enabled,
      emergency_disabled_by: r.emergency_disabled_by ?? null,
      emergency_disabled_at: r.emergency_disabled_at ?? null,
      notes: r.notes ?? null,
      updated_at: r.updated_at ?? null,
      updated_by: r.updated_by ?? null,
      created_at: r.created_at ?? null,
    }))
    .sort((a, b) => (order[a.channel] ?? 99) - (order[b.channel] ?? 99));
}

/**
 * Flip the gate for one channel. Recorded with audit metadata.
 *
 * When `enabled` is false, the row's emergency_disabled_{by,at} are set so
 * the admin UI can render "who disabled this and when". When `enabled` is
 * true, those fields are cleared.
 */
export async function setAiChannelGate(
  channel: AiChannel,
  enabled: boolean,
  userId: number,
  notes?: string,
): Promise<void> {
  await ensureSeeded();
  const now = new Date();
  await db
    .update(aiChannelGates)
    .set({
      enabled,
      emergency_disabled_by: enabled ? null : userId,
      emergency_disabled_at: enabled ? null : now,
      notes: typeof notes === "string" ? notes.slice(0, 500) : null,
      updated_at: now,
      updated_by: userId,
    })
    .where(eq(aiChannelGates.channel, channel));
  log.warn("channel gate toggled", { channel, enabled, userId });
}

/**
 * Emergency: disable AI on EVERY channel. One call, one audit reason.
 * Used by the "Emergency disable all" button in the admin UI.
 */
export async function emergencyDisableAllChannels(
  userId: number,
  notes?: string,
): Promise<void> {
  await ensureSeeded();
  const now = new Date();
  await db
    .update(aiChannelGates)
    .set({
      enabled: false,
      emergency_disabled_by: userId,
      emergency_disabled_at: now,
      notes: typeof notes === "string" ? notes.slice(0, 500) : "Emergency disable all",
      updated_at: now,
      updated_by: userId,
    });
  log.warn("EMERGENCY: all channel gates disabled", { userId });
}
