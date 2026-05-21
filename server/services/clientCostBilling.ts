/**
 * Wave W-BA-2 (Phase 3b §5) — channel-cost ingestion helpers.
 *
 * Thin domain wrappers over `incrementVariableCost` that turn raw channel
 * units (SMS count, voice seconds, Stripe invoice cents) into the per-client
 * variable-cost ledger increments.
 *
 * Twilio US SMS list price ≈ $0.0079 per outbound → 1c rounded.
 * Vapi voice cost is dominated by per-minute transport + STT/TTS. We use a
 * conservative blended rate (10c per minute) until per-call cost lands in
 * the Vapi webhook payload — when it does, plumb the exact cents through.
 */
import { incrementVariableCost } from "./clientVariableCosts";

/** US Twilio outbound SMS — rounded up to 1c per segment. */
const SMS_CENTS_PER_SEGMENT = 1;

/** Conservative Vapi blended cost: $6/hr → 10c/minute. */
const VAPI_CENTS_PER_MINUTE = 10;

/** Record one outbound SMS for a client. `segments` defaults to 1. */
export async function recordSmsCostForClient(opts: {
  clientId: number;
  segments?: number;
}): Promise<void> {
  const segments = Math.max(1, opts.segments ?? 1);
  await incrementVariableCost({
    clientId: opts.clientId,
    kind: "sms",
    cents: segments * SMS_CENTS_PER_SEGMENT,
  });
}

/**
 * Record one Vapi call for a client. Accepts either an exact cost in cents
 * (preferred — when the webhook payload carries it) or a duration in
 * seconds (the fallback).
 */
export async function recordVoiceCostForClient(opts: {
  clientId: number;
  durationSeconds?: number;
  exactCents?: number;
}): Promise<void> {
  let cents = 0;
  if (opts.exactCents != null && opts.exactCents > 0) {
    cents = Math.round(opts.exactCents);
  } else if (opts.durationSeconds && opts.durationSeconds > 0) {
    cents = Math.ceil((opts.durationSeconds / 60) * VAPI_CENTS_PER_MINUTE);
  }
  if (cents <= 0) return;
  await incrementVariableCost({ clientId: opts.clientId, kind: "voice", cents });
}

/** Record revenue (Stripe invoice.amount_paid) for a client. */
export async function recordRevenueForClient(opts: {
  clientId: number;
  amountCents: number;
}): Promise<void> {
  if (!opts.amountCents || opts.amountCents <= 0) return;
  await incrementVariableCost({
    clientId: opts.clientId,
    kind: "revenue",
    cents: opts.amountCents,
  });
}
