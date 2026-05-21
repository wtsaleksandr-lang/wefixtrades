# Post-checkout onboarding audit — 12 products

**Date:** 2026-05-21
**Branch:** `audit/wave-ay1-post-checkout-onboarding`
**Scope:** READ-ONLY map of what happens after Stripe Checkout `success_url` redirect, per product. No fixes — triage only.

## TL;DR

WeFixTrades has a **single generic onboarding system** (`onboarding_submissions` ←→ `onboarding_templates`) wired post-checkout through `stripeBillingRoutes.ts → sendOnboardingForClientService → createOnboardingSubmission`. After payment, the user lands on `/checkout/success` (auto-login via `/api/auth/checkout-login`), then is emailed a form link that opens at `/portal/onboarding/:id` and renders `PortalOnboarding.tsx` using fields from the matching template row in `onboarding_templates`.

**Coverage is high for marketing services (RankFlow, AdFlow, MapGuard, ReputationShield, SocialSync, WebFix, WebCare, SiteLaunch, all TradeLine variants, QuoteQuick).** **Major gap: ContentFlow tiers, BookFlow, and ~18 tier-level variants have NO template** — checkout completes but no onboarding form is created. **Only TradeLine answers are wired back to the AI** (`mapOnboardingToTradeLineConfig` in `portalRoutes.ts:896`). Other products' answers are stored as raw JSON only — visible in admin Client Detail page, but not joined into AI prompts (except ContentFlow brand profile, which lives in a separate parallel wizard `PortalContentPreferences.tsx`).

---

## Section A — Cross-product matrix

Legend: ✅ complete / ⚠️ partial or covered by adjacent flow / ❌ missing

| # | Product | Onboarding state | Vital Q coverage | AI access | Admin dashboard |
|---|---|---|---|---|---|
| 1 | QuoteQuick | ✅ template `quotequick` (8 fields) + parallel `/wizard` calculator editor | ⚠️ missing brand color, lead-routing tone, calc-template choice | ⚠️ stored in JSON; not joined into AI prompt; calc settings live in `calculators` table | ✅ `admin/QuoteQuickPage` + Client Detail "Onboarding Form" card |
| 2 | TradeLine 24/7 | ✅ three templates (`tradeline-call-backup`, `tradeline-chat`, `tradeline-complete`) + dedicated `/portal/tradeline/setup` wizard | ✅ business hours, services, tone, forwarding, escalation, install mode | ✅ `mapOnboardingToTradeLineConfig` writes into `tradeline_phone_setups` config consumed by Vapi assistant build | ✅ `admin/TradelineSetupsPage` + Client Detail |
| 3 | MapGuard | ⚠️ only `mapguard-setup` + `mapguard-ongoing` have templates — **`mapguard-basic`/`mapguard-pro` tiers have NO template** | ⚠️ missing GBP listing URL (asks google_account_email instead), no target-keyword priority | ❌ raw JSON only; not joined into MapGuard AI agents | ✅ `admin/MapguardDashboard` + Client Detail |
| 4 | RankFlow | ✅ all 3 tiers (`rankflow-starter/growth/pro`) | ✅ website, GSC email, areas, services, keywords, competitors, CMS access; brand-tone fields included | ⚠️ raw JSON only; `rankflow/planGenerator` does not currently read responses (uses `client_services.metadata`) | ✅ `admin/RankFlowOpsPage` + Client Detail |
| 5 | ReputationShield | ⚠️ only top-level `reputationshield` template — **3 tier variants (basic/pro/premium) inherit nothing** | ✅ GBP link, customer-source, cadence, reply tone, negative-handling policy | ❌ raw JSON only; not joined into review-reply AI | ✅ Client Detail |
| 6 | SocialSync | ⚠️ only top-level `socialsync` template — **3 tier variants (starter/growth/pro) inherit nothing** + parallel `/portal/socialsync-setup` page | ✅ platforms, handles, cadence, content style, brand voice; brand-color fields | ⚠️ raw JSON only; `socialSync/contentGenerator` reads `social_sync_settings`, not onboarding responses | ✅ `admin/SocialSyncOpsPage` + Client Detail |
| 7 | ContentFlow | ❌ **NO template for any tier** (`contentflow-creator/studio/agency`) — checkout completes silently | ⚠️ covered by separate `/portal/content-preferences` wizard (8 steps, writes `contentflow_brand_profiles`) but only if user navigates there manually | ✅ via `buildBrandLayerText` reads `brand_profile` table — but only after user finds the wizard | ⚠️ `admin/ContentFlowQueuePage` shows articles; no per-customer brand-profile view |
| 8 | AdFlow | ✅ all 3 tiers (`adflow-starter/growth/pro`) | ✅ budget, areas, offers, platforms, ad accounts, video/brand assets, competitors, target audience | ❌ raw JSON only; `adflowReports` doesn't read responses | ✅ `admin/AdFlowOpsPage` + Client Detail |
| 9 | WebFix | ✅ `webfix` template | ✅ URL, access method, main issue, urgency, brand assets | ❌ raw JSON only; `webfixAuditService` reads URL from `client_services.metadata` | ✅ Client Detail (no dedicated ops page) |
| 10 | WebCare | ✅ both tiers (`webcare-basic`, `webcare-pro`) | ✅ URL, CMS-specific creds (WP / Wix / Shopify / Squarespace), maintenance window | ⚠️ raw JSON only; `webcareContentAutomation` does not read responses — credentials handled via parallel `portal_email_domain_setup` flow | ✅ `admin/WebCareOpsPage` + Client Detail |
| 11 | SiteLaunch | ⚠️ two templates (`sitelaunch`, `sitelaunch-template`) — top-level `sitelaunch` tier from pricing not matched | ⚠️ missing logo URL field (asks checkbox only), no copy-tone preference | ❌ raw JSON only; `sitelaunchFinalization` reads from `client_services.metadata` | ⚠️ Client Detail only — no dedicated SiteLaunch admin page |
| 12 | BookFlow | ❌ **NO template, NO product entry in `shared/pricing.ts`** — but has full self-service `/portal/bookflow-setup` page wired to `bookflow_setups` table | ⚠️ self-serve wizard covers working hours / services / slug / buffer / accent — but user must navigate there manually after checkout | ⚠️ N/A — no AI agent for BookFlow currently | ⚠️ `admin/BookingCalendarPage` shows bookings; no setup status view |

### Aggregate counts

- 12 products audited
- **9** have at least one onboarding template; **3 missing**: ContentFlow, BookFlow, and tier-level gaps in MapGuard/ReputationShield/SocialSync
- **1** product (TradeLine) actively maps responses into AI runtime config
- **10** products surface responses in admin Client Detail page; **0** have a portfolio-wide "onboarding completion rate" view

---

## Section B — Per-product detail (gap entries only)

### ContentFlow — `contentflow-creator|studio|agency`

- **Current state:** Stripe checkout completes; `createOnboardingSubmission` is called in `stripeBillingRoutes.ts:455` but `getOnboardingTemplate("contentflow-*")` returns null → **no submission row, no email, no form**. Customer lands on `/checkout/success`, gets the generic "check your email" message, and receives nothing actionable. Only path forward: discover `/portal/content-preferences` on their own.
- **Vital Q missing in any flow:** none truly missing — the brand-profile wizard covers all 8 fields needed by `buildBrandLayerText`. But there is no nudge to complete it post-checkout.
- **Where data should be stored:** `contentflow_brand_profiles` (already exists). Onboarding template should be a thin wrapper that creates a `client_service_id`-linked submission whose responses mirror brand-profile fields and writes them on submit.
- **AI integration:** ✅ already plugged in via `buildBrandLayerText` once the profile exists.
- **Admin visibility:** ⚠️ admin can see articles but not whether brand profile is filled out.
- **Effort:** **S** — add 3 template rows in `seed-services.ts` pointing at brand-profile fields, plus a post-submit handler analogous to `mapOnboardingToTradeLineConfig`.

### BookFlow

- **Current state:** Not a Stripe-sellable SKU (no entry in `shared/pricing.ts ALL_PRODUCTS`). Provisioned only as a bundled add-on or admin-assigned. Setup happens self-service at `/portal/bookflow-setup`.
- **Vital Q missing:** ⚠️ no calendar-provider question (Cal.com / Calendly / Google) — currently inferred from feature flags. No deposit-policy question (BookFlow supports deposits via `widgetDepositRoutes` but doesn't ask up front).
- **Where data should be stored:** `bookflow_setups` (exists).
- **AI integration:** N/A — no AI agent for BookFlow yet.
- **Admin visibility:** ⚠️ no admin view of "BookFlow configured? slug claimed? services count?"
- **Effort:** **M** — add `bookflow` template row + add product entry in pricing if it's becoming a standalone SKU, otherwise just nudge BookFlow customers to the existing wizard from `CheckoutSuccess`.

### MapGuard tier gap

- **Current state:** Tiers `mapguard-basic` and `mapguard-pro` resolve to no template → silent no-op. Only `mapguard-setup` (the one-time bundle add-on) and `mapguard-ongoing` (monthly check-in) have templates.
- **Vital Q missing:** for the recurring tiers, the setup brief question set should be reused. Currently customers who buy `mapguard-basic` get nothing.
- **Effort:** **S** — duplicate `mapguard-setup` template rows under each tier id, or refactor `getOnboardingTemplate` to fall back to product-family default.

### ReputationShield tier gap

- **Current state:** Only the family-level `reputationshield` key exists. Stripe-purchased tiers `reputationshield-basic|pro|premium` find no template.
- **Effort:** **S** — same fix as MapGuard. Single template row covers all three tiers if mapped via fallback.

### SocialSync tier gap

- **Current state:** Same pattern — family-level `socialsync` template exists; tier-level (`-starter/-growth/-pro`) lookups return null.
- **Effort:** **S** — fallback or duplication.

### QuoteQuick — AI-context gap

- **Current state:** Template exists and fires. But responses are JSONB; `quotequickAiTools` and `aiPricingAgent` only read from `calculators` and `service_catalog`. The `pricing_model`, `base_pricing`, and `addons` answers (high-signal for the AI) never reach prompt assembly.
- **Effort:** **M** — add a post-submit hook (mirror of `mapOnboardingToTradeLineConfig`) that copies into `calculators.calc_settings`.

### SiteLaunch — template/tier mismatch

- **Current state:** Custom `sitelaunch` (single-tier sitelaunch product) and operational `sitelaunch-template` (admin-only SKU) both exist. The mapping is correct in the seeder for the operational SKU. Top-level `sitelaunch` (from pricing) **does** find a template named "SiteLaunch (Custom) Onboarding" — verified OK.
- **Vital Q missing:** logo URL field is checkbox only (yes/no). No copy-tone preference. No existing-domain question.
- **Effort:** **S** — add 3 fields.

### Cross-cutting — admin completion view

- **Current state:** Per-customer onboarding rows visible in Client Detail. **No aggregate view: "of all customers who paid in last 30 days, what % completed onboarding?"** This is a campaign-blocker: at launch, you'll want to chase non-completers manually.
- **Effort:** **M** — add `/admin/crm/onboarding-completion` page reading `onboarding_submissions` grouped by status × service.

---

## Section C — Priority matrix

Ranked by severity × impact, with effort.

| Rank | Item | Severity | Service-delivery impact TODAY? | Effort |
|---|---|---|---|---|
| 1 | **ContentFlow has zero post-checkout onboarding** | 🔴 critical | YES — paid customers go silent for days; content generation runs without brand profile and produces generic copy | S |
| 2 | **Tier-level template fallback (MapGuard, ReputationShield, SocialSync)** | 🔴 critical | YES — any customer who buys a SKU like `mapguard-basic` gets zero onboarding email; admin must hand-process | S |
| 3 | **Non-TradeLine responses not reaching AI** (QuoteQuick, RankFlow, MapGuard, AdFlow, ReputationShield, SocialSync) | 🟡 high | PARTIAL — customer gives answers, AI ignores them; ops team has to manually transcribe into config tables | M (per product) |
| 4 | Admin completion-rate dashboard | 🟡 high | NO — but blocks launch-day follow-up workflow | M |
| 5 | BookFlow checkout-success nudge | 🟡 medium | NO — bundled-only today, but customers who get it never see the setup link | S |
| 6 | SiteLaunch field gaps (logo URL, tone, domain) | 🟢 low | NO — ops can ask in followup | S |

### Top 3 to authorize fixing first

1. **ContentFlow templates + brand-profile post-submit hook** — effort **S**, unblocks 3 SKUs that currently no-op on checkout.
2. **Tier-fallback in `getOnboardingTemplate`** — effort **S**, single backend change closes the MapGuard/ReputationShield/SocialSync tier gap (and pre-empts future tier-level no-ops).
3. **Generic post-submit hook framework** — effort **M**, generalize `mapOnboardingToTradeLineConfig` into a per-product mapper registry so QuoteQuick, RankFlow, AdFlow answers flow into AI prompt context.

---

## Appendix — Key code paths

- `server/routes/publicCheckoutRoutes.ts:413` — Stripe session create, `success_url → /checkout/success`
- `client/src/pages/CheckoutSuccess.tsx` — landing page, auto-login retry loop
- `server/routes/stripeBillingRoutes.ts:452-475` — creates `onboarding_submissions` + sends email if template exists for service_id
- `server/scripts/seed-services.ts:394-743` — canonical `ONBOARDING` template inventory
- `server/routes/portalRoutes.ts:781-924` — GET/PUT for `/api/portal/onboarding/:id`
- `server/routes/portalRoutes.ts:896` — `mapOnboardingToTradeLineConfig` (only product wired to AI)
- `client/src/pages/portal/PortalOnboarding.tsx` — generic form renderer
- `client/src/pages/portal/PortalContentPreferences.tsx` — parallel ContentFlow wizard
- `client/src/pages/portal/BookFlowSetupPage.tsx` — parallel BookFlow wizard
- `client/src/pages/admin/ClientDetailPage.tsx:1018-1080` — admin per-customer onboarding card with response render
