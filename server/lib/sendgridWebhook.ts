/**
 * SendGrid Event Webhook — signature verification + event classification.
 *
 * Spec: https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
 *
 * SendGrid signs each webhook delivery with ECDSA over
 *   sha256(timestamp + rawBody)
 * and includes two headers:
 *   X-Twilio-Email-Event-Webhook-Signature   (base64 ECDSA-SHA256 signature)
 *   X-Twilio-Email-Event-Webhook-Timestamp   (unix seconds)
 *
 * The public key is provided in the SendGrid dashboard (Mail Settings →
 * Event Webhook → "Verification"). Set it in env as the literal PEM
 * string OR the base64-encoded raw EC point that SendGrid surfaces; this
 * module accepts both forms.
 *
 * Event types we suppress on:
 *   bounce         → hard bounce (mailbox does not exist or perm-rejected)
 *   dropped        → SendGrid dropped before send (usually prior bounce history)
 *   spamreport     → recipient marked as spam — never email again
 *   unsubscribe    → recipient hit SendGrid's unsubscribe link
 *   group_unsubscribe → same for a SendGrid unsubscribe group
 *
 * We deliberately do NOT auto-suppress on:
 *   blocked    → may be transient policy issue; logged for ops review
 *   deferred   → soft bounce (temporary); SendGrid will retry
 *   delivered / open / click / processed → no-op (engagement signal only)
 */

import crypto from "crypto";

export const SUPPRESSING_EVENTS = new Set([
  "bounce",
  "dropped",
  "spamreport",
  "unsubscribe",
  "group_unsubscribe",
]);

export interface SendGridEvent {
  event: string;
  email: string;
  timestamp: number;
  sg_event_id?: string;
  sg_message_id?: string;
  type?: string;
  reason?: string;
  status?: string;
  [key: string]: unknown;
}

/**
 * Wrap a raw base64 EC public key in PEM if needed.
 * Accepts either:
 *   - a full PEM (`-----BEGIN PUBLIC KEY-----\n...`)
 *   - a base64 raw key (the form SendGrid surfaces in the dashboard).
 */
function normalizePublicKey(input: string): string {
  const trimmed = input.trim();
  if (trimmed.includes("BEGIN PUBLIC KEY")) return trimmed;
  // Wrap in PEM. SendGrid uses prime256v1; the base64 is a raw SPKI.
  return `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----`;
}

/**
 * Verify the SendGrid Event Webhook signature.
 *
 * @param publicKey  Either a PEM or the base64 raw key from SendGrid's dashboard.
 * @param rawBody    Raw request body as received (Buffer or string).
 * @param signature  Value of X-Twilio-Email-Event-Webhook-Signature header (base64).
 * @param timestamp  Value of X-Twilio-Email-Event-Webhook-Timestamp header.
 * @returns          true if the signature is valid for (timestamp + rawBody).
 */
export function verifySendgridSignature(
  publicKey: string,
  rawBody: Buffer | string,
  signature: string,
  timestamp: string,
): boolean {
  if (!publicKey || !signature || !timestamp) return false;
  try {
    const pem = normalizePublicKey(publicKey);
    const verifier = crypto.createVerify("SHA256");
    verifier.update(timestamp);
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(pem, signature, "base64");
  } catch {
    // Malformed key, malformed signature, anything — fail closed.
    return false;
  }
}

/**
 * Classify a single event from the webhook payload.
 *   - `suppress`  → call recordUnsubscribe with the email
 *   - `monitor`   → log for ops but do nothing automatic (blocked / deferred)
 *   - `ignore`    → benign engagement signal (delivered / open / click / etc.)
 */
export function classifyEvent(ev: SendGridEvent): "suppress" | "monitor" | "ignore" {
  if (!ev?.event) return "ignore";
  if (SUPPRESSING_EVENTS.has(ev.event)) return "suppress";
  if (ev.event === "blocked" || ev.event === "deferred") return "monitor";
  return "ignore";
}
