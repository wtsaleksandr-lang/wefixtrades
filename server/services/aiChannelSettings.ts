/**
 * AI governance config (Phase 3a + 3b-iii).
 *
 * A single global config row holds two kinds of founder-controlled setting:
 *   - Per-channel kill switches — gate whether the AI responds on each
 *     customer-facing channel (chat / email / SMS / voice).
 *   - The default per-client AI budget — feeds the budget dial (aiBudget.ts),
 *     a model-selection control, never an off-switch.
 *
 * The read is FAIL-OPEN: any error — including the table not existing yet
 * (before `npm run db:push`) — yields all-enabled with the default budget, so
 * a missed migration degrades to normal operation rather than an outage. The
 * write fails loudly (an admin action; a clear error beats a silent no-op).
 */

import { db } from "../db";
import { eq } from "drizzle-orm";
import { aiChannelSettings } from "@shared/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("AiChannelSettings");

/** The single config row's primary key. */
const SETTINGS_ID = 1;

/** Default monthly AI budget per client when unset — $5.00. */
export const DEFAULT_AI_BUDGET_CENTS = 500;

export interface AiChannelFlags {
  chat_enabled: boolean;
  email_enabled: boolean;
  sms_enabled: boolean;
  voice_enabled: boolean;
}

/** Full AI governance config: channel kill switches plus the budget dial. */
export interface AiSettings extends AiChannelFlags {
  /** Founder-set monthly AI budget per client, in cents (Phase 3b-iii). */
  default_ai_budget_cents: number;
}

const DEFAULTS: AiSettings = {
  chat_enabled: true,
  email_enabled: true,
  sms_enabled: true,
  voice_enabled: true,
  default_ai_budget_cents: DEFAULT_AI_BUDGET_CENTS,
};

/** Read the AI settings. Fail-open: returns the defaults on any error. */
export async function getAiChannelSettings(): Promise<AiSettings> {
  try {
    const [row] = await db
      .select()
      .from(aiChannelSettings)
      .where(eq(aiChannelSettings.id, SETTINGS_ID))
      .limit(1);
    if (!row) return { ...DEFAULTS };
    return {
      chat_enabled: row.chat_enabled,
      email_enabled: row.email_enabled,
      sms_enabled: row.sms_enabled,
      voice_enabled: row.voice_enabled,
      default_ai_budget_cents: row.default_ai_budget_cents ?? DEFAULT_AI_BUDGET_CENTS,
    };
  } catch (err) {
    log.warn("getAiChannelSettings failed — defaulting to all-enabled", { error: String(err) });
    return { ...DEFAULTS };
  }
}

/** Update one or more settings. Upserts the singleton config row. */
export async function updateAiChannelSettings(
  patch: Partial<AiSettings>,
  updatedByUserId: number,
): Promise<AiSettings> {
  const next: AiSettings = { ...(await getAiChannelSettings()), ...patch };
  await db
    .insert(aiChannelSettings)
    .values({ id: SETTINGS_ID, ...next, updated_at: new Date(), updated_by: updatedByUserId })
    .onConflictDoUpdate({
      target: aiChannelSettings.id,
      set: { ...next, updated_at: new Date(), updated_by: updatedByUserId },
    });
  return next;
}
