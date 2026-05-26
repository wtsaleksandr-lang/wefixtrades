/**
 * Wave 32 — Universal notification dispatcher.
 *
 * Single fan-out entry point: any code that needs to alert a customer
 * calls `dispatchNotification(payload)`. The dispatcher:
 *
 *   1. Looks up the event in the central registry (validates product +
 *      event_key combo exists).
 *   2. Resolves the customer's per-channel opt-in from
 *      `clients.metadata.<product>_notifications` (Waves 27-31 are the
 *      source of truth) with registry defaults as fallback.
 *   3. Honors SMS opt-in master flag (`clients.metadata.sms_opt_in`).
 *   4. Honors quiet hours stored in
 *      `clients.metadata.notification_quiet_hours`.
 *   5. Skips duplicates per (customer, product, event, channel, day-bucket)
 *      for events marked `dedupePerDay`.
 *   6. Fans out via existing email orchestrator + Twilio SMS + web-push.
 *   7. Writes one `notification_log` row per attempt.
 *
 * All sends are best-effort. The dispatcher NEVER throws — failures are
 * logged and a failure row is recorded. This protects upstream business
 * logic from being blocked by notification plumbing.
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db";
import { clients } from "@shared/schema";
import {
  customerPushSubscriptions,
  notificationLog,
} from "@shared/schemas/notificationsUniversal";
import {
  findEvent,
  defaultChannelMap,
  type NotificationChannel,
  type NotificationProduct,
  PRODUCT_METADATA_KEY,
} from "@shared/notifications/eventRegistry";
import { createLogger } from "../../lib/logger";
import { sendEmailViaOrchestrator } from "../../lib/emailOrchestrator";
import { isTwilioConfigured, sendSMS } from "../../twilioClient";
import { sendWebPush } from "./webPush";

const log = createLogger("NotificationDispatcher");

export interface NotificationPayload {
  /** Internal clients.id (integer). */
  clientId: number;
  product: NotificationProduct;
  eventKey: string;
  /** Event-specific data. Keep small — surfaced in the push title/body. */
  data?: Record<string, unknown>;
  /** Optional pre-rendered email/push content. Falls back to defaults. */
  rendered?: {
    emailSubject?: string;
    emailHtml?: string;
    emailText?: string;
    smsBody?: string;
    pushTitle?: string;
    pushBody?: string;
    pushUrl?: string;
  };
}

export interface DispatchResult {
  attempted: NotificationChannel[];
  delivered: NotificationChannel[];
  skipped: Array<{ channel: NotificationChannel; reason: string }>;
  failed: Array<{ channel: NotificationChannel; error: string }>;
}

interface QuietHoursWindow {
  start: string;            // "22:00"
  end: string;              // "07:00"
  timezone: string;
}

function dayBucket(date = new Date()): string {
  // YYYY-MM-DD in UTC; idempotency key.
  return date.toISOString().slice(0, 10);
}

function parseChannelMap(
  raw: unknown,
  fallback: Record<NotificationChannel, boolean>,
): Record<NotificationChannel, boolean> {
  if (!raw || typeof raw !== "object") return fallback;
  const obj = raw as Record<string, unknown>;
  return {
    email: typeof obj.email === "boolean" ? obj.email : fallback.email,
    sms: typeof obj.sms === "boolean" ? obj.sms : fallback.sms,
    web_push: typeof obj.web_push === "boolean" ? obj.web_push : fallback.web_push,
  };
}

function getClientEnabledChannels(
  metadata: unknown,
  product: NotificationProduct,
  eventKey: string,
  registryDefault: Record<NotificationChannel, boolean>,
): Record<NotificationChannel, boolean> {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const blob = md[PRODUCT_METADATA_KEY[product]] as Record<string, unknown> | undefined;
  if (!blob || typeof blob !== "object") return registryDefault;
  return parseChannelMap(blob[eventKey], registryDefault);
}

function smsGloballyAllowed(metadata: unknown): boolean {
  const md = (metadata ?? {}) as Record<string, unknown>;
  return md?.sms_opt_in === true;
}

function readQuietHours(metadata: unknown): QuietHoursWindow | null {
  const md = (metadata ?? {}) as Record<string, unknown>;
  const raw = md.notification_quiet_hours as Record<string, unknown> | undefined;
  if (!raw) return null;
  const start = typeof raw.start === "string" ? raw.start : null;
  const end = typeof raw.end === "string" ? raw.end : null;
  const timezone =
    typeof raw.timezone === "string" ? raw.timezone : "America/New_York";
  if (!start || !end) return null;
  return { start, end, timezone };
}

/** Returns true if "now" in the customer's timezone is inside the window. */
function inQuietHours(window: QuietHoursWindow, now = new Date()): boolean {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: window.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
    const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
    const cur = parseInt(hh, 10) * 60 + parseInt(mm, 10);
    const [sh, sm] = window.start.split(":").map((s) => parseInt(s, 10));
    const [eh, em] = window.end.split(":").map((s) => parseInt(s, 10));
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (startMin === endMin) return false;
    if (startMin < endMin) return cur >= startMin && cur < endMin;
    // Wraps over midnight (e.g. 22:00 → 07:00).
    return cur >= startMin || cur < endMin;
  } catch {
    return false;
  }
}

async function alreadyDispatchedToday(
  clientId: number,
  product: NotificationProduct,
  eventKey: string,
  channel: NotificationChannel,
): Promise<boolean> {
  try {
    const [row] = await db
      .select({ id: notificationLog.id })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.client_id, clientId),
          eq(notificationLog.product, product),
          eq(notificationLog.event_key, eventKey),
          eq(notificationLog.channel, channel),
          eq(notificationLog.day_bucket, dayBucket()),
          eq(notificationLog.status, "sent"),
        ),
      )
      .limit(1);
    return !!row;
  } catch (err: any) {
    log.warn("idempotency check failed", err?.message ?? err);
    return false;
  }
}

async function recordLog(
  clientId: number,
  product: NotificationProduct,
  eventKey: string,
  channel: NotificationChannel,
  status: string,
  errorMessage?: string,
  payloadSummary?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(notificationLog).values({
      client_id: clientId,
      product,
      event_key: eventKey,
      channel,
      status,
      day_bucket: dayBucket(),
      payload_summary: payloadSummary ?? null,
      error_message: errorMessage ?? null,
    });
  } catch (err: any) {
    log.error("notification_log insert failed", err?.message ?? err);
  }
}

/**
 * Public entry point. Fans out a notification across enabled channels.
 * Never throws.
 */
export async function dispatchNotification(
  payload: NotificationPayload,
): Promise<DispatchResult> {
  const result: DispatchResult = {
    attempted: [],
    delivered: [],
    skipped: [],
    failed: [],
  };

  const event = findEvent(payload.product, payload.eventKey);
  if (!event) {
    log.warn(
      `unknown event ${payload.product}/${payload.eventKey} — dropping`,
    );
    return result;
  }

  let clientRow:
    | {
        id: number;
        contact_email: string | null;
        contact_phone: string | null;
        business_name: string;
        metadata: unknown;
      }
    | undefined;
  try {
    [clientRow] = await db
      .select({
        id: clients.id,
        contact_email: clients.contact_email,
        contact_phone: clients.contact_phone,
        business_name: clients.business_name,
        metadata: clients.metadata,
      })
      .from(clients)
      .where(eq(clients.id, payload.clientId))
      .limit(1);
  } catch (err: any) {
    log.error("client lookup failed", err?.message ?? err);
    return result;
  }
  if (!clientRow) {
    log.warn(`client ${payload.clientId} not found — dropping notification`);
    return result;
  }

  const defaults = defaultChannelMap(event);
  const enabled = getClientEnabledChannels(
    clientRow.metadata,
    payload.product,
    payload.eventKey,
    defaults,
  );
  const smsAllowed = smsGloballyAllowed(clientRow.metadata);
  const quietHours = readQuietHours(clientRow.metadata);
  const isQuiet = quietHours ? inQuietHours(quietHours) : false;

  // ── Email ─────────────────────────────────────────────────────────────
  if (enabled.email) {
    result.attempted.push("email");
    if (isQuiet && event.severity !== "critical") {
      result.skipped.push({ channel: "email", reason: "quiet_hours" });
      await recordLog(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "email",
        "skipped_quiet_hours",
      );
    } else if (event.dedupePerDay &&
      (await alreadyDispatchedToday(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "email",
      ))
    ) {
      result.skipped.push({ channel: "email", reason: "duplicate" });
      await recordLog(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "email",
        "skipped_duplicate",
      );
    } else if (!clientRow.contact_email) {
      result.skipped.push({ channel: "email", reason: "no_email_on_file" });
      await recordLog(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "email",
        "skipped_no_subscription",
      );
    } else {
      const subject =
        payload.rendered?.emailSubject ?? `[WeFixTrades] ${event.label}`;
      const text =
        payload.rendered?.emailText ??
        `${event.label}\n\n${event.description}`;
      try {
        await sendEmailViaOrchestrator({
          to: clientRow.contact_email,
          from: "alerts@wefixtrades.com",
          subject,
          text,
          html: payload.rendered?.emailHtml,
          category: "transactional",
        });
        result.delivered.push("email");
        await recordLog(
          clientRow.id,
          payload.product,
          payload.eventKey,
          "email",
          "sent",
        );
      } catch (err: any) {
        result.failed.push({ channel: "email", error: err?.message ?? "unknown" });
        await recordLog(
          clientRow.id,
          payload.product,
          payload.eventKey,
          "email",
          "failed",
          err?.message,
        );
      }
    }
  }

  // ── SMS ────────────────────────────────────────────────────────────────
  if (enabled.sms) {
    result.attempted.push("sms");
    if (!smsAllowed) {
      result.skipped.push({ channel: "sms", reason: "sms_opt_in_off" });
      await recordLog(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "sms",
        "skipped_opt_out",
      );
    } else if (!isTwilioConfigured()) {
      result.skipped.push({ channel: "sms", reason: "twilio_not_configured" });
      await recordLog(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "sms",
        "skipped_no_subscription",
      );
    } else if (!clientRow.contact_phone) {
      result.skipped.push({ channel: "sms", reason: "no_phone_on_file" });
      await recordLog(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "sms",
        "skipped_no_subscription",
      );
    } else if (isQuiet && event.severity !== "critical") {
      result.skipped.push({ channel: "sms", reason: "quiet_hours" });
      await recordLog(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "sms",
        "skipped_quiet_hours",
      );
    } else if (event.dedupePerDay &&
      (await alreadyDispatchedToday(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "sms",
      ))
    ) {
      result.skipped.push({ channel: "sms", reason: "duplicate" });
      await recordLog(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "sms",
        "skipped_duplicate",
      );
    } else {
      const body =
        payload.rendered?.smsBody ??
        `WeFixTrades: ${event.label}. ${event.description}`.slice(0, 320);
      try {
        await sendSMS(clientRow.contact_phone, body);
        result.delivered.push("sms");
        await recordLog(
          clientRow.id,
          payload.product,
          payload.eventKey,
          "sms",
          "sent",
        );
      } catch (err: any) {
        result.failed.push({ channel: "sms", error: err?.message ?? "unknown" });
        await recordLog(
          clientRow.id,
          payload.product,
          payload.eventKey,
          "sms",
          "failed",
          err?.message,
        );
      }
    }
  }

  // ── Web Push ──────────────────────────────────────────────────────────
  if (enabled.web_push) {
    result.attempted.push("web_push");
    if (isQuiet && event.severity !== "critical") {
      result.skipped.push({ channel: "web_push", reason: "quiet_hours" });
      await recordLog(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "web_push",
        "skipped_quiet_hours",
      );
    } else if (event.dedupePerDay &&
      (await alreadyDispatchedToday(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "web_push",
      ))
    ) {
      result.skipped.push({ channel: "web_push", reason: "duplicate" });
      await recordLog(
        clientRow.id,
        payload.product,
        payload.eventKey,
        "web_push",
        "skipped_duplicate",
      );
    } else {
      try {
        const subs = await db
          .select()
          .from(customerPushSubscriptions)
          .where(eq(customerPushSubscriptions.client_id, clientRow.id));
        if (subs.length === 0) {
          result.skipped.push({ channel: "web_push", reason: "no_subscription" });
          await recordLog(
            clientRow.id,
            payload.product,
            payload.eventKey,
            "web_push",
            "skipped_no_subscription",
          );
        } else {
          const title = payload.rendered?.pushTitle ?? event.label;
          const body = payload.rendered?.pushBody ?? event.description;
          const url = payload.rendered?.pushUrl ?? "/portal/dashboard";
          const fanout = await Promise.allSettled(
            subs.map((s) =>
              sendWebPush(
                {
                  endpoint: s.endpoint,
                  keys: { p256dh: s.p256dh_key, auth: s.auth_key },
                },
                { title, body, url, severity: event.severity },
              ),
            ),
          );
          const anyOk = fanout.some((r) => r.status === "fulfilled");
          if (anyOk) {
            result.delivered.push("web_push");
            await recordLog(
              clientRow.id,
              payload.product,
              payload.eventKey,
              "web_push",
              "sent",
            );
            // Refresh last_used_at for successful endpoints (best-effort).
            try {
              await db
                .update(customerPushSubscriptions)
                .set({ last_used_at: new Date() })
                .where(eq(customerPushSubscriptions.client_id, clientRow.id));
            } catch {
              /* non-fatal */
            }
          } else {
            const firstErr = fanout.find((r) => r.status === "rejected") as
              | PromiseRejectedResult
              | undefined;
            result.failed.push({
              channel: "web_push",
              error: firstErr?.reason?.message ?? "all_endpoints_failed",
            });
            await recordLog(
              clientRow.id,
              payload.product,
              payload.eventKey,
              "web_push",
              "failed",
              firstErr?.reason?.message ?? "all_endpoints_failed",
            );
          }
        }
      } catch (err: any) {
        result.failed.push({ channel: "web_push", error: err?.message ?? "unknown" });
        await recordLog(
          clientRow.id,
          payload.product,
          payload.eventKey,
          "web_push",
          "failed",
          err?.message,
        );
      }
    }
  }

  // Suppress unused warning when sql import is reserved for future use.
  void sql;
  return result;
}
