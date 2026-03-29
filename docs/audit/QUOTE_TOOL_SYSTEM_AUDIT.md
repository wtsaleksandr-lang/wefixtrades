# Quote Tool System Audit

**Generated:** 2026-03-29
**Scope:** Complete implementation audit of the WeFixTrades quote tool as shown in the provided screenshots

---

## A. Executive Summary

### What This Tool Is
A multi-tenant, schema-driven quote calculator widget for trade service businesses (plumbing, cleaning, painting, electrical, roofing, etc.). The tool generates instant price estimates via a multi-step form, captures leads, and optionally supports booking and deposit collection.

### How It Works
1. **Demo Mode** (`/tools/quote-demo`): Hardcoded demo calculators for 5 trades shown via trade selector chips. No API calls — all data is inline.
2. **Production Mode** (`/Calculator?slug=<slug>`): Fetches real calculator config from PostgreSQL via API, renders the same widget with business-specific pricing.
3. **Embed Mode** (`embed-chat.js`): External websites embed via a script tag that loads the calculator in an iframe.

### Production Readiness
- **Demo page**: Production-ready as a marketing showcase. All data is hardcoded — no backend dependency.
- **QuoteWidget (v2)**: Feature-complete schema-driven replacement, but still **opt-in** via `?widget=v2` query param. Not the default in production.
- **CalculatorWidget (legacy)**: The **actual production default** — a frozen 2,284-line monolith marked for replacement.
- **Backend**: Fully functional with lead capture, notifications, followups, analytics, booking, Stripe deposits, AI chat, Twilio SMS.

**Verdict: Mixed — the demo page is polished, but production still runs the legacy widget by default.**

---

## B. File Inventory

### Frontend — Quote Tool Core
| File | Purpose |
|------|---------|
| `client/src/pages/marketing/quote-calculator-demo.tsx` | Main demo page (screenshots match this) |
| `client/src/pages/calculator.tsx` | Production calculator page |
| `client/src/components/quote-widget/QuoteWidget.tsx` | Schema-driven widget (v2) |
| `client/src/components/quote-widget/WidgetContext.tsx` | React context for widget state |
| `client/src/components/quote-widget/useWidgetState.ts` | Core state management hook |
| `client/src/components/quote-widget/StepRenderer.tsx` | Routes step types to components |
| `client/src/components/quote-widget/QuestionRenderer.tsx` | Routes question types to inputs |
| `client/src/components/quote-widget/StepHelp.tsx` | Expandable FAQ help panel |
| `client/src/components/quote-widget/designTokens.ts` | Visual design tokens |
| `client/src/components/quote-widget/types.ts` | TypeScript interfaces |
| `client/src/components/quote-widget/visibility.ts` | Conditional visibility evaluator |
| `client/src/components/quote-widget/steps/*.tsx` | 9 step components |
| `client/src/components/quote-widget/questions/*.tsx` | 9 question input components |
| `client/src/components/calculator/CalculatorWidget.tsx` | Legacy widget (FROZEN, 2,284 lines) |
| `client/src/components/calculator/SliderField.tsx` | Slider input for legacy widget |
| `client/public/embed-chat.js` | External embed script |

### Frontend — Theme & Config
| File | Purpose |
|------|---------|
| `client/src/theme/tokens.ts` | Global design tokens (colors, typography, shadows) |
| `client/src/theme/widgetTheme.ts` | Widget theme generator (accent color → full palette) |
| `client/src/theme/platformTheme.ts` | Platform/dashboard theme |
| `client/src/data/trades.ts` | Trade type definitions |
| `client/src/config/templateConfig.ts` | Template configuration |
| `client/src/config/pricing.ts` | Client-side pricing config |

### Frontend — Marketing Shell
| File | Purpose |
|------|---------|
| `client/src/components/marketing/MarketingLayout.tsx` | Navbar, footer, mobile menu |
| `client/src/components/marketing/CTASection.tsx` | CTA section component |
| `client/src/pages/marketing/home.tsx` | Homepage |
| `client/src/pages/marketing/demo.tsx` | Full demo page (chat, booking, review) |

### Shared (Frontend + Backend)
| File | Purpose |
|------|---------|
| `shared/pricingConfig.ts` | Pricing types, Zod validation, 10 pricing families |
| `shared/calculateEstimate.ts` | Pure estimate calculator function |
| `shared/templateLibrary.ts` | 6 UI templates + trade-to-template mapping |
| `shared/widgetFlowBuilder.ts` | Builds WizardFlow from config + template |
| `shared/wizardSchema.ts` | Full schema for wizard flows, steps, questions |
| `shared/sliderMappings.ts` | Unit-to-slider config mappings |
| `shared/slugUtils.ts` | Slug generation and validation |
| `shared/services.ts` | Service category definitions |
| `shared/schemas/db.ts` | Database schema (Drizzle ORM) |
| `shared/schemas/calculator.ts` | CalculatorSettings master Zod schema |
| `shared/schemas/pricing.ts` | Pricing intake + AI draft schemas |
| `shared/schemas/booking.ts` | Booking settings schema |

### Backend
| File | Purpose |
|------|---------|
| `server/index.ts` | Express server entry point |
| `server/routes/calculatorRoutes.ts` | Calculator CRUD + lookup |
| `server/routes/leadRoutes.ts` | Lead submission + coupon validation |
| `server/routes/bookingRoutes.ts` | Booking creation + slot availability |
| `server/routes/stripeRoutes.ts` | Stripe deposit payments |
| `server/routes/aiRoutes.ts` | AI chat + pricing agent |
| `server/routes/twilioRoutes.ts` | SMS webhook handler |
| `server/storage.ts` | Data access layer |
| `server/db.ts` | Database connection |
| `server/openaiClient.ts` | OpenAI API client |
| `server/twilioClient.ts` | Twilio SMS client |
| `server/bookingEmails.ts` | Email sending |
| `server/aiPricingAgent.ts` | AI-powered pricing config generation |
| `server/aiChatEngine.ts` | AI chat engine |
| `server/jobs/notificationWorker.ts` | Async notification processor |
| `server/jobs/followupWorker.ts` | Scheduled followup processor |
| `server/jobs/aggregation.ts` | Analytics aggregation |
| `server/jobs/scheduler.ts` | Cron job scheduler |

---

## C. Frontend Component Map

```
QuoteCalculatorDemo (page)
├── MarketingLayout (shell)
│   ├── Navbar
│   ├── Footer
│   └── MobileMenu
├── Trade Selector Chips (inline, 5 trades)
├── QuoteWidget (v2)
│   ├── WidgetProvider (context)
│   └── WidgetCard
│       ├── Header (business_name + tagline)
│       ├── Progress Bar ("STEP N / M")
│       ├── StepRenderer
│       │   ├── QuestionStep → QuestionRenderer
│       │   │   ├── SliderQuestion
│       │   │   ├── SelectQuestion
│       │   │   ├── ToggleQuestion
│       │   │   ├── TextInputQuestion
│       │   │   ├── NumberInputQuestion
│       │   │   ├── CheckboxGroupQuestion
│       │   │   ├── RadioGroupQuestion
│       │   │   └── PackageCardQuestion
│       │   ├── MultiQuestionStep
│       │   ├── PackageSelectionStep
│       │   ├── AddonSelectionStep
│       │   ├── InfoStep
│       │   ├── PriceRevealStep
│       │   ├── LeadCaptureStep
│       │   ├── BookingStep
│       │   └── ConfirmationStep
│       ├── StepHelp (expandable FAQ)
│       └── Navigation (Back / Skip / Continue)
├── Benefits Row (3 items)
├── CTA Card ("Get this on your website")
└── Cross-link Card ("Missed Call Revenue Calculator")
```

---

## D. Frontend Data Inventory

### Hardcoded Demo Data (quote-calculator-demo.tsx)

#### Trade Configs
Each trade has a complete `CalculatorData` object with:
- `id`: 0 (demo marker)
- `slug`: "demo-{trade}"
- `business_name`: Fake business name
- `tagline`: Trade-specific tagline
- `primary_color`: Trade-specific color
- `pricing_config`: Complete pricing rules
- `calculator_settings`: Template + lead form config

| Trade | Business Name | Color | Pricing Type | Base Fee | Rate | Add-ons |
|-------|--------------|-------|-------------|----------|------|---------|
| Plumbing | Metro Plumbing Co. | #3B82F6 | base_plus_rate | $89 | $65/fixture | Emergency $75, Camera $120, Warranty 15% |
| Cleaning | Sparkle Cleaning | #10B981 | tiered_packages | — | 3 tiers: $149/$249/$399 | Oven $45, Fridge $35, Windows $60 |
| Painting | ProCoat Painters | #F59E0B | per_sqft | $150 | $3.50/sqft | Primer 20%, Trim $200, Ceiling $175 |
| Electrical | Volt Electric | #8B5CF6 | hourly | $75 | $95/hr | Panel $85, Permits $120 |
| Roofing | Ridge Roofing | #EF4444 | per_sqft | $500 | $8.50/sqft | Gutter $650, Flashing $275 |

#### UI Text
- Page headline: "Let your customers get **instant quotes** on your website"
- Page subtitle: "Try it yourself — this is exactly what your customers will see."
- Benefit 1: "Quotes delivered in seconds"
- Benefit 2: "Collect deposits upfront"
- Benefit 3: "Works on any device"
- CTA heading: "Get this on your website"
- CTA subtext: "Live in under 10 minutes — no code needed"
- Cross-link: "Missed Call Revenue Calculator" / "See how much missed calls are costing you"

#### Widget Internal Text
- Step 1 title: "What do you need?" (from template wizard_steps)
- Step 1 label: "Service type"
- Step 1 placeholder: "Select an option"
- Step 2 title: "How big is the job?"
- Step 3 title: "Any extras?"
- Step 4 title: "Your estimate" / "Your Estimate"
- Step 5 title: "Get your detailed quote"
- Confirmation title: "You're all set!"
- Continue button: "Continue"
- Back button: "Back"
- Skip button: "Skip"
- Help FAQ items: Hardcoded per step in widgetFlowBuilder.ts

---

## E. User Flow Map

### Page Load → Final Submission

1. **Page loads** → `QuoteCalculatorDemo` renders with `selectedTrade = "plumbing"`
2. **Trade chips displayed** → 5 chips (Plumbing selected by default)
3. **QuoteWidget mounts** with Metro Plumbing Co. config
   - `validatePricingConfig` validates pricing_config
   - `getTemplateById("multi_step_progressive")` resolves template
   - Template has `wizard_steps` → used directly as flow steps
4. **Step 1/5: "What do you need?"** → Select dropdown with "Service type" label
   - Options array is empty in template definition (populated dynamically by step renderer for demo)
   - Continue button visible
5. **Step 2/5: "How big is the job?"** → Slider input (quantity)
   - maps_to: "quantity" (feeds into pricing engine)
6. **Step 3/5: "Any extras?"** → Checkbox group of add-ons
   - Can be skipped (can_skip: true)
   - Options populated from pricing_config.addOns
7. **Step 4/5: "Your estimate"** → PriceRevealStep
   - Calls `calculateEstimate(pricingConfig, inputs)` to compute total + breakdown
   - Displays total, line items, and breakdown
8. **Step 5/5: "Get your detailed quote"** → LeadCaptureStep
   - Fields: name, email, phone (configurable via lead_form.fields)
   - On submit: POST /api/leads (production) or no-op (demo, id=0)
9. **Confirmation** → "You're all set!" step
   - progress bar hidden (show_progress: false)

### Trade Switching
- User clicks a different trade chip
- `selectedTrade` state changes → `activeTrade` recalculated
- `QuoteWidget` receives new `calculator` prop via `key={selectedTrade}`
- Widget fully remounts with new config (fade-in animation)

### Back Navigation
- Enabled via `flow.settings.allow_back_navigation = true`
- Back button shown on all steps except first
- `prevStep()` decrements step index

---

## F. API Contract Inventory

See `QUOTE_TOOL_API_CONTRACTS.json` for full details.

**Key finding:** The demo page (`/tools/quote-demo`) makes **zero API calls**. All data is hardcoded. The production page (`/Calculator?slug=X`) is the one that hits the backend.

| Endpoint | Method | Auth | Used By |
|----------|--------|------|---------|
| `/api/calculators/lookup` | GET | None (slug) / Token | Production calculator page |
| `/api/calculators` | POST | None | Wizard (create) |
| `/api/calculators` | PATCH | Token | Edit calculator |
| `/api/calculators/track-view` | POST | None | Production page (fire-and-forget) |
| `/api/leads` | POST | None | Lead capture step |
| `/api/calculators/:slug/coupons/validate` | POST | None | Coupon input |
| `/api/ai/demo-chat` | POST | None | Demo page chat |

---

## G. Backend Logic Map

### Lead Submission Flow
1. Client POSTs to `/api/leads`
2. Lead created in `leads` table
3. Analytics event tracked (event_type: 'lead')
4. `enqueueLeadNotificationsAndFollowups` runs:
   - Enqueues email notification to business owner → `notification_queue`
   - Enqueues webhook notification if configured → `notification_queue`
   - Enqueues followup sequence (thank_you @ 2min, reminder @ 24hr, last_call @ 3 days) → `followup_jobs`
5. Background workers process queues on cron intervals
6. If coupon_code present, usage count incremented

### Pricing Engine
- `shared/calculateEstimate.ts` is a **pure function** used on both client and server
- Handles all 10 pricing types with consistent breakdown output
- Applies modifiers in order: base → rate × quantity → travel fee → after-hours multiplier → difficulty multiplier → add-ons → min charge floor

### Template System
- 6 templates define UI layout and behavior
- `multi_step_progressive` (used in demo) includes hardcoded wizard_steps
- For other templates, `buildWidgetFlow` generates steps dynamically from pricing config
- Trade-to-template mapping covers ~30 trade types

---

## H. Database Schema Summary

See `QUOTE_TOOL_SCHEMA_SUMMARY.json` for full details.

### Core Tables
| Table | Records | Purpose |
|-------|---------|---------|
| `calculators` | One per business | Core config entity with JSONB pricing_config + calculator_settings |
| `leads` | Many per calculator | Captured customer leads with quote amounts |
| `bookings` | Many per calculator | Booked appointments with deposit tracking |
| `notification_queue` | Per lead | Async email/webhook delivery queue |
| `followup_jobs` | Per lead | Scheduled followup messages |
| `analytics_events` | Per interaction | Raw event stream (views, leads) |

### Key JSONB Structures
- `calculators.pricing_config` → Discriminated union on `pricingType` field (10 variants)
- `calculators.calculator_settings` → Massive nested schema with 18+ top-level sections covering UI, lead form, booking, AI, promotions, followups, publish, integrations

---

## I. Config and Environment Inventory

### Environment Variables
| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `GOOGLE_MAPS_API_KEY` | Business search (audit tool) | No (not quote tool) |
| `PAGESPEED_API_KEY` | Website speed analysis (audit tool) | No |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | AI chat + pricing agent | For AI features |
| `TWILIO_ACCOUNT_SID` (inferred) | SMS sending | For SMS features |
| `TWILIO_AUTH_TOKEN` (inferred) | SMS sending | For SMS features |
| `STRIPE_SECRET_KEY` (inferred) | Deposit payments | For booking/deposits |
| `REPLIT_DEV_DOMAIN` | Dev URL construction | Auto-set by Replit |

### Static vs Dynamic Content
| Content | Source | Static/Dynamic |
|---------|--------|----------------|
| Trade selector chips | Hardcoded in quote-calculator-demo.tsx | Static |
| Demo calculator configs | Hardcoded in quote-calculator-demo.tsx | Static |
| Benefits text | Hardcoded in quote-calculator-demo.tsx | Static |
| CTA text | Hardcoded in quote-calculator-demo.tsx | Static |
| Wizard step titles | Hardcoded in templateLibrary.ts | Static |
| Help FAQ text | Hardcoded in widgetFlowBuilder.ts | Static |
| Production calculator config | PostgreSQL via API | Dynamic |
| Lead form fields | calculator_settings.lead_form | Dynamic (per business) |
| Pricing rules | calculator_settings.pricing_config | Dynamic (per business) |
| Template selection | calculator_settings.ui_template | Dynamic (per business) |

---

## J. Risks / Gaps / Unknowns

### Confirmed Issues
1. **Legacy widget is still default** — Production uses CalculatorWidget (frozen monolith) unless `?widget=v2` is explicitly passed. The new QuoteWidget is not yet the default.
2. **Demo wizard_steps service_type options are empty** — The `multi_step_progressive` template's first step has `options: []` for the service_type select question. In the demo, this means the dropdown has no options to choose from (the step title "What do you need?" and label "Service type" are visible but the dropdown is empty).
3. **Demo calculators have id: 0** — LeadCaptureStep presumably checks for `id === 0` to skip API calls, but this should be verified in the step implementation.
4. **No loading/error states on demo page** — The demo page renders instantly from hardcoded data, which is fine. But the production calculator page has loading/error states only in the page wrapper, not within the QuoteWidget itself.
5. **Token-based auth is fragile** — Edit tokens expire after 7 days. The only renewal mechanism is "duplicate your calculator." No user accounts required for basic usage.

### Confirmed Details (from component trace)
1. **BookingStep** — Calls `GET /api/bookings/availability?calculator_id={id}&date={date}` for slot fetching, `POST /api/bookings` for creation. Customer form requires name + email. Time slots rendered in 3-column grid.
2. **LeadCaptureStep** — Validates: requires email or phone. Email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. Phone: min 7 digits. Posts to `POST /api/leads`.
3. **PriceRevealStep** — Three display modes: `ExactPriceBlock` (total + line-item breakdown), `RangeBlock` ($min–$max), `CallForQuoteBlock` (phone icon + CTA). Recalculates from `calculateEstimate()` on render.
4. **ConfirmationStep** — Shows different content based on `leadSubmitted` and `bookingConfirmed` flags. Falls back through step.title → calculator.lead_thank_you_message → "You're all set!".

### Inferred (Not Directly Verified)
1. **Stripe deposit flow** — stripeRoutes.ts exists but wasn't fully traced. Deposit collection is referenced in booking settings schema.
2. **AI employee** — Full AI chat bubble implementation exists (AIChatBubble.tsx) but is only shown when ai_employee.enabled && subscription active/trial.
3. **Webhook delivery** — notification_queue supports webhooks, but retry/timeout behavior wasn't traced.
4. **SMS followup delivery** — followup_jobs with channel=sms exist, but actual Twilio sending logic in followupWorker wasn't traced.

### Dead Code / Unused
1. **FlowMapHero in home.tsx** — Desktop and mobile flow map sections have `display: "none"` — explicitly hidden.
2. **CalculatorWidget** — Marked as FROZEN but still the production default. Technically not dead code, but slated for removal.

### Potential Styling Inconsistencies
1. **Two design token systems** — `eff` tokens (widget) use a light theme (bg: #e4edf1), while `mkt` tokens (marketing) use a dark theme (bg: #181D1F). The widget renders as a white card on the dark page, which is intentional.
2. **Font mismatch** — Widget uses "Satoshi Variable", marketing uses "Satoshi, Inter". Both should resolve to Satoshi but the fallback chain differs.

---

## K. Recommendations for Phase 2

1. **Make QuoteWidget the default** — Remove the `?widget=v2` gate and make the schema-driven widget the production default.
2. **Populate wizard_steps dynamically** — The `multi_step_progressive` template has hardcoded wizard_steps with empty options. Build a system that populates service_type options from the pricing config at flow-build time.
3. **Audit BookingStep and PriceRevealStep** — These are the most complex step components and weren't fully traced. Verify their API integration and error handling.
4. **Design token unification** — Consider whether the widget's `eff` tokens should be configurable per-business or if they should always use the Effortel-style palette.
5. **Remove legacy CalculatorWidget** — Once QuoteWidget is validated, delete the 2,284-line monolith.
6. **Trace analytics events end-to-end** — Verify that all user interactions (step views, form field interactions, back/skip clicks) fire appropriate analytics events.
7. **Verify embed script** — The embed-chat.js creates an iframe at 320×480px. Verify this is sufficient for the multi-step widget and test mobile behavior.
8. **Inspect remaining step/question components** — Read all 9 step components and 9 question components to verify consistent styling, error handling, and accessibility.

---

## Generated Audit Files

- `docs/audit/QUOTE_TOOL_SYSTEM_AUDIT.md` (this file)
- `docs/audit/QUOTE_TOOL_FRONTEND_INVENTORY.json`
- `docs/audit/QUOTE_TOOL_BACKEND_INVENTORY.json`
- `docs/audit/QUOTE_TOOL_API_CONTRACTS.json`
- `docs/audit/QUOTE_TOOL_SCHEMA_SUMMARY.json`
