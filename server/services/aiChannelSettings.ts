/**
 * AI channel kill switches (Phase 3a).
 *
 * A single global config row gates whether the AI responds on each
 * customer-facing channel. The founder toggles these from the admin
 * Settings page.
 *
 * The read is FAIL-OPEN: any error — including the table not existing yet
 * (before `npm run db:push`) — yields all-enabled, so a missed migration
 * degrades to normal operation rather than an outage. The write fails
 * loudly (an admin action; a clear error is better than a silent no-op).
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import { aiChannelSettings } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("AiChannelSettings");

/** The single config row's primary key. */
const SETTINGS_ID = 1;

export interface AiChannelFlags {
  chat_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  voice_enabled: boolean;
}

const ALL_ENABLED: AiChannelFlags = {
  chat_enabled: true,
  email_enabled: true,
  sms_enabled: true,
  voice_enabled: true,
};

/** Read the channel flags. Fail-open: returns all-enabled on any error. */
export async function getAiChannelSettings(): Promise<AiChannelFlags> {
  try {
    const [row] = await db
      .select()
      .from(aiChannelSettings)
      .where(eq(aiChannelSettings.id, SETTINGS_ID))
      .limit(1);
    if (!row) return { ...ALL_ENABLED };
    return {
      chat_enabled: row.chat_enabled,
      email_enabled: row.email_enabled,
      sms_enabled: row.sms_enabled,
      voice_enabled: row.voice_enabled,
    };
  } catch (err) {
    log.warn("getAiChannelSettings failed — defaulting to all-enabled", { error: String(err) });
    return { ...ALL_ENABLED };
  }
}

/** Update one or more channel flags. Upserts the singleton config row. */
export async function updateAiChannelSettings(
  patch: Partial<AiChannelFlags>,
  updatedByUserId: number,
): Promise<AiChannelFlags> {
  const next: AiChannelFlags = { ...(await getAiChannelSettings()), ...patch };
  await db
    .insert(aiChannelSettings)
    .values({ id: SETTINGS_ID, ...next, updated_at: new Date(), updated_by: updatedByUserId })
    .onConflictDoUpdate({
      target: aiChannelSettings.id,
      set: { ...next, updated_at: new Date(), updated_by: updatedByUserId },
    });
  return next;
}
