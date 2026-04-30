# QuoteQuick System Audit — Part 1A

**Audit Date**: 2026-04-08
**Scope**: File map + architecture inventory (READ-ONLY, no changes)
**Stack**: React + Express + PostgreSQL + Drizzle ORM
**Product Slug**: `quickquotepro` (with redirect from `quotequick`)

---

## 1. High-Level Summary

QuoteQuick Pro™ is an embeddable instant-quote calculator widget for trade businesses (plumbing, cleaning, painting, electrical, roofing, etc.). End customers answer questions, receive an instant price estimate, and optionally submit contact information (lead capture) or book an appointment.

**Current state**: QuoteQuick is **fully implemented and production-active** with two parallel frontend widget implementations:

| Aspect | CalculatorWidget (Legacy) | QuoteWidget (v2, Schema-Driven) |
|---|---|---|
| File | `client/src/components/calculator/CalculatorWidget.tsx` | `client/src/components/quote-widget/QuoteWidget.tsx` |
| Default? | **Yes** — default on `/calculator` page | Opt-in via `?widget=v2` query param |
| Architecture | Frozen monolith (~2,284 lines) | Schema-driven via `WizardFlow` JSON |
| Maintenance | No active development | Active development path |

The toggle lives in `client/src/pages/calculator.tsx` — `params.get('widget') === 'v2'`.

Both widgets share the same backend (routes, DB, notifications, followups). The pricing engine (`shared/calculateEstimate.ts`) runs **client-side** in both implementations.

---

## 2. File Inventory

### A. Frontend Pages

| # | Path | Route | Purpose | Status | Connections |
|---|---|---|---|---|---|
| 1 | `client/src/pages/calculator.tsx` | `/calculator?slug=X` | Main calculator page. Fetches config by slug, toggles legacy vs v2 widget. Supports `?embed=true`. | ACTIVE | `GET /api/calculators/lookup`, `POST /api/calculators/track-view`, imports `QuoteWidget` + `CalculatorWidget` |
| 2 | `client/src/pages/marketing/quote-calculator-demo.tsx` | `/tools/quote-demo` | Marketing demo with 5 hardcoded trade calculators (plumbing, cleaning, painting, electrical, roofing). Uses QuoteWidget directly with inline pricing configs. | ACTIVE | Imports `QuoteWidget`, submits to `POST /api/demo-leads`, links to `/signup?product=quotequick` |
| 3 | `client/src/pages/wizard.tsx` | `/wizard` | Setup wizard entry page. Delegates to `WizardCard` component. Supports `?embed=1`. | ACTIVE | Imports `WizardCard` |
| 4 | `client/src/pages/edit-calculator.tsx` | `/EditCalculator?token=X` | Edit existing calculator settings. | ACTIVE | `GET /api/calculators/lookup`, `PATCH /api/calculators` |
| 5 | `client/src/pages/marketing/features/instant-quotes.tsx` | `/features/instant-quotes` | Marketing feature page for instant quotes. Presentational only, no live widget. | ACTIVE | None (presentational) |
| 6 | `client/src/pages/marketing/features/calculator-engine.tsx` | `/features/calculator-engine` | Marketing feature page for calculator engine. Presentational only. | ACTIVE | None (presentational) |
| 7 | `client/src/pages/demos/DemoPage.tsx` | `/demos/quotequick` | Individual demo page. Uses `DEMO_CONFIGS['quotequick']` with title "QuoteQuick Pro Demo". | ACTIVE | Demo config, `MarketingLayout` |
| 8 | `client/src/pages/demos/DemoCenter.tsx` | `/demos` | Hub showing all product demos. Includes QuoteQuick with calculator icon. | ACTIVE | Links to `/demos/quotequick` |
| 9 | `client/src/pages/marketing/docs/embed.tsx` | `/docs/embed` | Embed documentation. Three methods: hosted link, inline script, iframe. | ACTIVE | None (educational) |

### B. Frontend Components — QuoteWidget v2

**Core Components (6 files)** — `client/src/components/quote-widget/`

| # | File | Purpose | Status | Connections |
|---|---|---|---|---|
| 10 | `QuoteWidget.tsx` | Main entry. Validates pricing config, resolves template, builds `WizardFlow`, manages context, renders current step with header/progress/nav. | ACTIVE | Imports `WidgetProvider`, `StepRenderer`, `StepHelp`, `buildWidgetFlow`, `validatePricingConfig`, `getTemplateById`, `getWidgetTheme` |
| 11 | `types.ts` | TypeScript types: `CalculatorData`, `WidgetState`, `WidgetAction`, `WidgetConfig`, `LeadFormData`, `AppliedCoupon`, `BookingData`, `WidgetAnswers`. | ACTIVE | Imports from `@shared/wizardSchema`, `@shared/pricingConfig` |
| 12 | `WidgetContext.tsx` | React Context + `useReducer` state management. Reducer handles: `SET_ANSWER`, `SET_STEP`, `SET_PRICING`, `SET_LEAD_DATA`, `SET_COUPON_*`, `SET_EXPIRATION`, `SET_BOOKING`. | ACTIVE | Imports `calculateEstimate` |
| 13 | `useWidgetState.ts` | Convenience hook wrapping WidgetContext. Exposes answers, navigation, pricing, lead form helpers. | ACTIVE | Uses `WidgetContext` |
| 14 | `designTokens.ts` | Design tokens: font, colors, spacing, radii, shadows, pre-composed style objects. | ACTIVE | Used by all step/question components |
| 15 | `visibility.ts` | Evaluates conditional visibility rules for steps based on user answers. | ACTIVE | Used by `QuoteWidget.tsx` |

**Step Components (9 files)** — `client/src/components/quote-widget/steps/`

| # | File | Purpose | Status | Connections |
|---|---|---|---|---|
| 16 | `QuestionStep.tsx` | Renders a single question from the step definition. | ACTIVE | `StepRenderer`, `QuestionRenderer` |
| 17 | `InfoStep.tsx` | Displays informational content (text, images) without collecting input. | ACTIVE | `StepRenderer` |
| 18 | `MultiQuestionStep.tsx` | Renders multiple questions on a single step. | ACTIVE | `StepRenderer`, `QuestionRenderer` |
| 19 | `PackageSelectionStep.tsx` | Tiered package selection (e.g., Standard, Premium, Deluxe). | ACTIVE | `useWidgetState`, pricing types |
| 20 | `AddonSelectionStep.tsx` | Optional extras and upgrades selection. | ACTIVE | `useWidgetState`, pricing config |
| 21 | `PriceRevealStep.tsx` | Calculates and displays estimated price. Tracks `demo_price_seen` event. | ACTIVE | `calculateEstimate`, `useWidgetState`, `trackEvent` |
| 22 | `LeadCaptureStep.tsx` | Collects name, email, phone, SMS consent. Submits to `POST /api/leads`. Validates coupons via `GET /api/coupons/validate`. | ACTIVE | `POST /api/leads`, coupon validation |
| 23 | `BookingStep.tsx` | Date/slot selection, contact info, booking confirmation. | ACTIVE | `GET /api/bookings/availability`, `POST /api/bookings` |
| 24 | `ConfirmationStep.tsx` | Thank-you/success state. Shows QuoteQuick branding. Cross-sells via `NextStepSuggestions`. | ACTIVE | `trackEvent`, `NextStepSuggestions` |

**Question Input Components (11 files)** — `client/src/components/quote-widget/questions/`

| # | File | Purpose | Status |
|---|---|---|---|
| 25 | `TextInputQuestion.tsx` | Free text input | ACTIVE |
| 26 | `NumberInputQuestion.tsx` | Numeric input | ACTIVE |
| 27 | `SliderQuestion.tsx` | Range slider | ACTIVE |
| 28 | `SelectQuestion.tsx` | Dropdown selector | ACTIVE |
| 29 | `RadioGroupQuestion.tsx` | Single-choice radio buttons | ACTIVE |
| 30 | `CheckboxGroupQuestion.tsx` | Multi-select checkboxes | ACTIVE |
| 31 | `ToggleQuestion.tsx` | On/off toggle | ACTIVE |
| 32 | `PackageCardQuestion.tsx` | Visual package selection cards | ACTIVE |
| 33 | `InfoDisplay.tsx` | Read-only information display | ACTIVE |
| 34 | `QuestionProps.ts` | Shared question prop TypeScript interface | ACTIVE |
| 35 | `index.ts` | Barrel re-export of all question components | ACTIVE |

**Renderer Components (3 files)** — `client/src/components/quote-widget/`

| # | File | Purpose | Status |
|---|---|---|---|
| 36 | `StepRenderer.tsx` | Routes to correct step component based on `step.type` | ACTIVE |
| 37 | `QuestionRenderer.tsx` | Routes to correct question component based on `question.type` | ACTIVE |
| 38 | `StepHelp.tsx` | Context-sensitive help panel for steps | ACTIVE |

**Legacy Widget (1 file)**

| # | File | Purpose | Status |
|---|---|---|---|
| 39 | `client/src/components/calculator/CalculatorWidget.tsx` | Original monolith calculator widget (~2,284 lines). Frozen for backward compatibility. Default on `/calculator` page. | LEGACY — frozen, not actively developed |

**Setup Wizard (1 file)**

| # | File | Purpose | Status |
|---|---|---|---|
| 40 | `client/src/components/wizard/WizardCard.tsx` | Multi-stage calculator setup wizard (1,892 lines). Includes DesignStudio, PricingIntakeStage2, etc. | ACTIVE — large file, likely technical debt |

### C. Shared UI Used by QuoteQuick

| # | Path | Purpose | Status |
|---|---|---|---|
| 41 | `client/src/components/ui/checkbox.tsx` | Shadcn/ui checkbox primitive. Used by `LeadCaptureStep` for SMS consent. | ACTIVE |
| 42 | `client/src/components/marketing/NextStepSuggestions.tsx` | Cross-sell/related product suggestions. Used by `ConfirmationStep`. | ACTIVE |
| 43 | `client/src/theme/widgetTheme.ts` | Widget theme/color override system. Used by `QuoteWidget`. | ACTIVE |
| 44 | `client/src/theme/tokens.ts` | Design system tokens (colors, spacing, shadows). Used by marketing pages. | ACTIVE |

### D. Hooks / State / Store Files

| # | Path | Purpose | Status |
|---|---|---|---|
| 45 | `client/src/components/quote-widget/WidgetContext.tsx` | React Context + useReducer — central state store for QuoteWidget. | ACTIVE |
| 46 | `client/src/components/quote-widget/useWidgetState.ts` | Convenience hook for accessing widget state and dispatching actions. | ACTIVE |

No external state library (Redux, Zustand, etc.) is used. State is entirely React Context + useReducer within the widget tree.

### E. Backend Routes / Controllers

| # | Path | Key Endpoints | Purpose | Status | Connections |
|---|---|---|---|---|---|
| 47 | `server/routes/calculatorRoutes.ts` | `POST /api/calculators`, `GET /api/calculators/lookup`, `GET /api/calculators/check-slug`, `GET /api/calculators/slugify`, `PATCH /api/calculators`, `POST /api/calculators/duplicate`, `POST /api/calculators/track-view` | Calculator CRUD: create, fetch by slug/token, update settings, duplicate, track views. Validates pricing via `validatePricingConfig()` and settings via `calculatorSettingsSchema`. | ACTIVE | `storage`, `@shared/pricingConfig`, `@shared/schema`, `@shared/slugUtils` |
| 48 | `server/routes/leadRoutes.ts` | `POST /api/leads`, `GET /api/leads?token=X`, `POST /api/calculators/:slug/coupons/validate` | Lead creation with notification/followup enqueuing. Lead retrieval for dashboard. Coupon validation against calculator's promotions config. | ACTIVE | `storage`, `enqueueLeadNotificationsAndFollowups()` |
| 49 | `server/routes/bookingRoutes.ts` | `GET /api/bookings/availability`, `POST /api/bookings`, `POST /api/bookings/:id/checkout`, `GET /api/bookings/confirm` | Booking slot generation, creation, Stripe deposit checkout, payment confirmation. | ACTIVE | `storage`, `Stripe`, `sendBookingConfirmationToCustomer`, `sendBookingNotificationToBusiness` |
| 50 | `server/routes/demoLeadRoutes.ts` | `POST /api/demo-leads` | Demo-specific lead capture with rate limiting (5/IP/10min). Sends immediate quote email. Enqueues 3-step QuoteQuick sales followup sequence. | ACTIVE | `storage.createDemoQuoteLead`, `buildDemoQuoteEmail`, `enqueueDemoQuoteFollowups`, nodemailer |
| 51 | `server/routes/dashboardRoutes.ts` | `GET /api/dashboard/overview`, `GET /api/dashboard/leads`, `GET /api/dashboard/analytics`, `PATCH /api/dashboard/settings`, `PUT /api/dashboard/followup`, `POST /api/dashboard/followup/test`, `DELETE /api/dashboard/calculator` | Dashboard for calculator owners: stats, leads, analytics, settings, followup config, republish, delete. Auth via edit_token. | ACTIVE | `storage`, nodemailer (test followups) |
| 52 | `server/routes/portalRoutes.ts` | `GET /api/portal/quotequick/summary` | Client portal endpoint returning calculator summary (id, name, slug, views, leads, status) for authenticated clients. Links via `clients.user_id → calculators.user_id`. | ACTIVE | `db` (direct Drizzle queries), `requireClient` middleware |
| 53 | `server/routes/aiRoutes.ts` | `POST /api/ai/generate-pricing`, `POST /api/ai/pricing-config-draft`, `GET /api/ai/pricing-config-draft/:jobId` | AI-powered pricing configuration generation from business details. Used during calculator setup wizard. | ACTIVE | `aiPricingAgent.ts`, OpenAI |
| 54 | `server/routes/stripeRoutes.ts` | `POST /api/stripe/connect`, `GET /api/stripe/connect/callback`, `GET /api/stripe/connect/status` | Stripe Connect onboarding for deposit payments on bookings. | ACTIVE | Stripe API |
| 55 | `server/routes/domainRoutes.ts` | `POST /api/domains/check-dns`, `POST /api/domains/issue-ssl` | Custom domain DNS verification and SSL provisioning for hosted calculators. | ACTIVE | DNS/SSL infrastructure |
| 56 | `server/routes/index.ts` | (registration hub) | Centralizes all route registration. Imports and calls all `register*Routes()` functions. | ACTIVE | All route files |

### F. Backend Services / Business Logic

| # | Path | Purpose | Status | Connections |
|---|---|---|---|---|
| 57 | `server/storage.ts` | Central data access layer (~700+ lines). All DB operations: calculator CRUD, leads, bookings, notifications, followups, analytics, coupons, demo leads. | ACTIVE | Drizzle ORM, all `shared/schemas/*` |
| 58 | `server/lib/demoQuoteFollowup.ts` | Demo quote email templates + followup sequence builder. Immediate quote email, internal notification, 3-step sales sequence selling QuoteQuick ($49/mo CTA). | ACTIVE | `storage.enqueueAuditFollowups` |
| 59 | `server/bookingEmails.ts` | Booking confirmation email templates. Sends to customer and business owner. | ACTIVE | nodemailer |
| 60 | `server/aiPricingAgent.ts` | OpenAI-based pricing intelligence. Converts business descriptions into `PricingConfigV1` with few-shot examples. | ACTIVE | OpenAI API |
| 61 | `server/twilioClient.ts` | Twilio SMS/WhatsApp integration. Rate-limited sending, message storage. | ACTIVE | Twilio API, `sms_messages` table |
| 62 | `server/aiChatEngine.ts` | AI chat engine. References QuoteQuick in support agent prompt as "instant quote calculators". | ACTIVE | OpenAI/Anthropic API |

**Background Job Workers**

| # | Path | Purpose | Status | Connections |
|---|---|---|---|---|
| 63 | `server/jobs/notificationWorker.ts` | Processes `notification_queue` table. Sends "New Quote Request" emails to business owners + webhook delivery. Rate-limited (30/calc/60min). 3 max retry attempts. | ACTIVE | `storage`, nodemailer |
| 64 | `server/jobs/followupWorker.ts` | Processes `followup_jobs` table. Sends scheduled thank_you/reminder/last_call emails + SMS. Template variables: `{{name}}`, `{{quote_amount}}`, `{{business_name}}`, `{{phone}}`, `{{booking_link}}`, `{{discount_code}}`. | ACTIVE | `storage`, nodemailer, `twilioClient` |
| 65 | `server/jobs/aggregation.ts` | Daily analytics aggregation. Computes views, leads, conversion rate, avg quote value, best day per calculator. Writes to `calculator_analytics_summary`. | ACTIVE | `storage` |
| 66 | `server/jobs/scheduler.ts` | node-cron job scheduler. Orchestrates all background workers on schedule. | ACTIVE | All worker files |

### G. Database Schema / Tables

All defined in `shared/schemas/db.ts` via Drizzle ORM.

**Core QuoteQuick Tables**

| # | Table Name | Purpose | Key Columns |
|---|---|---|---|
| 67 | `calculators` | Main calculator configuration | `id` (PK), `user_id` (FK users), `slug` (unique), `business_name`, `trade_type`, `pricing_config` (JSONB), `calculator_settings` (JSONB), `theme_overrides` (JSONB), `edit_token`, `token_expires_at`, `plan_tier`, `total_views` |
| 68 | `leads` | Production lead capture | `id` (PK), `calculator_id` (FK), `name`, `email`, `phone`, `quote_amount`, `answers` (JSONB), `status`, `sms_consent`, `consent_timestamp` |
| 69 | `bookings` | Appointment bookings | `id` (PK), `calculator_id` (FK), `lead_id` (FK nullable), `customer_name`, `date`, `time`, `duration_minutes`, `status`, `deposit_amount`, `deposit_paid`, `stripe_payment_intent_id`, `quote_amount` |
| 70 | `notification_queue` | Async email/webhook notifications | `id` (PK), `calculator_id` (FK), `lead_id` (FK), `type` (email/webhook), `status`, `attempts`, `payload` (JSONB) |
| 71 | `followup_jobs` | Scheduled followup sequences | `id` (PK), `lead_id` (FK), `calculator_id` (FK), `run_at`, `type` (thank_you/reminder/last_call), `channel` (email/sms), `status`, `payload` (JSONB) |
| 72 | `analytics_events` | Raw event stream | `id` (PK), `calculator_id` (FK), `event_type`, `metadata` (JSONB) |
| 73 | `calculator_analytics_summary` | Aggregated daily stats | `id` (PK), `calculator_id` (FK), `period_date`, `total_views`, `total_quotes`, `total_leads`, `conversion_rate`, `avg_quote_value` |
| 74 | `deployment_status` | Publish state per calculator | `id` (PK), `calculator_id` (FK unique), `status` (draft/live), `last_published_at`, `auto_republish` |
| 75 | `demo_quote_leads` | Demo-specific leads (separate from production) | `id` (PK), `email`, `name`, `phone`, `trade`, `demo_business_name`, `quote_amount`, `answers` (JSONB), `sms_consent`, `source`, `source_tool` |
| 76 | `sms_messages` | SMS message log (Twilio) | `id` (PK), `lead_id` (FK), `calculator_id` (FK), `direction`, `channel`, `body`, `twilio_sid`, `is_ai` |
| 77 | `ai_conversations` | AI chat sessions linked to calculators | `id` (PK), `calculator_id` (FK), `session_id`, `messages_json` (JSONB) |
| 78 | `audit_followup_emails` | Cross-tool followup emails; bridges demo leads via `demo_quote_lead_id` | `id` (PK), `demo_quote_lead_id`, `email`, `run_at`, `step`, `status`, `payload` (JSONB) |
| 79 | `job_logs` | Background job execution log | `id` (PK), `job_name`, `status`, `started_at`, `finished_at`, `error_message` |

### H. Seed / Config / Template Files

| # | Path | Purpose | Status |
|---|---|---|---|
| 80 | `shared/pricingConfig.ts` | Pricing type definitions (10 types) + Zod discriminated union validation. Types: `hourly`, `per_unit`, `per_sqft`, `per_linear_ft`, `base_plus_rate`, `tiered_packages`, `tiered_ranges`, `min_charge_plus_addons`, `price_range_only`, `call_for_quote_only`. | ACTIVE |
| 81 | `shared/calculateEstimate.ts` | Pure calculation engine. Returns `EstimateResult` with type `exact`/`range`/`call_for_quote`, breakdown, total. Handles add-ons, difficulty, travel fee, after-hours, min charge. | ACTIVE |
| 82 | `shared/widgetFlowBuilder.ts` | Converts `PricingConfigV1` + `TemplateDefinition` + `FlowBuilderSettings` → `WizardFlow`. Bridge between config and UI. | ACTIVE |
| 83 | `shared/wizardSchema.ts` | Schema-driven wizard definitions. 9 question types, validation rules, conditional visibility, step/flow structure. All JSON-serializable. | ACTIVE |
| 84 | `shared/templateLibrary.ts` | 6 UI layout templates: `classic_single`, `classic_two_column`, `multi_step_progressive`, `package_selector`, `range_only_leadgate`, `estimate_then_book`. Trade-to-template mapping (~30 trades). | ACTIVE |
| 85 | `shared/sliderMappings.ts` | Maps unit names (sqft, hours, items) to slider min/max/step configs. | ACTIVE |
| 86 | `shared/slugUtils.ts` | Slug generation, validation, subdomain building. `HOSTING_DOMAIN` = `estimate.ai`. | ACTIVE |
| 87 | `shared/pricing.ts` | Product pricing definitions. QuoteQuick: Starter $49/mo, Pro $79/mo. | ACTIVE |
| 88 | `shared/schemas/calculator.ts` | Master Zod schema for `calculator_settings` JSONB. 18 sections: `calculator_type`, `booking_settings`, `ui_template`, `conversion_blocks`, `appearance`, `layout`, `conversion`, `integrations`, `lead_form`, `publish`, `followup`, `promotions`, `quote_rules`, `ai_employee`, `test_history`, etc. | ACTIVE |
| 89 | `shared/schemas/booking.ts` | Booking settings Zod schema (deposit config, availability, timezone). | ACTIVE |
| 90 | `shared/schemas/pricing.ts` | Pricing intake/draft/audit-log schemas for AI pricing generation workflow. | ACTIVE |
| 91 | `server/scripts/seed-services.ts` | Seeds `service_catalog` with QuoteQuick tiers + onboarding templates (7 steps) + task templates (3 tasks). Safe upserts. | ACTIVE |
| 92 | `client/src/config/products.ts` | Product page metadata. Slug `quickquotepro`, name "QuoteQuick Pro™", category `core`, CTA → `/Wizard`. | ACTIVE |
| 93 | `client/src/config/pricingPlans.ts` | Pricing plan definitions for marketing pages. | ACTIVE |
| 94 | `client/src/config/planGating.ts` | Feature gates per tier. Starter: basic embed + lead capture. Pro: custom logic, booking, deposits, SMS. | ACTIVE |
| 95 | `client/src/config/templateConfig.ts` | Legacy template demos for marketing. Canonical source is `shared/templateLibrary.ts`. | LEGACY |
| 96 | `client/src/site/siteMap.ts` | Navigation structure. QuoteQuick in PRODUCTS array + DEMOS array. | ACTIVE |

### I. Admin / Portal Files Touching QuoteQuick

| # | Path | Purpose | Status |
|---|---|---|---|
| 97 | `server/routes/portalRoutes.ts` (line ~603) | `GET /api/portal/quotequick/summary` — returns calculator summary for authenticated portal client. Joins `clients.user_id → calculators.user_id`. | ACTIVE |
| 98 | `server/routes/dashboardRoutes.ts` | Full dashboard for calculator owners. Token-based auth. Stats, leads, analytics, settings, followup config. | ACTIVE |
| 99 | `server/routes/adminCrmRoutes.ts` | Admin CRM. References QuoteQuick as a service offering in the service catalog, but is not QuoteQuick-specific. | ACTIVE (tangential) |
| 100 | `shared/schemas/adminCrm.ts` | Admin CRM schema. `serviceCatalog` includes `quotequick-starter` and `quotequick-pro` entries. `clientServices` tracks activation per client. | ACTIVE (tangential) |

### J. Embed / Public-Facing Files

| # | Path | Purpose | Status |
|---|---|---|---|
| 101 | `client/src/pages/calculator.tsx` (with `?embed=true`) | Embed mode strips header/footer, renders calculator only. | ACTIVE |
| 102 | `client/public/embed-chat.js` | Vanilla JS embed script for external websites. Floating bubble + iframe. Config via `data-calculator-slug`, `data-accent-color`, `data-base-url`. | ACTIVE |
| 103 | `client/src/pages/marketing/docs/embed.tsx` | Embed guide documentation. Three methods: hosted link, inline `<script>`, iframe. References `quickquotepro.com`. | ACTIVE |

### Attached Assets

| # | Path | Purpose | Status |
|---|---|---|---|
| 104 | `attached_assets/quickquote-icon_*.png` | QuoteQuick icon assets (multiple versions). | ACTIVE |
| 105 | `attached_assets/quickquote-icon_*.webp` | QuoteQuick icon (WebP format). | ACTIVE |
| 106 | `docs/quotequick-pro-competitor-research.md` | Competitor research document for QuoteQuick Pro. | REFERENCE |

---

## 3. Real Architecture Flow

### 3A. Production Calculator Flow (page load → final result)

```
1. PAGE LOAD
   └─ User visits /calculator?slug=acme-plumbing (or ?embed=true for iframe)
   └─ calculator.tsx mounts

2. DATA FETCH
   └─ GET /api/calculators/lookup?slug=acme-plumbing
   └─ Server: storage.getCalculatorBySlug() → returns calculator row
   └─ Response: { calculator: { id, slug, business_name, pricing_config, calculator_settings, ... } }

3. VIEW TRACKING (fire-and-forget)
   └─ POST /api/calculators/track-view { calculator_id }
   └─ Server: storage.incrementViews() + storage.trackEvent('view')

4. WIDGET INITIALIZATION
   └─ calculator.tsx checks ?widget=v2 param
   ├─ v2: renders <QuoteWidget calculatorData={...} />
   └─ default: renders <CalculatorWidget calculatorData={...} />

5. QUOTWIDGET v2 INITIALIZATION PIPELINE
   └─ validatePricingConfig(pricing_config) → validated PricingConfigV1
   └─ getTemplateById(calculator_settings.ui_template.template_id) → TemplateDefinition
   └─ buildWidgetFlow(pricingConfig, template, settings) → WizardFlow
   └─ <WidgetProvider> wraps tree with useReducer state

6. STEP RENDERING (sequential wizard)
   └─ StepRenderer routes to correct step component based on step.type:
       question → QuestionStep → QuestionRenderer → [Slider|Select|Toggle|...]
       multi_question → MultiQuestionStep
       package_selection → PackageSelectionStep
       addon_selection → AddonSelectionStep
       info → InfoStep
       price_reveal → PriceRevealStep
       lead_capture → LeadCaptureStep
       booking → BookingStep
       confirmation → ConfirmationStep

7. PRICE CALCULATION (client-side, no API call)
   └─ PriceRevealStep calls calculateEstimate(pricingConfig, answers)
   └─ Returns EstimateResult: { type: "exact"|"range"|"call_for_quote", total, rangeMin, rangeMax, breakdown[] }
   └─ Tracks event: trackEvent('demo_price_seen')

8. COUPON VALIDATION (optional)
   └─ User enters coupon code in LeadCaptureStep
   └─ GET /api/calculators/:slug/coupons/validate?code=SAVE10
   └─ Server checks calculator_settings.promotions.coupons array
   └─ Returns { valid, coupon: { type, value, ... } } or error

9. LEAD SUBMISSION
   └─ LeadCaptureStep submits POST /api/leads
   └─ Body: { calculator_id, name, email, phone, quote_amount, answers, sms_consent, coupon_code }
   └─ Server: storage.createLead() → lead row
   └─ Server: enqueueLeadNotificationsAndFollowups(lead, calculator_id):
       ├─ Enqueues email notification → notification_queue (type: 'email')
       ├─ Enqueues webhook notification → notification_queue (type: 'webhook') if configured
       ├─ Schedules followup_jobs:
       │   ├─ thank_you at +2 minutes
       │   ├─ reminder at +24 hours
       │   └─ last_call at +3 days
       └─ Tracks event: trackEvent('lead_submitted')
   └─ Response: { success, lead: { id, ... } }

10. BOOKING (optional, if calculator_type includes booking)
    └─ BookingStep: GET /api/bookings/availability?calculator_id=X&date=2026-04-15
    └─ Server: generates time slots based on booking_settings.availability, filters existing bookings
    └─ User selects slot, submits POST /api/bookings
    └─ Server: storage.createBooking() → booking row
    └─ If deposit enabled: POST /api/bookings/:id/checkout → Stripe checkout session
    └─ Sends confirmation emails (customer + business)

11. CONFIRMATION
    └─ ConfirmationStep renders thank-you message
    └─ Shows NextStepSuggestions (cross-sell other products)
    └─ Tracks event: trackEvent('confirmation_shown')

12. BACKGROUND PROCESSING (async, after page interaction)
    └─ notificationWorker processes notification_queue:
    │   └─ Sends "New Quote Request" email to business owner_email
    │   └─ Sends webhook POST to configured webhook_url
    └─ followupWorker processes followup_jobs:
        └─ Sends templated emails/SMS at scheduled times
        └─ Template variables: {{name}}, {{quote_amount}}, {{business_name}}, {{phone}}, {{booking_link}}
```

### 3B. Demo Flow (quote-calculator-demo.tsx)

```
1. User visits /tools/quote-demo
2. Page renders 5 trade tabs with hardcoded inline pricing configs (no API fetch)
3. QuoteWidget renders with selected trade's config
4. User interacts → price calculated client-side via calculateEstimate()
5. Lead capture submits POST /api/demo-leads (separate from production leads)
6. Server: storage.createDemoQuoteLead() → demo_quote_leads row
7. Server: sends immediate quote email to user via nodemailer
8. Server: sends internal notification email to WeFixTrades team
9. Server: enqueueDemoQuoteFollowups() → audit_followup_emails rows
   └─ Day 1: Feature education email
   └─ Day 2: Cross-sell to audit tool
   └─ Day 3: Urgency/last call with QuoteQuick CTA ($49/mo)
```

### 3C. Calculator Setup Flow (wizard)

```
1. User visits /wizard
2. WizardCard.tsx renders multi-stage setup:
   └─ Stage 1: Business info (name, trade, contact)
   └─ Stage 2: Pricing intake (charge method, rates, packages)
   └─ Stage 3: AI pricing generation (POST /api/ai/generate-pricing)
   └─ Stage 4: Design studio (template, colors, branding)
   └─ Stage 5: Publish settings (slug, domain, embed)
3. On completion: POST /api/calculators → creates calculator row
4. Server: generates slug, edit_token, sets deployment_status to 'live'
5. Returns: calculator URL, edit URL, dashboard URL, embed code
```

---

## 4. Reusable Existing Infrastructure

These shared systems are already available and consumed by QuoteQuick:

### 4A. Calculation Engine
- **Files**: `shared/calculateEstimate.ts`, `shared/pricingConfig.ts`
- **What it provides**: 10 pricing model types, add-on calculations, difficulty tiers, travel fees, after-hours multipliers, min charge enforcement, call-for-quote threshold
- **Reusability**: Fully reusable. Pure functions with no side effects. Runs client-side and could also run server-side.

### 4B. Schema-Driven Wizard System
- **Files**: `shared/wizardSchema.ts`, `shared/widgetFlowBuilder.ts`, `shared/templateLibrary.ts`
- **What it provides**: 9 question types, validation rules, conditional visibility, 6 layout templates, config-to-UI conversion
- **Reusability**: Designed for reuse. Any new product needing a multi-step form wizard could use this system.

### 4C. Lead Capture Pipeline
- **Files**: `server/routes/leadRoutes.ts`, `server/storage.ts` (createLead, enqueueNotification, enqueueFollowupJobs)
- **What it provides**: Lead creation, email/webhook notification queueing, 3-step followup scheduling, coupon validation, SMS consent tracking
- **Reusability**: Currently tightly coupled to `calculator_id`. Would need abstraction for use by other products.

### 4D. Booking System
- **Files**: `server/routes/bookingRoutes.ts`, `server/bookingEmails.ts`, `shared/schemas/booking.ts`
- **What it provides**: Availability slot generation, booking creation, Stripe deposit checkout, confirmation emails
- **Reusability**: Currently coupled to `calculator_id`. The slot generation logic is generic enough to reuse.

### 4E. SMS / Email / Webhook Infrastructure
- **Files**: `server/twilioClient.ts`, `server/jobs/notificationWorker.ts`, `server/jobs/followupWorker.ts`
- **What it provides**: Twilio SMS/WhatsApp sending with rate limiting, SMTP email delivery, webhook delivery with SSRF protection, retry semantics (3 max attempts), scheduled delivery
- **Reusability**: Highly reusable. The notification queue + followup jobs pattern is generic.

### 4F. Analytics Pipeline
- **Files**: `server/jobs/aggregation.ts`, `server/storage.ts` (trackEvent, getEventCounts, etc.)
- **What it provides**: Event tracking, daily aggregation (views, leads, conversion rate, avg quote value), weekly trends
- **Reusability**: Currently keyed on `calculator_id`. Pattern is generic and reusable.

### 4G. Admin CRM / Client Portal
- **Files**: `server/routes/adminCrmRoutes.ts`, `server/routes/portalRoutes.ts`, `shared/schemas/adminCrm.ts`
- **What it provides**: Service catalog with QuoteQuick tiers, client management, service activation tracking, portal summary endpoint
- **Reusability**: Already integrated. QuoteQuick appears in the service catalog as `quotequick-starter` and `quotequick-pro`.

### 4H. Stripe Billing
- **Files**: `server/routes/stripeRoutes.ts`, `server/routes/stripeBillingRoutes.ts`, `server/routes/publicCheckoutRoutes.ts`
- **What it provides**: Stripe Connect for deposit payments, subscription billing for QuoteQuick tiers
- **Reusability**: Already integrated for booking deposits. Subscription billing is separate.

### 4I. Embed / Public Page Support
- **Files**: `client/public/embed-chat.js`, `client/src/pages/marketing/docs/embed.tsx`
- **What it provides**: `?embed=true` query param mode (strips chrome), vanilla JS embed script with `<script>` tag injection, iframe embed, hosted link via `estimate.ai` subdomain
- **Reusability**: Embed pattern is reusable for any widget-style product.

### 4J. AI Pricing Generation
- **Files**: `server/aiPricingAgent.ts`, `server/routes/aiRoutes.ts`
- **What it provides**: OpenAI-based pricing config generation from business descriptions, few-shot examples for hourly/sqft/tiered models
- **Reusability**: Currently QuoteQuick-specific but the pattern (structured output from LLM) is reusable.

---

## 5. Unclear or Suspicious Areas

### 5A. Dual Widget Implementations (HIGH concern)
Two parallel frontend implementations exist with no visible migration timeline. The legacy `CalculatorWidget` (frozen, ~2,284 lines) remains the **default**. The schema-driven `QuoteWidget` is opt-in only via `?widget=v2`. Any feature that must work in "the calculator" must be evaluated against both implementations, creating ongoing maintenance burden.

### 5B. Dual Lead Tables (MEDIUM concern)
Production leads go to `leads` table (keyed on `calculator_id`). Demo leads go to `demo_quote_leads` table (no `calculator_id`, has `trade` and `demo_business_name` instead). They share no foreign keys and have different column schemas. The `audit_followup_emails` table bridges them loosely via a nullable `demo_quote_lead_id` integer column. This means demo analytics and production analytics are completely separate.

### 5C. Product Slug Confusion (LOW concern)
- Canonical product slug: `quickquotepro`
- Demo center uses: `quotequick`
- App.tsx has redirect: `/products/quotequick` → `/products/quickquotepro`
- Other product pages reference both `quotequick` and `quickquotepro` in their `related` arrays
- Marketing uses "QuoteQuick Pro™" as display name

### 5D. WizardCard.tsx Size (MEDIUM concern)
`client/src/components/wizard/WizardCard.tsx` is 1,892 lines. This is the calculator setup wizard and likely contains accumulated technical debt. It handles multiple wizard stages (business info, pricing intake, AI generation, design studio, publish settings) in a single file. Candidate for decomposition.

### 5E. Template wizard_steps Coverage (LOW concern)
Only `multi_step_progressive` template has `wizard_steps` defined, with a comment: "Proof-of-concept wizard step definitions — will be populated per-trade in Phase 2" (line 76 of `shared/templateLibrary.ts`). Other templates have no `wizard_steps`, so `buildWidgetFlow()` must generate them dynamically from pricing config. This means template-specific customization is limited to one template.

### 5F. Custom Domain Infrastructure (UNCLEAR)
The `publish` section of `calculatorSettingsSchema` defines: `custom_domain`, `custom_domain_status` (with states: none → pending_dns → dns_verified → ssl_provisioning → active → failed), `ssl_status`, `hosting_domain` (default: `estimate.ai`). Route files exist (`domainRoutes.ts` with `POST /api/domains/check-dns` and `POST /api/domains/issue-ssl`). **However, it is unclear from the codebase whether the DNS verification and SSL provisioning actually work end-to-end or are partially implemented.**

### 5G. Coupon Endpoint Location (LOW concern)
The coupon validation endpoint `POST /api/calculators/:slug/coupons/validate` is defined inside `server/routes/leadRoutes.ts`, not in a dedicated coupon routes file. Non-obvious location for future developers.

### 5H. Token-Based Auth Model (MEDIUM concern)
Calculator updates use `edit_token` with `token_expires_at` (7-day expiry) instead of user session auth. The `duplicateCalculator` endpoint serves as a token renewal mechanism (creates new calc with fresh token). This is an unusual auth pattern — it means anyone with the token URL has full access, and the token rotates via duplication rather than explicit renewal. The portal route (`GET /api/portal/quotequick/summary`) uses proper session auth via `requireClient` middleware, creating two parallel auth models.

### 5I. Client-Side Pricing Exposure (LOW concern)
`calculateEstimate()` runs entirely in the browser. All pricing logic (rates, add-on calculations, difficulty multipliers, thresholds) is visible to end users via browser dev tools. This is a deliberate architectural choice (no server roundtrip for price calculation) but means pricing rules cannot be kept secret from end users.

### 5J. Existing Audit Documents (NOTE)
The `docs/audit/` directory already contains 5 audit documents that partially overlap with this audit:
- `QUOTE_TOOL_SYSTEM_AUDIT.md` (22KB)
- `QUOTE_TOOL_SCHEMA_SUMMARY.json`
- `QUOTE_TOOL_API_CONTRACTS.json`
- `QUOTE_TOOL_BACKEND_INVENTORY.json`
- `QUOTE_TOOL_FRONTEND_INVENTORY.json`

These were not examined in detail during this audit. They may contain additional information or may be outdated. Cross-referencing with this document is recommended.

---

## File Count Summary

| Category | Count |
|---|---|
| Frontend pages | 9 |
| QuoteWidget v2 components (core + steps + questions + renderers) | 29 |
| Legacy widget | 1 |
| Setup wizard | 1 |
| Shared UI | 4 |
| Hooks/state | 2 |
| Backend routes | 10 |
| Backend services/logic | 6 |
| Background workers | 4 |
| Database tables | 13 |
| Shared business logic | 7 |
| Shared schemas | 4 |
| Config/seed/template files | 11 |
| Admin/portal files | 4 |
| Embed/public files | 3 |
| Assets/docs | 3 |
| **TOTAL** | **111** |

---

*End of Part 1A audit. No code was changed. No fixes were applied. All findings are based on direct inspection of the codebase as of 2026-04-08.*
