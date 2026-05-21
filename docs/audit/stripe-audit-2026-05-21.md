# Stripe infrastructure audit — Wave AU-1 (2026-05-21)

End-to-end audit of every Stripe surface in WeFixTrades. The question:
does money flow correctly from customer → WeFixTrades → product
fulfilment? Verdict: **PARTIAL ISSUES**. The core paths work, but
production is one missing env var away from rejecting every webhook,
and several smaller gaps either drop revenue context or silently swallow
payments.

The audit covers (1) pricing inventory + env mapping, (2) every checkout
endpoint, (3) the unified billing webhook + the separate Connect
webhook, (4) Stripe Connect payouts for QuoteQuick deposits / BookFlow
invoices, (5) a live-mode price reconciliation, (6) edge cases. Findings
are graded P0 (showstopper) → P3 (cosmetic). The PR that introduces this
doc applies the trivial fixes inline; everything else is deferred to
Alex with a recommended action.

---

## Verdict by surface

| Surface | Status | Notes |
|---|---|---|
| API Platform checkout (`portalApiKeysRoutes.ts`) | OK | 9/9 prices live + env-mapped, idempotent, sets `client_reference_id`, echoes metadata to subscription, loyalty pricing wired |
| QuoteQuick subscription checkout (`calculatorRoutes.ts`) | OK | Pro + Business prices live + env-mapped (Wave Q). Legacy Starter falls back to Pro. |
| QuoteQuick one-time install ($75) | FIXED inline | Webhook handler was missing — payment captured, no DB record. Added `handleQuoteQuickInstall`. Also unified the two env-var names (`STRIPE_QUOTEQUICK_INSTALL_PRICE` ↔ `STRIPE_PRICE_QQ_INSTALL`). |
| Service catalog checkout (`publicCheckoutRoutes.ts`, `portalRoutes.ts` `/portal/catalog`) | OK | Resolves price via catalog `stripe_price_id` → env fallback → 400 with copy. Handles bundle coupons + system-builder 7% (real Stripe coupons, not just UI). |
| BookFlow invoice + dispatch payment (`bookflowRoutes.ts`) | OK | Stripe Connect (`stripeAccount: …`), 2.9% platform fee, payment-intent metadata carries `pay_link_token`. |
| Booking deposit (`bookingRoutes.ts`) | OK | Stripe Connect, 0 application fee. Confirm step verifies `amount_total` matches `expected`. |
| Widget deposit, Wave R-2 (`widgetDepositRoutes.ts`) | OK | Stripe Connect via `transfer_data.destination`, capped $2.90 platform fee, pre-records pending row, webhook marks paid. |
| Chat-widget install ($79, `tradelineChatInstallRoutes.ts`) | OK | `STRIPE_CHAT_INSTALL_PRICE_ID` env-mapped to live $79 one-time price. Pro skips Stripe (free under Pro). |
| Billing webhook handlers (`stripeBillingRoutes.ts`) | OK with gaps | Verifies signature, refuses unverified in prod, handles 9 event types. **Missing: global event-ID dedupe table.** Per-row idempotency carries most paths but not all (see P2-3). |
| Connect webhook (`stripeRoutes.ts`) | OK | `account.updated` only — flags calculators if `charges_enabled=false`. |
| Customer portal | OK | Created by `setup-stripe.ts` with cancellation reasons + payment-method updates. |

---

## Gaps — severity-ranked

### P0 — Showstopper

**P0-1. `STRIPE_BILLING_WEBHOOK_SECRET` is NOT set in `wefixtrades/prd`.**
The handler at `server/routes/stripeBillingRoutes.ts:154-156` does:

```ts
} else if (process.env.NODE_ENV === "production") {
  // In production, refuse to process unverified webhooks
  return res.status(500).send("Webhook secret not configured");
}
```

In production this means: Stripe captures money, fires the webhook,
gets a 500 back, retries with exponential backoff for ~3 days, then
gives up. The customer's payment lands but **no subscription is
recorded, no service is provisioned, no portal account is created, no
receipt email is sent.** Stripe will keep retrying until the secret is
in place; rows will eventually catch up if Alex sets the secret within
the retry window. Beyond ~72 hours: silent revenue loss.

- Severity: P0
- Effort: 2 min (set value in Doppler `wefixtrades/prd`)
- Recommended: run `npx tsx scripts/setup-stripe.ts` against the live
  account — it will print the signing secret for the existing webhook
  endpoint. Paste into Doppler. Redeploy.

### P1 — Material gaps

**P1-1. Webhook idempotency relies on per-row checks; no global event-id
dedupe.** `handleCheckoutCompleted` is safe (checks `findClientServiceByServiceId`,
`findPendingPaymentForClientService`, `findPaymentByStripeSession`).
`handleInvoicePaid` is NOT (creates a fresh `client_payments` row each
time). If Stripe redelivers a paid invoice (which it will on transient
500s), we'll record duplicate $X renewal payments per delivery.

- Severity: P1
- Effort: ~2 hr (add `stripe_webhook_events` table keyed on event id,
  short-circuit at the top of the switch).
- Recommended: add the dedupe table now, before live launch traffic
  starts. Single source of truth = `client_payments.stripe_invoice_id`
  unique index is an alternative.

**P1-2. 55 active Stripe prices in the live account are NOT env-mapped.**
The 14 env-mapped prices cover API Platform (9), QQ subscription (4),
chat install (1). Everything else — TradeLine (6), ContentFlow (6 new +
3 stale), SocialSync (6), MapGuard (5), RankFlow (6), AdFlow (6),
ReputationShield (6, including stale "Scale" tier), WebCare (4),
WebFix (1), SiteLaunch (1), QQ Install (1), legacy QQ Starter+Pro (4) —
exists in Stripe but is wired only through `service_catalog.stripe_price_id`
or via the `STRIPE_TRADELINE_*` / `STRIPE_CONTENTFLOW_*` env-var
fallbacks declared in `publicCheckoutRoutes.ts:45-77` (which are unset
in `wefixtrades/prd`). Failure mode: if a customer hits the Stripe
checkout for one of these and the catalog row lacks `stripe_price_id`,
the response is `${svc.name} does not have a default price configured.
Please contact us.` — clean 400, no money lost, but the customer
abandons.

- Severity: P1
- Effort: 1 hr (either populate the env-var placeholders in Doppler, or
  ensure `service_catalog.stripe_price_id` is filled. Once-off DB query
  + paste.).
- Recommended: a one-shot script that takes the live-account price
  ids printed below and back-fills `service_catalog.stripe_price_id` +
  `service_catalog.stripe_yearly_price_id` per service id. Already
  partially done for some products — needs Alex to confirm the
  ContentFlow naming (two duplicate product sets exist — "ContentFlow™
  Agency" + "ContentFlow Agency" diff only by trademark glyph; archive
  one).

**P1-3. Stripe account has duplicate / stale products.** The product
list contains both `ContentFlow™ Agency` and `ContentFlow Agency` (and
similar for Studio + Creator) — same $99/$199 monthly prices, no idea
which one the catalog points at. Also `ReputationShield™ Scale`
($179/mo) is in the account but the current shared/pricing.ts has
"Premium" not "Scale" — naming drift. And the legacy QuoteQuick
"Starter" $49 + "Pro" $79 from the pre-Wave-Q two-tier era are still
active (Wave Q says Pro = $29, Business = $79; the $79 price is
correctly mapped to BUSINESS).

- Severity: P1 (risks charging the wrong price on a future catalog edit)
- Effort: 30 min (archive duplicates via dashboard or `prices.update({active: false})`)
- Recommended: deferred — manual cleanup by Alex in Stripe dashboard,
  after confirming each live subscription row's `stripe_price_id`
  doesn't point at one that's archived.

### P2 — Drops revenue context

**P2-1. `client_reference_id` is set on ONE checkout out of nine.**
Only `portalApiKeysRoutes.ts:361` sets `client_reference_id`. The other
eight rely on `metadata.crm_client_id` / `metadata.calculator_id` to
join back. Functional today, but `client_reference_id` is the canonical
Stripe field — without it, Stripe's own dashboards and CSV exports
can't link a session to our user. Also matters for Stripe Tax / Sigma
queries downstream.

- Severity: P2
- Effort: 5 min per route (~45 min total)
- Recommended: deferred — non-blocking, but worth adding before scale.

**P2-2. No HTTP rate-limit on `/api/public/checkout`.** A double-click
(or bot) will create two CRM client_services? No — `findClientServiceByServiceId`
is idempotent. But it WILL create two Stripe Checkout sessions and two
`client_payments` (pending) rows. The duplicate session is harmless
(only one can be paid; the other expires). The duplicate pending
payment row is cosmetic. Higher-volume failure mode: a malicious caller
could spam-create Stripe Customer objects (`stripe.customers.create`) —
each costs no money but pollutes the Stripe account.

- Severity: P2
- Effort: 15 min (add `express-rate-limit` to the route — 5 req/min/IP
  is plenty)
- Recommended: defer — current attack surface is low.

**P2-3. `quotequick_install` was missing webhook handler.**
**FIXED inline** in this PR. Was: customer paid $75, Stripe captured,
`success_url` redirected, but no DB record was created. Now records
an `install_paid` analytics event.

**P2-4. No tax handling.** Zero `automatic_tax` or `tax_id_collection`
on any checkout session. If WeFixTrades sells outside the US (the QQ
yearly discount language and the £-leaning copy suggests UK/AU intent),
GST/VAT/HST is NOT collected — the merchant of record absorbs it.
SiteLaunch's $1,197 to a Canadian buyer = $137 in unbilled HST.

- Severity: P2 (will become P1 if launching into VAT-strict markets)
- Effort: 1 hr (enable Stripe Tax on the account — UI checkbox; set
  `automatic_tax.enabled: true` on every session create; add tax IDs
  to each Stripe Product).
- Recommended: defer for US-only launch; surface for Alex's strategy
  call before international expansion.

### P3 — Cosmetic / docs

**P3-1. Misleading error: "Run sync-stripe.ts first" referenced a
nonexistent script.** **FIXED inline** — error now points to the actual
script that exists (`sync-api-platform-stripe-prices.ts`) or instructs
to set `stripe_price_id` on the catalog row.

**P3-2. `setup-stripe.ts` doc comment referenced wrong route path
(`/api/stripe-billing/webhook` instead of `/api/billing/webhook`).**
**FIXED inline** — also corrected env-var name for Connect webhook
secret (was `STRIPE_WEBHOOK_SECRET` in the comment, actually
`STRIPE_CONNECT_WEBHOOK_SECRET`).

**P3-3. Unhandled webhook events log nothing.** The default case in
the switch silently drops events. Means `checkout.session.expired`,
`customer.subscription.trial_will_end`, `invoice.finalized`,
`invoice.upcoming` all fire and disappear. Not lost-money, but a future
debugging headache.

- Severity: P3
- Effort: 5 min (`log.debug` in the default branch)
- Recommended: defer — micro-fix; only matters when investigating a
  specific event.

**P3-4. `customer_email` capture inconsistent.** Admin-initiated
checkout (`stripeBillingRoutes.ts:103`) sets `customer:` (existing
customer ID) but no `customer_email`. Public checkout sets `customer:`
only. Stripe pulls email from the Customer object, so this is
functionally fine, but a fallback `customer_email: client.contact_email`
would be more robust if the Customer object is ever stripped.

- Severity: P3
- Effort: 5 min

**P3-5. SiteLaunch "14-day free trial of TradeLine Starter +
QuoteQuick Pro" feature copy has no implementing code path.** Feature
bullet in `shared/pricing.ts:88` but no trial activation hook in the
SiteLaunch provisioning or webhook handlers. Either marketing copy is
aspirational, or the trial mechanism is unimplemented.

- Severity: P3 (legal/marketing risk if customers complain)
- Effort: TBD (depends on the design — Stripe `trial_period_days`
  on the line items, or manual two-week credit)
- Recommended: defer pending Alex's decision on whether to ship the
  trial or remove the feature bullet.

---

## Fixed inline in this PR

1. **Added `handleQuoteQuickInstall` webhook handler** — records
   `install_paid` event when a customer completes the $75 install
   checkout. Closes the silent revenue gap (P2-3).
2. **Unified the two QQ install env-var names** in `calculatorRoutes.ts`
   — accepts either `STRIPE_PRICE_QQ_INSTALL` or
   `STRIPE_QUOTEQUICK_INSTALL_PRICE` so Doppler can hold either name
   without breaking the route.
3. **Fixed misleading "Run sync-stripe.ts first" error** in
   `stripeBillingRoutes.ts` — now points to the real script
   (`sync-api-platform-stripe-prices.ts`) and explains the catalog
   `stripe_price_id` option (P3-1).
4. **Corrected `setup-stripe.ts` doc comment** — wrong webhook path +
   wrong env-var name in the prose (P3-2).

---

## Deferred for Alex

In rough priority order:

1. **(P0)** Set `STRIPE_BILLING_WEBHOOK_SECRET` in `wefixtrades/prd`
   Doppler. Re-run `npx tsx scripts/setup-stripe.ts` to retrieve the
   secret from the existing webhook endpoint, OR generate a new one in
   Stripe Dashboard.
2. **(P1-1)** Add `stripe_webhook_events` table for global event-id
   dedupe. ~2 hr.
3. **(P1-2)** Back-fill `service_catalog.stripe_price_id` for the 11
   products that exist in Stripe but aren't env-mapped. ~1 hr.
4. **(P1-3)** Archive duplicate ContentFlow products and stale
   ReputationShield Scale + QuoteQuick Starter/Pro legacy prices in
   Stripe Dashboard. ~30 min.
5. **(P2-2)** Add HTTP rate-limit to `/api/public/checkout`. ~15 min.
6. **(P2-4)** Decide on Stripe Tax for international expansion. ~1 hr
   when ready.
7. **(P2-1)** Add `client_reference_id` to remaining 8 checkout flows.
   ~45 min.
8. **(P3-5)** Implement (or remove copy for) the SiteLaunch trial bonus.

---

## Verification artifacts

Live-mode price reconciliation, run via:

```
doppler run --project wefixtrades --config prd -- node -e '<inline reconciler>'
```

Result: **14/14 env-mapped prices are active in LIVE mode.** 55 of 69
total active live prices are NOT referenced by any env var (mapped via
`service_catalog.stripe_price_id` instead, or unreferenced legacy).

Typecheck: `npx tsc --noEmit` clean against this PR.
