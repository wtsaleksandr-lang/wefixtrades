# Stripe billing overhaul — WIP, parked

These three verification scripts were written by an earlier session against
behaviors that **do not yet exist** in `server/routes/stripeBillingRoutes.ts`.
They're parked here so they're not lost when the work is picked up. **Do not
run them yet — they will fail because the code under test is missing.**

This is the test-side half of work that maps to the existing roadmap item:

> Stripe billing wiring (when ready to charge)

Pick this up when the project is actually ready to start collecting payments.

---

## Gap analysis — what's missing in `server/routes/stripeBillingRoutes.ts`

| Verification script asserts | Status in codebase |
|---|---|
| `processed_stripe_events` idempotency table exists | ❌ No table in `shared/schemas/`. No migration. |
| `migrations/0002_processed_stripe_events.sql` | ❌ Only `0001_contentflow.sql` exists. |
| Idempotency wrapping around webhook handlers (insert-then-skip-if-duplicate) | ❌ No idempotency layer anywhere in the webhook switch. |
| `payment_intent.payment_failed` event handler | ❌ Only `invoice.payment_failed` exists. |
| `charge.refunded` event handler | ❌ Missing entirely. |
| Refund row creation (`type='refund'`, negative `amount_cents`) | ❌ No `createRefund` storage method. No `'refund'` literal anywhere in storage/routes. |
| Subscription metadata persistence on checkout (full set the script expects) | ⚠️ Partial — needs verification it matches what the script reads back. |
| Pending → active flip via webhook | ⚠️ Exists for the new-checkout flow (`provisionOrConfirmService`); the script may test a different specific transition. Re-read before re-running. |

---

## What needs to land before these scripts pass

### 1. Schema + migration

- New table: `processed_stripe_events` with columns:
  ```
  stripe_event_id    text primary key
  event_type         text not null
  processed_at       timestamptz not null default now()
  ```
- Index `idx_processed_stripe_events_processed_at` on `processed_at`
- New migration file: `migrations/0002_processed_stripe_events.sql`
- Drizzle schema export in `shared/schemas/` so `processedStripeEvents` is importable

### 2. Idempotency wrapping

In `stripeBillingRoutes.ts` webhook handler, **before** the `switch (event.type)`:

```ts
const existing = await db
  .select()
  .from(processedStripeEvents)
  .where(eq(processedStripeEvents.stripe_event_id, event.id))
  .limit(1);

if (existing.length > 0) {
  return res.json({ received: true, duplicate: true });
}
```

**After** the switch (and only on success):

```ts
await db.insert(processedStripeEvents).values({
  stripe_event_id: event.id,
  event_type: event.type,
});
```

Failure path must not insert (so retries can succeed).

### 3. New event handlers

Add cases to the webhook switch:

#### `charge.refunded`

- Look up the original `client_payment` row by `stripe_payment_intent_id` (charge's `payment_intent` field) or `stripe_charge_id` if you persist that
- Insert a new row with:
  - `type: 'refund'`
  - `amount_cents: -refund.amount` (negative)
  - `status: 'paid'` (the refund itself is "completed")
  - `stripe_charge_id: charge.id`
  - `description: 'Refund'`
- If the refund is **full** (`charge.amount_refunded === charge.amount`) AND the linked `client_service` is `active monthly`:
  - flip `client_service.status → 'cancelled'`, set `cancelled_at = now()`
- If **partial** refund: leave service status untouched
- Log to `admin_activity_log` (`action: 'service.refunded'`)

#### `payment_intent.payment_failed`

- If `pi.invoice` is set → no-op (subscription path is handled by `invoice.payment_failed` already)
- Else find the matching `client_payments` row by `stripe_payment_intent_id`:
  - Found → flip its `status → 'failed'`, set `metadata.failure_message` from `pi.last_payment_error?.message`
  - Not found → log a warning, no-op (orphan PI; common when test events fire against staging)
- No service status changes here (failed initial payment ≠ active service)

### 4. Storage methods

Likely needed:

- `findClientPaymentByStripePaymentIntent(piId: string): Promise<ClientPayment | null>`
- `findClientPaymentByStripeChargeId(chargeId: string): Promise<ClientPayment | null>` (or equivalent — depends on whether you persist charge ID)
- `markClientPaymentFailed(paymentId: number, failureMessage: string)` — or just reuse `updateClientPayment` with the patch

(`createClientPayment` already supports `type` so refund rows can use the existing method.)

---

## How to run these scripts (when the code lands)

All three scripts are designed to be **safe** — they refuse to run in production,
use synthetic Stripe IDs only, never call the Stripe API beyond local crypto,
clean up every row they insert in a `finally` block, and use `phase{1,2}-test.invalid`
emails so any SMTP delivery bounces.

```bash
# Set env first — must match the running server's Stripe webhook secret
export DATABASE_URL=postgresql://...
export STRIPE_BILLING_WEBHOOK_SECRET=whsec_...
export SERVER_URL=http://127.0.0.1:5000   # optional, this is the default

# Phase 1 — idempotency table + checkout completion + pending→active
npx tsx docs/wip/stripe-billing-overhaul/verify-phase1-real-db.ts

# Phase 2 — charge.refunded + payment_intent.payment_failed (real DB)
npx tsx docs/wip/stripe-billing-overhaul/verify-phase2-real-db.ts

# Phase 2 — same coverage but self-contained (in-memory storage stubs, no DB)
# Useful as a quick local sanity check before running the real-DB version.
npx tsx docs/wip/stripe-billing-overhaul/verify-phase2-safety.ts
```

Each script prints a `N passed, M failed` summary and exits non-zero on any failure.

---

## Why this is parked, not deleted

The verification scripts are ~37KB of structured assertion code (idempotency,
replay protection, refund shape, status transitions). When the billing overhaul
is picked up, having these tests already written cuts the implementation work
in half — they double as a spec for what the handlers must do.

The path-of-least-regret is: implement the missing code per the gap analysis
above, move these scripts back to `scripts/`, run them against the real DB,
ship.

---

**Last updated:** 2026-05-08 (parked at this revision; gap analysis verified
against `server/routes/stripeBillingRoutes.ts` at the same date).
