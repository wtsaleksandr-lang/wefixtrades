# Stripe account hygiene audit — 2026-05-24

Lightweight, read-only sweep of the live Stripe account against the
canonical pricing data in `shared/pricing.ts`. Companion to the deeper
Wave AU-1 audit (`docs/audit/stripe-audit-2026-05-21.md`); this run
checks whether the 2026-05-21 dashboard-cleanup recommendations were
applied and whether any new drift has crept in.

**Verdict: HEALTHY with known carryover.** Webhook plumbing, env-mapped
prices, and key plumbing are all clean. The product/price drift flagged
on 2026-05-21 is still present (Alex's manual dashboard task); no new
issues introduced. No revenue impact pre-launch (0 active subs, 0
charges in the trailing 30 days).

---

## Checklist results

| Check | Result | Notes |
|---|---|---|
| 1. Active products vs `shared/pricing.ts` | DRIFT (carryover) | 42 active products in Stripe. 6 are duplicates / stale (P1 below). |
| 2. Active prices env-mapped | OK | 17 Doppler `STRIPE_..._PRICE` vars all resolve to live `price_*` IDs. 69 active prices total — the remaining 52 are wired via `service_catalog.stripe_price_id` per the Wave AU-1 plan. |
| 3. Coupons | OK | 0 coupons in the account. (QuoteQuick Business advertises "Coupon codes + promotions" — see P2-1 below; feature is unimplemented at the Stripe layer.) |
| 4. Webhook endpoints | OK | 2 endpoints, both `enabled`, both `livemode=true`. One billing + one Connect — both legitimate; the audit checklist's "exactly ONE" assumption was outdated. |
| 5. Recent deliveries (last 7d) | OK | 94 events, **0 with `pending_webhooks > 0`**, **0 with `delivery_success=false`**. Mostly admin product/price churn from the 2026-05-21 audit cleanup. One real customer event (`customer.created` + `checkout.session.expired`). |
| 6. Test-mode artifacts in live | OK | 0 prices and 0 products with `livemode=false`. Clean separation. |
| 7. Customer count + churn | OK | **94 customers, 0 active subscriptions, 0 canceled subscriptions, 0 charges in the last 30 days.** Pre-launch state — counts will only matter post-launch. |

---

## Findings

### P1 — Carryover from 2026-05-21, still not actioned

**P1-1. Duplicate ContentFlow products.** Two parallel product sets
exist in Stripe (flagged in `stripe-audit-2026-05-21.md` §P1-3):

- `prod_UWUe…` — "ContentFlow™ Creator / Studio / Agency" (with
  trademark glyph). Each has monthly + annual prices.
- `prod_UW7K…` — "ContentFlow Creator / Studio / Agency" (no
  trademark glyph). Each has **monthly only** — no annual prices.

The trademarked set is the canonical one (matches `shared/pricing.ts`
formatting and has the annual prices wired via the standard Wave AU-1
sync). The non-trademarked set is the older sync run and is now
orphaned. Risk: a future `service_catalog.stripe_price_id` edit could
accidentally point at the orphan; on annual checkout the lookup would
silently fall back to the monthly price.

- Severity: P1
- Action: Alex — archive the 3 non-trademarked products
  (`prod_UW7KZHhsLcykTc`, `prod_UW7KLt5uhQkpER`, `prod_UW7KxpQ11HR1vk`)
  and their 3 monthly prices in the Stripe Dashboard. ~5 min.

**P1-2. ReputationShield "Scale" product name does not match
`shared/pricing.ts`.** `shared/pricing.ts:382` defines the
`$179/mo` tier as `reputationshield-premium` with display name
"Premium". The corresponding Stripe product
(`prod_UOZ3aHXPO5ZKOh`) is named **"ReputationShield™ Scale"**.
Price amounts match ($179/mo, $1,933.20/yr) so checkout works, but
the customer-facing Stripe receipt and the Customer Portal will say
"Scale" while every WeFixTrades surface says "Premium".

- Severity: P1 (customer-confusion + portal-mismatch on renewal)
- Action: Alex — rename the Stripe product to "ReputationShield™
  Premium" in the dashboard (Product → Edit name). No price-ID change;
  no env-var change. ~2 min.

**P1-3. Legacy QuoteQuick prices on the active Pro tier.** Wave Q
restructured QuoteQuick to Free / $29 Pro / $79 Business
(`shared/pricing.ts:160-242`). The Pro product (`prod_UOZ3pnrSGhhZoC`)
has **4 active prices**:

- `price_1TZGl5…` $29/mo — current Wave Q Pro (env-mapped to `STRIPE_PRICE_QQ_PRO_MONTHLY`)
- `price_1TZGl5…` $290/yr — current Wave Q Pro (env-mapped to `STRIPE_PRICE_QQ_PRO_ANNUAL`)
- `price_1TPlv2…` $79/mo — **legacy pre-Wave-Q Pro, no env mapping, still active**
- `price_1TPlv2…` $853.20/yr — **legacy pre-Wave-Q Pro, no env mapping, still active**

Risk: a customer who lands on an old Stripe Payment Link or a stale
admin-generated checkout URL pre-dating Wave Q could be charged the
old $79 instead of $29. Acceptable workaround for any
grandfathered subs (none exist — 0 active subs in the account), so
safe to archive.

- Severity: P1
- Action: Alex — archive the two legacy prices in the Stripe Dashboard:
  `price_1TPlv2FWY4wju6Qi3OFAQj5e` ($79/mo) and `price_1TPlv2FWY4wju6QiMY63j3D2` ($853.20/yr). ~2 min.

**P1-4. Legacy QuoteQuick "Starter" product still active and
env-mapped.** `prod_UOZ3Uwbjhce2DD` "QuoteQuick™ Starter" with $49/mo
+ $529.20/yr prices is the retired Wave Q tier (see comment at
`shared/pricing.ts:766` calling it out as "Legacy — retained for
backward compatibility"). It's still env-mapped via
`STRIPE_PRICE_QQ_SOLO_MONTHLY` + `STRIPE_PRICE_QQ_SOLO_ANNUAL`
(historic "SOLO" naming). No customers on it (0 active subs).

- Severity: P1
- Action: Alex — archive product `prod_UOZ3Uwbjhce2DD` and its two
  prices in Stripe Dashboard; then have a follow-up PR remove the two
  unused Doppler vars. ~5 min. Defer removal of the Doppler vars until
  the code-side fallback in `calculatorRoutes.ts` is also dropped (the
  fallback intentionally routes legacy "starter" requests → Pro per the
  Wave AU-1 audit).

### P2 — Drops feature parity / unused config

**P2-1. QuoteQuick Business "Coupon codes + promotions" feature copy
has no implementing Stripe artifacts.** `shared/pricing.ts:217` lists
"Coupon codes + promotions" as a Business-tier bullet, but the Stripe
account has **0 coupons** and no promotion-codes wiring in any of the
checkout route files. Either the feature is post-launch ("coming
soon") or marketing copy is aspirational.

- Severity: P2 (legal/marketing risk if a paying Business customer
  asks where to add their promo)
- Action: Alex — decide whether to (a) ship the feature pre-launch
  (~half day, since it needs both Stripe Promotion Codes API + a
  portal UI), or (b) drop the bullet from the pricing tier copy.

**P2-2. Orphan Doppler vars: `STRIPE_API_KEY` and `STRIPE_WEBHOOK`.**
Doppler `wefixtrades/prd` has both:

- `STRIPE_API_KEY` (107 chars, identical to `STRIPE_SECRET_KEY`)
- `STRIPE_WEBHOOK` (38 chars, no `_SECRET` suffix)

Neither name is referenced anywhere in the codebase
(`grep STRIPE_API_KEY` / `grep STRIPE_WEBHOOK\b` → 0 matches). The
canonical names are `STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`,
and `STRIPE_CONNECT_WEBHOOK_SECRET` (all referenced across 20 files).

The orphans are harmless today but they're (1) a rotation hazard —
rotating `STRIPE_SECRET_KEY` without `STRIPE_API_KEY` leaves a stale
copy of the old key in Doppler, and (2) confusing for future
contributors who see two key vars and don't know which is canonical.

- Severity: P2
- Action: secrets-rotator subagent — delete both orphan vars from
  Doppler `wefixtrades/prd`. ~1 min. Verify no `dev`/`stg` config
  depends on them first.

**P2-3. Webhook endpoints pinned to mismatched Stripe API versions.**
The billing endpoint uses `2025-12-15.clover`; the Connect endpoint
uses `2024-12-18.acacia`. Both are valid current versions, but the
~12-month gap means object shapes (especially on `account.updated` vs
`customer.subscription.*`) may differ from what the handler code
expects. Low risk today because the Connect handler only reads
`charges_enabled` (a stable field).

- Severity: P2
- Action: defer — bump the Connect endpoint to match billing on
  next Stripe-SDK update.

### P3 — Cosmetic

**P3-1. 52 of 69 active prices are not env-mapped.** Same as
2026-05-21 §P1-2. They're wired via `service_catalog.stripe_price_id`
per design, so functional, but the env-var-only path is still narrow.
No new gaps since 2026-05-21.

- Severity: P3 (was P1 pre-Wave-AU-1; downgraded once catalog-table
  path was verified working)
- Action: none — defer to whoever lands the env-var → catalog
  migration cleanup.

---

## What was fixed inline in this PR

Nothing. All findings either require manual Stripe-Dashboard action
(P1-1 through P1-4), strategy direction (P2-1), or a separate
secrets-rotation pass (P2-2). No code defects discovered.

---

## What needs Alex

In priority order:

1. **(P1-1, P1-3, P1-4)** ~10 min in Stripe Dashboard to archive:
   - 3 non-trademarked ContentFlow products + their 3 monthly prices.
   - 2 legacy QuoteQuick Pro prices ($79/mo, $853.20/yr).
   - 1 legacy QuoteQuick Starter product + its 2 prices.
2. **(P1-2)** ~2 min in Stripe Dashboard to rename
   `ReputationShield™ Scale` → `ReputationShield™ Premium`.
3. **(P2-1)** Strategy call — ship QuoteQuick coupon-codes feature
   for launch, or remove the bullet from Business-tier copy.
4. **(P2-2)** secrets-rotator pass to delete orphan Doppler vars
   `STRIPE_API_KEY` and `STRIPE_WEBHOOK` from `wefixtrades/prd` (after
   verifying `dev`/`stg` parity).

---

## Verification artifacts

Counts and IDs above were read via:

```
doppler run --project wefixtrades --config prd -- \
  Invoke-RestMethod -Uri https://api.stripe.com/v1/<resource> \
                    -Headers @{ Authorization = "Basic <base64>" }
```

Read-only; no `POST`/`DELETE` calls made against Stripe.

Key health:

- `STRIPE_SECRET_KEY` present, 107 chars, prefix `sk_live_`.
- `STRIPE_API_KEY` present, 107 chars, identical value to
  `STRIPE_SECRET_KEY` (orphan duplicate — P2-2).
- `STRIPE_BILLING_WEBHOOK_SECRET` present, 38 chars (Stripe whsec_*
  standard length).
- `STRIPE_CONNECT_WEBHOOK_SECRET` present, 38 chars.
- `STRIPE_WEBHOOK` present, 38 chars (orphan — P2-2).

No secret values were echoed to chat, the PR body, or this doc.
