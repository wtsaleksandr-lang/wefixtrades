# Phase 1 Completion Report & Phase 2 Implementation Plan

---

## A. PHASE 1 COMPLETION STATUS

### Completed Actions

| # | Action | Status | Commit |
|---|--------|--------|--------|
| 1 | Delete junk files/dirs (~75 MB) | DONE | `chore: remove debug dirs, scrapers, and screenshot artifacts` |
| 2 | Split `shared/schema.ts` → `shared/schemas/` (5 modules + barrel) | DONE | `refactor: split shared/schema.ts into domain modules` |
| 3 | Create `shared/wizardSchema.ts` (198 lines, 9 question types, 9 step types) | DONE | `feat: add wizard step schema definitions` |
| 4 | Add freeze headers to 10 god-components | DONE | `chore: add freeze headers to components scheduled for rebuild` |
| 5 | Extend `templateLibrary.ts` with `wizard_steps?: StepDefinition[]` | DONE | `feat: extend template definitions with wizard step schemas` |
| 6 | Split `server/routes.ts` → `server/routes/` (9 domain modules + barrel) | DONE | `refactor: complete route split` |
| 7 | Deprecate `client/src/config/templateConfig.ts` | DONE | `chore: deprecate marketing template system` |
| 8 | Reconcile pricing definition files (no true duplicates found) | DONE | same commit as #7 |
| 9 | Full integrity verification (tsc clean, imports valid, no dead refs) | DONE | same commit as #7 |

### Deferred from Original Plan (Intentional)

| Item | Why Deferred | Impact |
|------|-------------|--------|
| `shared/schemas/leads.ts` — not created as a separate file | Lead schemas are embedded in `calculator.ts` as sub-schemas of `calculatorSettingsSchema` — splitting would break Zod composition | None — leads schemas are accessible via `shared/schemas/calculator.ts` |
| `server/routes/followupRoutes.ts` — not created | Followup endpoints live inside `dashboardRoutes.ts` (they're dashboard-scoped operations, not standalone) | None — endpoints work correctly |
| `.gitignore` update for junk patterns (PHASE1_PLAN Action 10) | Low priority — junk is already deleted | Trivial — can add later if junk recurs |
| `server/storage.ts` split into domain repositories | Deferred to Phase 3 — storage is consumed by routes and works fine as-is | None — no architectural blocker |

### Verification Summary

- `npx tsc --noEmit`: **0 new errors** (only pre-existing TS2688 for `node`/`vite/client` type defs)
- All 53 API endpoints preserved with identical paths and response shapes
- All 10 frozen file headers intact
- Zero dangling imports or dead references
- `_legacy.ts` and original `routes.ts` fully deleted

---

## B. CURRENT ARCHITECTURE SNAPSHOT

### Schemas (`shared/schemas/`)

```
shared/schemas/
├── index.ts            (7 lines)   — barrel re-export
├── pricing.ts          (148 lines) — CustomTradeData, Stage2Data, PricingIntake, AIDraft*, PricingDraft, PricingAuditLog
├── calculator.ts       (347 lines) — UITemplate, ConversionBlocks, CalculatorSettings (nests lead/followup/booking sub-schemas)
├── booking.ts          (21 lines)  — BookingSettings
└── db.ts               (280 lines) — 12 pgTable definitions, insert schemas, select types

shared/schema.ts        (4 lines)   — thin re-export: `export * from './schemas'`
```

### Routes (`server/routes/`)

```
server/routes/
├── index.ts              (32 lines)  — barrel: registers 9 modules + audit router
├── marketingRoutes.ts    (55 lines)  — robots.txt, sitemap, contact, pageview
├── aiRoutes.ts           (460 lines) — pricing generation, chat (demo/support/client), tickets
├── calculatorRoutes.ts   (323 lines) — CRUD, slug, lookup, duplicate, track-view
├── leadRoutes.ts         (277 lines) — create, list, coupon validation
├── dashboardRoutes.ts    (478 lines) — overview, leads, analytics, settings, followup, logs
├── domainRoutes.ts       (144 lines) — DNS check, SSL, status
├── bookingRoutes.ts      (332 lines) — availability, create, checkout, confirm
├── stripeRoutes.ts       (109 lines) — connect, callback, refresh, status
└── twilioRoutes.ts       (160 lines) — inbound webhook, messages, SMS status
```

### Template System

```
CANONICAL:  shared/templateLibrary.ts    (227 lines) — 6 layout templates, trade-to-template map
            ├── TemplateDefinition (with optional wizard_steps?: StepDefinition[])
            ├── TEMPLATE_LIBRARY[]
            ├── getTemplateById()
            └── getRecommendedTemplate()

DEPRECATED: client/src/config/templateConfig.ts (453 lines) — marketing demos only
            ├── @deprecated header
            ├── TemplateConfig (10 hardcoded trade demos)
            └── calculateEstimate() — simplified marketing formula (deprecated)
```

### Pricing Engine (Untouched — Production-Ready)

```
shared/pricingConfig.ts          (203 lines) — 10 pricing types, Zod discriminated union, validation
shared/calculateEstimate.ts      (235 lines) — config + inputs → breakdown + total
shared/pricingIntakeMapper.ts    (220 lines) — two-stage intake → PricingConfigV1 conversion
shared/sliderMappings.ts         (45 lines)  — 30+ field types → slider configs

client/src/config/pricing.ts     (207 lines) — SaaS product catalog (NOT trade pricing)
client/src/config/pricingPlans.ts (199 lines) — subscription tiers (NOT trade pricing)
```

### Wizard Schema Layer (New in Phase 1)

```
shared/wizardSchema.ts           (198 lines)
├── 9 QuestionTypes: slider, select, toggle, package_card, text_input, number_input, checkbox_group, radio_group, info_display
├── 9 StepTypes: question, multi_question, package_selection, addon_selection, info, price_reveal, lead_capture, booking, confirmation
├── QuestionDefinition — full question config with validation, visibility conditions, maps_to binding
├── StepDefinition — step with questions[], visible_when[], config
└── WizardFlow — versioned flow with steps[], settings (progress_style, back_nav, mobile_optimized)
```

### Frozen Legacy UI (10 files, 12,466 total lines)

```
PHASE 2 REBUILD TARGET:
  client/src/components/calculator/CalculatorWidget.tsx  (2,287 lines) — THE widget to replace

PHASE 3 REBUILD TARGETS:
  client/src/components/wizard/WizardCard.tsx              (1,892 lines)
  client/src/components/wizard/DesignStudio.tsx             (2,145 lines)
  client/src/components/wizard/TestGateStep.tsx             (1,074 lines)
  client/src/components/wizard/PublishStep.tsx              (1,632 lines)
  client/src/components/wizard/CustomTradeQuestionnaire.tsx   (880 lines)
  client/src/components/wizard/PricingIntakeStage2.tsx        (491 lines)
  client/src/components/wizard/LeadFormStep.tsx               (543 lines)
  client/src/pages/dashboard.tsx                           (1,937 lines)
  client/src/pages/edit-calculator.tsx                       (586 lines)
```

### Preserved Shared Files (Zero Changes Needed)

```
shared/slugUtils.ts              (38 lines)
shared/models/chat.ts            (34 lines)
client/src/components/calculator/SliderField.tsx  (155 lines) — reusable in Phase 2
client/src/lib/queryClient.ts    (58 lines)
client/src/hooks/*               (all clean)
client/src/theme/*               (all clean — widgetTheme.ts directly relevant to Phase 2)
client/src/components/ui/*       (45 shadcn/ui components)
client/src/config/planGating.ts  (78 lines)
client/src/data/trades.ts        (~200 lines)
server/db.ts, server/auth.ts, server/storage.ts, server/bookingEmails.ts
server/twilioClient.ts, server/jobs/*
```

---

## C. PHASE 2 READINESS

### Ready: YES

All prerequisites are met:

| Prerequisite | Status |
|-------------|--------|
| Wizard step schema exists (`wizardSchema.ts`) | YES — 9 question types, 9 step types, validation, visibility conditions |
| Template system accepts step definitions | YES — `wizard_steps?: StepDefinition[]` on `TemplateDefinition` |
| Pricing engine is clean and importable | YES — `calculateEstimate()` + `PricingConfigV1` + `validatePricingConfig()` |
| Slider mappings are clean and importable | YES — `getSliderConfig()` + `shouldUseSlider()` |
| Widget theme system is clean | YES — `getWidgetTheme()` in `client/src/theme/widgetTheme.ts` |
| Route modules accept new endpoints | YES — modular route barrel pattern |
| Frozen widget exists as reference for feature requirements | YES — 2,287-line `CalculatorWidget.tsx` documents every feature |
| No circular dependencies blocking new imports | YES — verified clean |

### Blockers: NONE

---

## D. PHASE 2 SCOPE

### WILL Include

| # | Deliverable | Description |
|---|------------|-------------|
| 1 | Schema-driven step renderer | Core engine: reads `StepDefinition[]` → renders correct step component |
| 2 | Atomic question components | `SliderQuestion`, `SelectQuestion`, `ToggleQuestion`, `TextInputQuestion`, `NumberInputQuestion`, `CheckboxGroupQuestion`, `RadioGroupQuestion`, `PackageCardQuestion`, `InfoDisplay` |
| 3 | Step type components | `QuestionStep`, `MultiQuestionStep`, `PackageSelectionStep`, `AddonSelectionStep`, `InfoStep`, `PriceRevealStep`, `LeadCaptureStep`, `BookingStep`, `ConfirmationStep` |
| 4 | Widget state management | Single `useWidgetState()` hook or context replacing 42+ useState calls |
| 5 | Price calculation integration | Wire `calculateEstimate()` into the step renderer via `maps_to` bindings |
| 6 | Lead capture flow | Schema-driven lead form that submits to `POST /api/leads` |
| 7 | Price reveal UX | Animated price reveal component reading from `EstimateResult` |
| 8 | Add-on / package support | Interactive add-on toggles and package card selection |
| 9 | Template-driven layout | Renderer reads `TemplateDefinition` to choose layout (single_page, multi_step, two_column) |
| 10 | New `QuoteWidget` entry point | Drop-in replacement component consumed by `calculator.tsx` page |
| 11 | Coupon validation | Preserve existing coupon flow from frozen widget |
| 12 | Trust/social proof blocks | Render testimonials, badges, images from `calculator_settings.conversion` |
| 13 | Mobile responsiveness | Schema setting `mobile_optimized` drives responsive behavior |
| 14 | Embed mode support | `isEmbed` prop support for iframe embedding |

### Will NOT Include

| # | Excluded Item | Why |
|---|--------------|-----|
| 1 | Builder wizard rebuild (WizardCard) | Phase 3 |
| 2 | DesignStudio rebuild | Phase 3 |
| 3 | Dashboard rebuild | Phase 3 |
| 4 | AI chat bubble rewrite | Phase 4 |
| 5 | AI pricing agent changes | Phase 4 |
| 6 | Server-side route logic changes | Routes are correct — only the client widget is rebuilt |
| 7 | Database schema changes | JSONB columns absorb new schema shapes |
| 8 | Authentication changes | Phase 4 |
| 9 | Marketing page changes | Out of scope |
| 10 | Pricing engine logic changes | Engine is correct — we only wire it differently |
| 11 | New npm dependencies (XState, Zustand, etc.) | Use React context + useReducer |
| 12 | Booking calendar rebuild | Preserve booking integration; detailed UX polish in Phase 4 |

---

## E. PHASE 2 FILE/FOLDER PLAN

### New Folders to Create

```
client/src/components/quote-widget/           — top-level widget module
client/src/components/quote-widget/steps/     — step type components
client/src/components/quote-widget/questions/  — atomic question components
client/src/components/quote-widget/layout/     — layout wrappers (single, multi-step, two-column)
client/src/components/quote-widget/blocks/     — trust badges, testimonials, social proof
```

### New Files to Create

```
CORE ENGINE:
  client/src/components/quote-widget/QuoteWidget.tsx          — entry point, replaces CalculatorWidget
  client/src/components/quote-widget/StepRenderer.tsx          — reads StepDefinition → renders correct step component
  client/src/components/quote-widget/WidgetContext.tsx          — state context + useReducer (replaces 42 useState)
  client/src/components/quote-widget/useWidgetState.ts         — convenience hook wrapping context
  client/src/components/quote-widget/types.ts                  — widget-local type definitions

STEP COMPONENTS:
  client/src/components/quote-widget/steps/QuestionStep.tsx           — single question step
  client/src/components/quote-widget/steps/MultiQuestionStep.tsx      — multiple questions on one screen
  client/src/components/quote-widget/steps/PackageSelectionStep.tsx   — package card selection
  client/src/components/quote-widget/steps/AddonSelectionStep.tsx     — add-on toggles
  client/src/components/quote-widget/steps/PriceRevealStep.tsx        — animated price reveal
  client/src/components/quote-widget/steps/LeadCaptureStep.tsx        — lead form + submission
  client/src/components/quote-widget/steps/BookingStep.tsx            — booking availability + selection
  client/src/components/quote-widget/steps/ConfirmationStep.tsx       — thank-you / confirmation
  client/src/components/quote-widget/steps/InfoStep.tsx               — informational display step

QUESTION COMPONENTS:
  client/src/components/quote-widget/questions/SliderQuestion.tsx       — wraps existing SliderField
  client/src/components/quote-widget/questions/SelectQuestion.tsx       — dropdown/card select
  client/src/components/quote-widget/questions/ToggleQuestion.tsx       — yes/no toggle
  client/src/components/quote-widget/questions/TextInputQuestion.tsx    — free-text input
  client/src/components/quote-widget/questions/NumberInputQuestion.tsx  — numeric input
  client/src/components/quote-widget/questions/CheckboxGroupQuestion.tsx — multi-select checkboxes
  client/src/components/quote-widget/questions/RadioGroupQuestion.tsx   — single-select radio
  client/src/components/quote-widget/questions/PackageCardQuestion.tsx  — tiered package cards
  client/src/components/quote-widget/questions/InfoDisplay.tsx          — read-only info block

LAYOUT:
  client/src/components/quote-widget/layout/SinglePageLayout.tsx    — scrollable single-page
  client/src/components/quote-widget/layout/MultiStepLayout.tsx     — step-by-step with progress
  client/src/components/quote-widget/layout/TwoColumnLayout.tsx     — inputs left, summary right
  client/src/components/quote-widget/layout/ProgressBar.tsx         — step progress indicator
  client/src/components/quote-widget/layout/StickySummary.tsx       — live price summary sidebar

BLOCKS:
  client/src/components/quote-widget/blocks/TrustBadges.tsx        — trust/certification badges
  client/src/components/quote-widget/blocks/Testimonials.tsx       — customer testimonials
  client/src/components/quote-widget/blocks/ImageGallery.tsx       — work portfolio images

SHARED SCHEMA ADDITIONS:
  shared/widgetFlowBuilder.ts                                      — builds WizardFlow from PricingConfigV1 + TemplateDefinition
```

### Old Frozen Files — DO NOT TOUCH

```
client/src/components/calculator/CalculatorWidget.tsx    — remains frozen, stays in tree
client/src/components/wizard/WizardCard.tsx               — Phase 3
client/src/components/wizard/DesignStudio.tsx              — Phase 3
client/src/components/wizard/TestGateStep.tsx              — Phase 3
client/src/components/wizard/PublishStep.tsx               — Phase 3
client/src/components/wizard/CustomTradeQuestionnaire.tsx  — Phase 3
client/src/components/wizard/PricingIntakeStage2.tsx       — Phase 3
client/src/components/wizard/LeadFormStep.tsx              — Phase 3
client/src/pages/dashboard.tsx                            — Phase 3
client/src/pages/edit-calculator.tsx                       — Phase 3
```

### Temporary Adapter Needed

```
client/src/pages/calculator.tsx — the ONLY file that changes in the existing tree.
  Current: imports CalculatorWidget
  Phase 2: imports QuoteWidget (new), with feature flag fallback to CalculatorWidget

  // Adapter pattern:
  // const Widget = useFeatureFlag('new_widget') ? QuoteWidget : CalculatorWidget;
  // OR: simply swap the import after validation and before Phase 2 merge
```

---

## F. FIRST 10 PHASE 2 IMPLEMENTATION ACTIONS

### Action 1: Create folder structure + types
- Create all 4 directories under `quote-widget/`
- Create `types.ts` with widget state interface, action types, step navigation types
- Create `WidgetContext.tsx` with React context + `useReducer` skeleton
- Create `useWidgetState.ts` convenience hook
- **Depends on:** nothing
- **Validates with:** `tsc --noEmit`

### Action 2: Build `widgetFlowBuilder.ts`
- New file: `shared/widgetFlowBuilder.ts`
- Function: `buildWidgetFlow(pricingConfig: PricingConfigV1, template: TemplateDefinition, settings: CalculatorSettings): WizardFlow`
- Reads pricing config type → generates appropriate question steps
- Reads template → determines layout and step ordering
- Reads calculator_settings → adds lead capture, booking, trust blocks as steps
- Uses `sliderMappings.ts` for slider question defaults
- **Depends on:** wizardSchema.ts, pricingConfig.ts, templateLibrary.ts, calculatorSettings schema
- **Validates with:** unit-testable pure function

### Action 3: Build atomic question components (all 9)
- One component per question type from `wizardSchema.ts`
- Each reads `QuestionDefinition` + current value + `onChange` callback
- `SliderQuestion` wraps existing `SliderField.tsx`
- All use `widgetTheme` for styling
- **Depends on:** types.ts, SliderField.tsx, widgetTheme.ts
- **Validates with:** render each in isolation with mock QuestionDefinition

### Action 4: Build `StepRenderer.tsx`
- Switch on `StepDefinition.type` → render correct step component
- Handles visibility conditions (`visible_when`)
- Passes question definitions to atomic components
- Manages per-step answer collection
- **Depends on:** Action 3 (question components), wizardSchema types
- **Validates with:** render a mock 3-step flow

### Action 5: Build step components — QuestionStep, MultiQuestionStep, InfoStep
- `QuestionStep`: renders single question via StepRenderer routing
- `MultiQuestionStep`: renders N questions vertically
- `InfoStep`: read-only informational content
- **Depends on:** Action 4 (StepRenderer), Action 3 (questions)
- **Validates with:** mock step definitions

### Action 6: Build PriceRevealStep + price calculation wiring
- Import `calculateEstimate` from `shared/calculateEstimate.ts`
- Map widget answers → `EstimateInputs` using `maps_to` bindings from questions
- Render animated price reveal with breakdown lines
- Handle `call_for_quote` and `price_range_only` result types
- **Depends on:** Action 1 (state), calculateEstimate.ts, pricingConfig.ts
- **Validates with:** mock PricingConfigV1 → verify correct estimate output

### Action 7: Build PackageSelectionStep + AddonSelectionStep
- `PackageSelectionStep`: tiered package cards with highlight/badge
- `AddonSelectionStep`: toggle-able add-on list with price impact
- Both update widget state and feed into price calculation
- **Depends on:** Action 6 (price wiring), Action 3 (PackageCardQuestion)
- **Validates with:** mock tiered_packages and addon configs

### Action 8: Build LeadCaptureStep
- Schema-driven lead form fields (name, email, phone, company)
- Reads field config from `calculator_settings.lead_form`
- Submits to `POST /api/leads` via `apiRequest`
- Handles coupon validation via `GET /api/leads/validate-coupon`
- SMS consent toggle
- **Depends on:** Action 1 (state), queryClient.ts, lead routes
- **Validates with:** submit to actual API endpoint

### Action 9: Build layout components + QuoteWidget entry point
- `SinglePageLayout`, `MultiStepLayout`, `TwoColumnLayout`
- `ProgressBar` for multi-step
- `StickySummary` for two-column
- `QuoteWidget.tsx` — top-level component:
  1. Receives `calculator` prop (same shape as CalculatorWidget)
  2. Calls `buildWidgetFlow()` to generate WizardFlow
  3. Wraps children in `WidgetContext.Provider`
  4. Selects layout from template
  5. Renders `StepRenderer` inside layout
- **Depends on:** Actions 1-8
- **Validates with:** render full widget with real calculator data

### Action 10: Build trust blocks + wire into calculator.tsx
- `TrustBadges`, `Testimonials`, `ImageGallery` — read from `calculator_settings.conversion`
- `BookingStep` — wraps existing booking availability API
- `ConfirmationStep` — thank-you screen
- Update `calculator.tsx` to import `QuoteWidget` instead of `CalculatorWidget`
- Keep `CalculatorWidget` frozen in tree as fallback
- **Depends on:** Action 9
- **Validates with:** full end-to-end: load calculator by slug → step through → submit lead

---

## G. PHASE 2 RISKS

### 1. PricingConfigV1 → WizardFlow mapping complexity (HIGH)

**Risk:** `PricingConfigV1` has 10 pricing types with different shapes. The `buildWidgetFlow()` function must generate sensible question sequences for each type. Getting this mapping wrong means the widget asks wrong questions or produces wrong estimates.

**Mitigation:** Build `widgetFlowBuilder.ts` early (Action 2). Test each of the 10 pricing types with a unit test that generates a flow and verifies the output steps make sense. Use the frozen `CalculatorWidget.tsx` lines 76-100 as the reference for what inputs each pricing type needs.

### 2. Feature parity gap with frozen CalculatorWidget (MEDIUM)

**Risk:** The frozen widget has 42 state variables representing 42 features. Missing any of them means the new widget is a regression. Specific features at risk of being missed: quote expiration countdown, coupon flow, SMS consent checkbox, after-hours toggle, embed sizing, booking calendar integration.

**Mitigation:** Extract a complete feature checklist from CalculatorWidget's state declarations (lines 44-75) before writing any component code. Track each feature as a checkbox. Do not merge until 100% coverage.

### 3. Layout/theme mismatch (MEDIUM)

**Risk:** The frozen widget uses `getWidgetTheme()` with per-calculator accent colors and theme overrides. The new components must reproduce the same visual treatment or customers will notice a regression.

**Mitigation:** Import and use `widgetTheme.ts` from day one. Build components with theme tokens, not hardcoded colors. Visual comparison test: render both old and new widgets side-by-side with the same calculator data.

### 4. Calculator settings schema depth (LOW-MEDIUM)

**Risk:** `CalculatorSettings` (347-line schema in `shared/schemas/calculator.ts`) has deeply nested config: `appearance`, `layout`, `conversion`, `integrations`, `lead_form`, `followup`, `booking`, `ai_employee`, `quote_rules`. The new widget must read all relevant sections correctly.

**Mitigation:** The schema is already well-defined in Zod. Use TypeScript types derived from the schema to ensure compile-time correctness. Build `widgetFlowBuilder.ts` to translate nested settings into flat step/question definitions.

### 5. Switchover timing — running two widgets in parallel (LOW)

**Risk:** During development, both `CalculatorWidget` (frozen) and `QuoteWidget` (new) exist. If we swap too early, users see a broken widget. If we swap too late, we're maintaining two systems.

**Mitigation:** Keep the swap localized to one line in `calculator.tsx`. Develop the new widget in isolation using a `/dev/quote-widget` test route. Only swap the import in the final action after full validation. The frozen widget remains in the tree as instant rollback.
