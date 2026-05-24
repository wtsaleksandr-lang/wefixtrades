/**
 * Per-client notification preferences enforcement.
 *
 * Senders MUST call `respectPreferences()` before invoking
 * `transporter.sendMail(...)` or `sendSMS(...)` for any non-transactional
 * message. If the helper returns `false`, the send must be skipped and
 * logged with the structured `[notify-skip]` tag so the audit script
 * (PR #702) can confirm preferences are honoured end-to-end.
 *
 * The schema and parser live in `shared/schemas/notificationPreferences.ts`.
 * That file owns category keys + defaults; this file is the enforcement
 * checkpoint.
 *
 * Transactional messages (password reset, login link, 2FA codes, account
 * lockout) MUST NEVER be gated. Use `isTransactionalCategory()` or simply
 * do not call the helper for those sends. See the TRANSACTIONAL_BYPASS
 * list below for the canonical inventory.
 */

import { db } from "../db";
import { clients } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  parseNotificationPreferences,
  type NotificationCategoryKey,
} from "@shared/schemas/notificationPreferences";
import { createLogger } from "./logger";

const log = createLogger("NotifyPrefs");

export type NotificationChannel = "email" | "sms";

/**
 * Category keys that bypass preference checks. These templates carry
 * security-sensitive or account-access content and MUST go through
 * regardless of the per-client opt-in state. CAN-SPAM / CASL both
 * exempt transactional mail from consent requirements.
 *
 * Update this list (not the schema) when a new transactional template
 * is added.
 */
export const TRANSACTIONAL_BYPASS = [
  "password_reset",       // password-reset link
  "login_link",           // magic-link sign-in
  "two_factor_code",      // 2FA / MFA codes
  "account_lockout",      // suspicious-login lockouts, reset confirmations
  "account_welcome",      // account-created confirmation (first send)
  "email_verification",   // address-verification link
  "security_alert",       // security incident notifications
] as const;

export type TransactionalCategory = (typeof TRANSACTIONAL_BYPASS)[number];

export function isTransactionalCategory(category: string): category is TransactionalCategory {
  return (TRANSACTIONAL_BYPASS as readonly string[]).includes(category);
}

/**
 * Returns `true` when the message is allowed to send under the client's
 * current notification preferences, `false` when it should be skipped.
 *
 * Behaviour:
 *   - Missing client / DB error → `true` (fail-open; we'd rather over-send
 *     than silently drop a payment-failed notice because metadata is
 *     malformed).
 *   - `clientId == null` → `true` (anonymous recipient — typically a lead
 *     follow-up or admin alert, neither of which is gated).
 *   - Channel disabled → `false`, logged as `[notify-skip] channel`.
 *   - Category disabled → `false`, logged as `[notify-skip] category`.
 *
 * Caller is expected to NOT invoke this for transactional sends. The
 * helper itself does not look at the bypass list — keeping the contract
 * explicit at the call site is safer than auto-overriding here.
 */
export async function respectPreferences(
  clientId: number | null | undefined,
  channel: NotificationChannel,
  category: NotificationCategoryKey,
): Promise<boolean> {
  if (clientId == null) return true;

  let client;
  try {
    [client] = await db
      .select({ metadata: clients.metadata })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
  } catch (err: any) {
    log.warn(`[notify-prefs] DB lookup failed for client #${clientId}: ${err?.message ?? err} — failing open`);
    return true;
  }

  if (!client) return true;

  const prefs = parseNotificationPreferences(client.metadata);

  if (!prefs.channels[channel]) {
    log.info(`[notify-skip] client=${clientId} channel=${channel} category=${category} reason=channel-disabled`);
    return false;
  }
  if (!prefs.categories[category]) {
    log.info(`[notify-skip] client=${clientId} channel=${channel} category=${category} reason=category-disabled`);
    return false;
  }

  return true;
}
