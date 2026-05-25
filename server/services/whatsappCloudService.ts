/**
 * Meta WhatsApp Cloud API service.
 *
 * Foundation for the `whatsapp_business_messaging` Meta scope (perm #5 of 5).
 * This module wraps the bits of the WhatsApp Cloud API we need to:
 *
 *   - Send a text message on behalf of a customer's WhatsApp Business phone
 *     number (POST https://graph.facebook.com/v20.0/{phone-number-id}/messages)
 *   - Verify the X-Hub-Signature-256 HMAC on inbound webhook deliveries
 *     (Meta signs the raw request body with the Meta App Secret — same
 *     pattern as `metaMessagingWebhookRoutes.ts` for Messenger)
 *
 * --- Meta Cloud API vs Twilio WhatsApp ---
 *
 * WeFixTrades supports TWO independent WhatsApp paths and customers pick
 * which one fits their setup:
 *
 *   1. Twilio WhatsApp (existing). Uses the WhatsApp Business number Twilio
 *      provisions for the WeFixTrades account, configured via
 *      `TWILIO_WHATSAPP_NUMBER` and the Twilio REST API. Good for customers
 *      who don't have their own Meta WhatsApp Business account and just want
 *      WeFixTrades-branded outbound messages.
 *
 *   2. Meta WhatsApp Cloud API (this module). Talks to Meta directly using
 *      the customer's own WhatsApp Business phone-number id + access token,
 *      which the customer grants by completing the Meta OAuth flow with the
 *      `whatsapp_business_messaging` scope. Good for customers who already
 *      run a WhatsApp Business account with their own branding and want
 *      inbound + outbound to flow through it.
 *
 * Both can coexist. There is no automatic migration between them — the
 * customer-facing setting in the portal decides which path a given
 * outbound message uses.
 *
 * --- 24-hour customer-care window ---
 *
 * Meta only allows free-form text replies inside the 24-hour window that
 * starts when the customer last messaged the business. Outbound messages
 * outside that window must use a pre-approved template. Template support
 * is intentionally NOT in this foundation PR; `sendWhatsappMessage()`
 * sends `type: "text"` only and will surface Meta's `(#131047)` /
 * "re-engagement message" error verbatim when called outside the window.
 *
 * Env vars consumed:
 *   FACEBOOK_APP_SECRET (or FACEBOOK_OAUTH_CLIENT_SECRET) — used by the
 *     webhook signature verifier. Same Meta App as the existing Messenger
 *     webhook, so no new secret is required.
 *
 * No env var is needed for the phone-number id or access token — those
 * are per-customer values supplied by the caller at send time.
 */

import { fetchWithRetry } from "../lib/httpRetry";
import { createLogger } from "../lib/logger";

const log = createLogger("WhatsappCloudService");

const GRAPH_API_BASE = "https://graph.facebook.com/v20.0";

/* ─── Outbound: send text message ─── */

export interface SendWhatsappMessageInput {
  /** WhatsApp Business phone-number id (NOT the E.164 number itself). */
  phoneNumberId: string;
  /** Per-customer WhatsApp Business access token. */
  accessToken: string;
  /** Recipient phone number in E.164 (e.g. "+447700900123"). */
  to: string;
  /** Message kind — only "text" is supported in this foundation PR. */
  type: "text";
  /** Message body text (max 4096 chars per Meta). */
  text: string;
}

export interface SendWhatsappMessageResult {
  message_id: string | null;
  /** Recipient as Meta echoes it back (after E.164 normalisation). */
  wa_id: string | null;
  meta_response: unknown;
}

/**
 * Send a single text WhatsApp message via Meta's Cloud API.
 *
 * Calls POST /{phone-number-id}/messages with `messaging_product: "whatsapp"`
 * and `type: "text"`. Meta returns `{ messaging_product, contacts: [...],
 * messages: [{ id }] }` on success — we flatten that into a friendlier
 * `{ message_id, wa_id, meta_response }` shape for the caller's audit log.
 *
 * Failures surface Meta's upstream error message verbatim so the portal
 * UI can display it (e.g. the 24h-window violation, invalid phone number,
 * disabled account).
 */
export async function sendWhatsappMessage(
  input: SendWhatsappMessageInput,
): Promise<SendWhatsappMessageResult> {
  if (!input.phoneNumberId) throw new Error("phoneNumberId required");
  if (!input.accessToken) throw new Error("accessToken required");
  if (!input.to) throw new Error("to required");
  if (input.type !== "text") throw new Error(`Unsupported type: ${input.type}`);
  if (!input.text || !input.text.trim()) throw new Error("text required");
  if (input.text.length > 4096) throw new Error("text exceeds 4096 chars");

  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to,
    type: "text",
    text: { body: input.text },
  };

  const url = `${GRAPH_API_BASE}/${encodeURIComponent(input.phoneNumberId)}/messages`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message =
      (err as any)?.error?.message ||
      (err as any)?.error?.error_user_msg ||
      res.statusText ||
      "Unknown Meta error";
    log.warn("WhatsApp Cloud send failed", {
      status: res.status,
      message,
      phoneNumberId: input.phoneNumberId,
    });
    throw new Error(`Failed to send WhatsApp message: ${message}`);
  }

  const data = (await res.json().catch(() => ({}))) as any;
  const firstMessage = Array.isArray(data.messages) ? data.messages[0] : null;
  const firstContact = Array.isArray(data.contacts) ? data.contacts[0] : null;

  return {
    message_id: firstMessage?.id ? String(firstMessage.id) : null,
    wa_id: firstContact?.wa_id ? String(firstContact.wa_id) : null,
    meta_response: data,
  };
}

/* ─── Inbound: webhook signature verification ─── */

/**
 * Verify the X-Hub-Signature-256 header on an inbound WhatsApp webhook
 * delivery.
 *
 * Meta signs the raw request body with HMAC-SHA256 using the Meta App
 * Secret and sends the hex digest in the header as `sha256=...`. This is
 * the SAME signing scheme used for Messenger webhooks — we keep this
 * helper local to the WhatsApp service (rather than reusing the Messenger
 * one) so the two channels can evolve independently if Meta ever splits
 * the signing key per channel.
 *
 * Uses crypto.timingSafeEqual to avoid leaking byte-by-byte timing
 * information. Returns false on any input mismatch (wrong prefix, length
 * mismatch, missing app secret) rather than throwing — the webhook route
 * translates a `false` return into a 401.
 */
export function verifyWhatsappWebhookSignature(
  rawBody: Buffer | string,
  headerSignature: string | null | undefined,
  appSecret: string | null | undefined,
): boolean {
  if (!headerSignature || typeof headerSignature !== "string") return false;
  if (!appSecret) return false;

  const expectedPrefix = "sha256=";
  if (!headerSignature.startsWith(expectedPrefix)) return false;
  const providedHex = headerSignature.slice(expectedPrefix.length);

  // Lazy require to keep crypto out of the module-load path for tests
  // that stub fetch but not crypto.
  const { createHmac, timingSafeEqual } = require("crypto") as typeof import("crypto");
  const bodyBuf =
    typeof rawBody === "string" ? Buffer.from(rawBody, "utf-8") : rawBody;
  const expectedHex = createHmac("sha256", appSecret).update(bodyBuf).digest("hex");

  if (providedHex.length !== expectedHex.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(providedHex, "hex"),
      Buffer.from(expectedHex, "hex"),
    );
  } catch {
    return false;
  }
}
