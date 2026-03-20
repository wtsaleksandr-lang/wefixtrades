# Phase 2: Surgical File-Level Extraction Map

---

## A. PRESERVE AS-IS

These files require zero changes and can be copied directly into the rebuild.

| # | File | Lines | What It Does | Why It's Valuable |
|---|------|-------|-------------|-------------------|
| 1 | `shared/pricingConfig.ts` | 204 | Zod discriminated union of 10 pricing families + validation + fallback | Best code in the codebase. Type-safe, composable, zero dependencies beyond Zod |
| 2 | `shared/calculateEstimate.ts` | 236 | Core pricing engine: config + inputs → breakdown + total | Clean pipeline: validate → switch(type) → applyModifiers → result. Only depends on pricingConfig.ts |
| 3 | `shared/sliderMappings.ts` | 46 | Maps 30+ field types to slider configs (min/max/step/suffix) | No dependencies. Direct input to schema-driven question rendering |
| 4 | `shared/slugUtils.ts` | 39 | Slug generation, validation, subdomain builder | No dependencies. Pure utility |
| 5 | `shared/models/chat.ts` | 35 | Drizzle schema for AI chat conversations + messages | Clean DB schema, cascade deletes, proper types |
| 6 | `client/src/lib/utils.ts` | 6 | `cn()` — clsx + tailwind-merge | Standard shadcn utility |
| 7 | `client/src/hooks/use-mobile.tsx` | 20 | Mobile viewport detection via matchMedia | Pure hook, no dependencies |
| 8 | `client/src/hooks/use-toast.ts` | 192 | Toast notification system with reducer pattern | Well-architected state management — ironically better than the wizard state |
| 9 | `client/src/config/planGating.ts` | 79 | Feature access control matrix by plan tier | Single source of truth for plan gating. Clean `canAccess()` API |
| 10 | `client/src/components/calculator/SliderField.tsx` | 155 | Custom slider with value bubble, color interpolation, debouncing | Reusable question input component. Only uses React hooks |
| 11 | `client/src/components/primitives/NavButton.tsx` | 113 | CSS-only animated navigation button | Zero JavaScript, pure CSS — keep as-is |
| 12 | `client/src/components/IconBadge.tsx` | 65 | Color-coded icon badge component | Pure presentation, zero business logic |
| 13 | All `client/src/components/ui/*.tsx` | ~4,746 | 45 shadcn/ui Radix components | Standard accessible UI primitives — universal building blocks |

**Total: ~5,936 lines preserved as-is**

---

## B. PRESERVE WITH LIGHT REFACTOR

These files have real value but need targeted cleanup before they fit the new architecture.

| # | File | Lines | What It Does | What Needs Refactoring | Effort |
|---|------|-------|-------------|----------------------|--------|
| 1 | `shared/schema.ts` | 765 | Master Zod schemas: calculator settings, DB tables, intake types, all config shapes | **Split into domain files:** `shared/schemas/pricing.ts`, `shared/schemas/calculator.ts`, `shared/schemas/booking.ts`, `shared/schemas/db.ts`. The schemas themselves are good — the file is just too large. Also remove vestigial `test_history` schema (lines 465-486) if unused | Small |
| 2 | `shared/templateLibrary.ts` | 165 | 6 template definitions + trade-to-template mapping | **Extend** to include wizard step definitions per template. The existing template configs (sticky_summary, show_breakdown, layout_style) are correct — add `steps[]` array for schema-driven rendering | Small |
| 3 | `shared/pricingIntakeMapper.ts` | 221 | Two-stage intake → PricingConfigV1 conversion | **Fix**: Remove `as any[]` type coercions (line ~191-192). Deduplicate the repeated per_unit/per_sqft/per_linear_ft branches. Extract `buildSharedFields()` helper. Logic itself is correct | Small |
| 4 | `server/storage.ts` | 619 | Drizzle ORM data access layer with IStorage interface | **Split** into domain repositories: `CalculatorRepository`, `LeadRepository`, `BookingRepository`. Keep query logic — just reorganize | Medium |
| 5 | `server/auth.ts` | 74 | pbkdf2 password hashing + Passport local strategy + RBAC middleware | **Keep logic**, add token refresh mechanism later. Current 7-day edit_token is functional for now | Small |
| 6 | `server/db.ts` | 14 | PostgreSQL + Drizzle ORM connection | Add connection pool config options. Otherwise fine | Trivial |
| 7 | `server/index.ts` | 118 | Express entry point + middleware | **Refactor** to import route modules after routes.ts split | Small |
| 8 | `server/bookingEmails.ts` | 102 | HTML email templates for booking confirmations | **Extract** HTML templates to template files. Logic is correct | Small |
| 9 | `server/jobs/scheduler.ts` | 114 | Cron job orchestrator | **Extract** hardcoded intervals to config constants. Logic is sound | Trivial |
| 10 | `server/jobs/aggregation.ts` | 50 | Daily analytics rollup | **Extract** 7-day window to config. Otherwise clean | Trivial |
| 11 | `client/src/lib/queryClient.ts` | 58 | React Query setup + API request helpers | **Fix** `staleTime: Infinity` to proper cache invalidation. Add structured error types | Small |
| 12 | `client/src/data/trades.ts` | ~200 | 8 categories, 100+ trade types | **Extend** with per-trade wizard step overrides and default pricing types. The catalog itself is correct | Small |
| 13 | `client/src/theme/tokens.ts` | 198 | Design system: colors, typography, shadows, transitions | **Remove** effortel-specific palette entries. Core token system is excellent | Trivial |
| 14 | `client/src/theme/platformTheme.ts` | 83 | Dashboard theme derived from tokens | Fine as-is after tokens cleanup | Trivial |
| 15 | `client/src/theme/widgetTheme.ts` | 71 | Per-widget theme with accent color → RGBA conversion | Clean, reusable. May add new widget-specific tokens later | Trivial |
| 16 | `client/src/config/templateConfig.ts` | 436 | 10 demo template configs with inputs + client-side formula engine | **Reconcile** with `shared/templateLibrary.ts` — currently TWO template systems exist. Merge the `TemplateInput` schema here with the `TemplateDefinition` in shared. This file's `calculateEstimate()` duplicates the shared pricing engine | Medium |
| 17 | `client/src/config/pricingPlans.ts` | ~100 | SaaS plan definitions (Free, Starter, Pro, Elite) | **Reconcile** with `config/pricing.ts` — currently TWO pricing definition files exist. Merge or clearly separate scope | Small |
| 18 | `client/src/config/pricing.ts` | 204 | Product catalog (10 products) with monthly/setup pricing | See above — deduplicate with pricingPlans.ts | Small |

**Total: ~3,637 lines needing light refactor**

---

## C. REFERENCE ONLY

These files contain salvageable ideas, logic fragments, or UI patterns but should NOT be used as architectural foundations. Read them for requirements extraction, then build fresh.

| # | File | Lines | What to Salvage | Why Not Build On |
|---|------|-------|----------------|-----------------|
| 1 | `client/src/components/wizard/WizardCard.tsx` | 1,889 | **Salvage:** WizardState interface shape (lines 38-54) — documents what config the wizard needs to collect. Step sequence logic — documents the builder flow. localStorage save/load pattern (lines 82-104) — useful for persistence strategy. AI draft polling pattern (lines where draftJobId is used) | **Kill:** 15 useState hooks in one component. Hardcoded 6-step switch statement. Business logic (pricing intake mapping, template recommendation) embedded in render. Manual state spreading `setWs(prev => ({...prev, field: val}))` on every keystroke. Cannot support dynamic steps |
| 2 | `client/src/components/calculator/CalculatorWidget.tsx` | 2,284 | **Salvage:** Feature requirements list (42 state variables = 42 features the widget must support). Coupon validation flow (lines ~66-70). Quote expiration countdown logic (lines ~72-74). Booking availability fetching. Multi-step index logic. Trust badge/testimonial/image gallery rendering patterns | **Kill:** 42 useState hooks. Pricing interpretation spread across 100+ lines of setup (lines 76-100). Lead form, booking calendar, coupon UI, expiration timer, trust badges ALL in one render. 2,284 lines with zero separation of concerns |
| 3 | `client/src/components/wizard/DesignStudio.tsx` | 2,143 | **Salvage:** The 5 tab categories (Appearance, Layout, Conversion Blocks, Integrations, Automation) — these define the builder's design customization scope. Individual field UIs for color pickers, font selectors, toggle groups | **Kill:** 2,143-line single component. Tab content should be separate components. Settings update callbacks are reasonable but should use a context/reducer pattern |
| 4 | `client/src/components/wizard/TestGateStep.tsx` | 1,073 | **Salvage:** 3-scenario testing pattern (small/typical/large job). Deviation calculation logic. Accuracy scoring algorithm. Refinement question flow | **Kill:** 16+ useState hooks. Calculation logic mixed with UI. Should be: `usePricingTest()` hook + `TestScenarioCard` component + `DeviationChart` component |
| 5 | `client/src/components/wizard/PublishStep.tsx` | 1,631 | **Salvage:** 4-tab publish flow (Hosted/Embed/Custom Domain/Install). DNS checking logic. Embed code generation. AI employee config form structure | **Kill:** 1,631 lines mixing domain management, embed code generation, AI config, and publishing state. Each tab should be its own component module |
| 6 | `client/src/components/wizard/CustomTradeQuestionnaire.tsx` | 879 | **Salvage:** The question flow for pricing intake Stage 1 (charge method, minimums, trip fees, packages, price factors). Good accessibility (data-testid) | **Kill:** Tightly coupled to WizardCard's state shape via props. Should read from a form schema, not hardcoded JSX |
| 7 | `client/src/components/wizard/PricingIntakeStage2.tsx` | 490 | **Salvage:** Conditional rendering by charge method — shows different fields for hourly vs sqft vs per_unit. Clean pure-presentational approach (zero hooks) | **Kill:** Field set is hardcoded. Should render from schema based on selected charge_method |
| 8 | `client/src/components/wizard/LeadFormStep.tsx` | 542 | **Salvage:** Lead form field toggle pattern (name, phone, email, address, etc.). Delivery config (primary email, webhook). Spam settings (honeypot, reCAPTCHA). Consent text config | **Kill:** Validation mixed into component. Should be schema-driven field configuration |
| 9 | `client/src/pages/dashboard.tsx` | 1,937 | **Salvage:** Dashboard layout structure. Analytics display patterns. Navigation architecture | **Kill:** Another god-component. 1,937 lines handling navigation, overview, leads, analytics, settings, followup config, booking management all in one file |
| 10 | `client/src/pages/edit-calculator.tsx` | 586 | **Salvage:** Edit-mode calculator interface pattern. Shows how builder and preview coexist | **Kill:** Should be rebuilt as the proper builder product with live preview |
| 11 | `server/routes.ts` | 2,293 | **Salvage:** ALL endpoint signatures and business logic. This is the API contract. Every route path, every validation call, every storage operation | **Kill:** 2,293 lines in ONE file. Must be split. But the actual route logic is mostly correct |
| 12 | `server/aiChatEngine.ts` | 507 | **Salvage:** Tool-based function calling architecture (estimate, booking, leads). Three agent mode concept | **Kill:** Hardcoded TRADE_PRESETS (lines 14-24). Hardcoded DEMO_SLOTS. Agent types should read from calculator config, not code constants |
| 13 | `server/aiPricingAgent.ts` | 478 | **Salvage:** Constraint-based AI pricing generation concept. Derivation logic. Confidence scoring | **Kill:** Few-shot examples hardcoded in system prompts. Constraints defined in prose, not enforced structurally |
| 14 | `client/src/components/ai/AIChatBubble.tsx` | 299 | **Salvage:** Floating chat bubble UX pattern. Mobile-responsive overlay | **Kill:** Manual fetch instead of React Query. Trial expiration logic inline. 8 useState hooks for a chat widget |

**Total: ~16,970 lines as reference only**

---

## D. REMOVE / ARCHIVE / IGNORE

### D1. DELETE IMMEDIATELY (Junk/Debug — ~75 MB)

| # | Path | Why |
|---|------|-----|
| 1 | `bento-debug/` (13 MB) | Debug screenshots |
| 2 | `mobile-debug/` (20 MB) | Debug screenshots |
| 3 | `sticky-cards-debug/` (7.6 MB) | Debug screenshots |
| 4 | `scroll-recording/` (7.7 MB) | Scroll position screenshots |
| 5 | `feature-cards-recording/` (5.8 MB) | Feature card screenshots |
| 6 | `effortel-extracted/` (2.7 MB) | Extracted reference site |
| 7 | `C:/` (18 MB) | Windows-path artifacts with extracted sites (supersonik, greptile, ventriloc, doss) |
| 8 | `attached_assets/` (19 MB) | 50+ clipboard paste snippets from Replit |
| 9 | `bento-debug.mjs` | Debug script |
| 10 | `mobile-debug-script.mjs` | Debug script |
| 11 | `sticky-cards-debug-script.mjs` | Debug script |
| 12 | `effortel-ref.cjs` | Reference scraper |
| 13 | `effortel-scrape.mjs` | Web scraper |
| 14 | `extract-sites.cjs` | Site extraction utility |
| 15 | `record-feature-cards.mjs` | Recording script |
| 16 | `scroll-recorder.mjs` | Recording script |
| 17 | All root-level `*.png` files (~20 files) | Verification screenshots |
| 18 | `AI_PROJECT_BRAIN/` | Stale AI project notes |
| 19 | `test-results/` | Stale test metadata |

### D2. ARCHIVE (Move to Separate Repo/Package)

| # | Path | Lines (approx) | Why |
|---|------|---------------|-----|
| 1 | `client/src/pages/marketing/home.tsx` | 729 | Marketing site — not wizard builder product |
| 2 | `client/src/pages/marketing/product.tsx` | 793 | Marketing site |
| 3 | `client/src/pages/marketing/pricing.tsx` | 490 | Marketing site |
| 4 | `client/src/pages/marketing/services.tsx` | 421 | Marketing site |
| 5 | `client/src/pages/marketing/FreeAudit.tsx` | 839 | Marketing site |
| 6 | `client/src/pages/marketing/bundles.tsx` | 306 | Marketing site |
| 7 | `client/src/pages/marketing/contact.tsx` | 281 | Marketing site |
| 8 | `client/src/pages/marketing/features/*.tsx` | ~1,500 | Marketing feature pages |
| 9 | `client/src/pages/marketing/docs/*.tsx` | ~800 | Marketing docs pages |
| 10 | `client/src/pages/marketing/privacy.tsx` | 163 | Legal page |
| 11 | `client/src/pages/marketing/terms.tsx` | 214 | Legal page |
| 12 | `client/src/pages/About.tsx` | 166 | Marketing page |
| 13 | `client/src/pages/Blog.tsx` | 142 | Marketing page |
| 14 | `client/src/pages/CaseStudies.tsx` | 171 | Marketing page |
| 15 | `client/src/pages/Resources.tsx` | 171 | Marketing page |
| 16 | `client/src/components/marketing/*.tsx` | ~5,478 | All marketing components (19 files) |
| 17 | `client/src/components/home/*.tsx` | ~414 | Homepage components |
| 18 | `client/src/components/sections/PillarAnimation.tsx` | 410 | Product showcase animation |
| 19 | `client/src/components/primitives/Logo.tsx` | 170 | Brand logo (keep if reused in product) |
| 20 | `client/src/hooks/useLenis.ts` | 44 | Smooth scroll — marketing only |
| 21 | `client/src/hooks/useScrollReveal.ts` | 66 | GSAP scroll reveal — marketing only |
| 22 | `client/src/hooks/usePageView.ts` | 12 | Analytics — keep if used in product |
| 23 | `client/src/lib/fx.ts` | 66 | CAD/USD conversion — marketing pricing only |
| 24 | `server/auditRoutes.ts` | 394 | Google Maps/PageSpeed audit — separate product |
| 25 | `server/replit_integrations/` | ~700 | Replit-specific audio/chat/image/batch routes |

**Total archived: ~13,400+ lines of marketing/non-product code**

### D3. STOP BUILDING ON (Freeze)

| # | File | Why |
|---|------|-----|
| 1 | `client/src/components/wizard/WizardCard.tsx` | Every line added increases rewrite cost |
| 2 | `client/src/components/calculator/CalculatorWidget.tsx` | Past the point of productive extension |
| 3 | `client/src/components/wizard/DesignStudio.tsx` | 2,143 lines, will need full decomposition |
| 4 | `client/src/pages/dashboard.tsx` | 1,937-line god-component |
| 5 | `client/src/pages/edit-calculator.tsx` | Will be replaced by proper builder |

---

## E. DEPENDENCY RISKS

### Clean Extraction Paths (No Risk)

```
shared/pricingConfig.ts          → depends on: zod (external only)
shared/calculateEstimate.ts      → depends on: shared/pricingConfig.ts (clean)
shared/sliderMappings.ts         → depends on: nothing
shared/slugUtils.ts              → depends on: nothing
shared/templateLibrary.ts        → depends on: nothing
shared/models/chat.ts            → depends on: drizzle-orm (external only)
client/src/components/ui/*       → depends on: Radix UI (external only)
client/src/components/calculator/SliderField.tsx → depends on: React only
```

**Verdict: All preserve-as-is files extract cleanly with zero entanglements.**

### Tangled Dependencies (Manageable)

```
shared/schema.ts
  ├── imported by: server/routes.ts, server/storage.ts, server/aiPricingAgent.ts,
  │                server/aiChatEngine.ts, server/twilioClient.ts, server/bookingEmails.ts,
  │                server/jobs/notificationWorker.ts
  ├── imported by: client WizardCard, DesignStudio, CustomTradeQuestionnaire,
  │                PricingIntakeStage2, LeadFormStep, PublishStep
  └── risk: NONE — schema.ts has no imports from client or server code.
            It only depends on drizzle-orm, drizzle-zod, and zod.
            Splitting it into domain files is safe.

shared/pricingIntakeMapper.ts
  ├── depends on: shared/schema.ts (types only), shared/pricingConfig.ts
  ├── imported by: client WizardCard, server routes
  └── risk: LOW — clean dependencies, extractable

server/routes.ts
  ├── depends on: EVERYTHING (schema, pricingConfig, slugUtils, storage, auth,
  │                aiChatEngine, aiPricingAgent, bookingEmails, twilioClient,
  │                Stripe, OpenAI)
  └── risk: This file is a dependency SINK, not a source.
            Splitting it will not break anything that depends on it.
```

### Dangerous Coupling (Watch For)

```
client/src/config/templateConfig.ts
  ├── has its OWN calculateEstimate() function (duplicates shared/calculateEstimate.ts)
  ├── has its OWN TemplateConfig type (partially overlaps shared/templateLibrary.ts TemplateDefinition)
  └── risk: TWO parallel template/pricing systems. Must reconcile before rebuild.
            Used by: demo pages, template gallery

client/src/config/pricingPlans.ts + client/src/config/pricing.ts
  ├── TWO files defining product/plan pricing
  └── risk: Drift. Must merge or clearly delineate scope.
```

---

## F. FUTURE ARCHITECTURE MAPPING

### A. Core Domain / Pricing Engine

| Current File | Status | Notes |
|-------------|--------|-------|
| `shared/pricingConfig.ts` | READY | No changes needed |
| `shared/calculateEstimate.ts` | READY | No changes needed |
| `shared/pricingIntakeMapper.ts` | NEEDS REFACTOR | Deduplicate branches, fix type coercions |

### B. Wizard Schema / Config Layer

| Current File | Status | Notes |
|-------------|--------|-------|
| `shared/schema.ts` (calculatorSettingsSchema) | NEEDS REFACTOR | Split by domain. Extend with wizard step definitions |
| `shared/schema.ts` (customTradeDataSchema, stage2DataSchema) | READY | Intake schemas are well-designed |
| **NEW: `shared/wizardSchema.ts`** | NEEDS BUILD | Define step types, question types, validation rules, conditional logic as JSON schema |

### C. Template Library

| Current File | Status | Notes |
|-------------|--------|-------|
| `shared/templateLibrary.ts` | NEEDS REFACTOR | Extend with step definitions per template |
| `shared/sliderMappings.ts` | READY | Input configs for dynamic question rendering |
| `client/src/config/templateConfig.ts` | NEEDS REBUILD | Merge with shared/templateLibrary.ts. Remove duplicate calculateEstimate |
| `client/src/data/trades.ts` | NEEDS REFACTOR | Add per-trade wizard step overrides |

### D. Public Quote Widget (Customer-Facing)

| Current File | Status | Notes |
|-------------|--------|-------|
| `client/src/components/calculator/CalculatorWidget.tsx` | NEEDS REBUILD | Decompose into WizardShell + StepRenderer + question components + result display |
| `client/src/components/calculator/SliderField.tsx` | READY | First question component |
| **NEW: Question components** | NEEDS BUILD | SelectQuestion, ToggleQuestion, PackageCardQuestion, TextInputQuestion |
| **NEW: WizardShell** | NEEDS BUILD | Progress bar + step navigation + state machine |
| **NEW: StepRenderer** | NEEDS BUILD | Reads step schema → renders appropriate question component |

### E. Builder / Editor

| Current File | Status | Notes |
|-------------|--------|-------|
| `client/src/components/wizard/WizardCard.tsx` | NEEDS REBUILD | Replace with schema-editing builder, not hardcoded steps |
| `client/src/components/wizard/DesignStudio.tsx` | NEEDS REBUILD | Decompose tabs into modules |
| `client/src/components/wizard/TestGateStep.tsx` | NEEDS REBUILD | Extract pricing test into hook + components |
| `client/src/components/wizard/PublishStep.tsx` | NEEDS REBUILD | Split publish/embed/domain/AI into modules |
| `client/src/components/wizard/CustomTradeQuestionnaire.tsx` | NEEDS REBUILD | Replace with schema-driven form |
| `client/src/components/wizard/PricingIntakeStage2.tsx` | NEEDS REBUILD | Replace with schema-driven conditional form |
| `client/src/components/wizard/LeadFormStep.tsx` | NEEDS REBUILD | Replace with field config editor |
| `client/src/pages/edit-calculator.tsx` | NEEDS REBUILD | Rebuild as proper builder with live preview |
| `client/src/pages/dashboard.tsx` | NEEDS REBUILD | Decompose into page modules |

### F. Shared UI Primitives

| Current File | Status | Notes |
|-------------|--------|-------|
| `client/src/components/ui/*.tsx` (45 files) | READY | Standard shadcn/ui — use as-is |
| `client/src/components/IconBadge.tsx` | READY | Reusable |
| `client/src/components/primitives/NavButton.tsx` | READY | Reusable |
| `client/src/theme/*.ts` (3 files) | READY | Design system tokens |
| `client/src/lib/utils.ts` | READY | cn() utility |
| `client/src/hooks/use-mobile.tsx` | READY | Viewport detection |
| `client/src/hooks/use-toast.ts` | READY | Toast system |

### G. API / Backend

| Current File | Status | Notes |
|-------------|--------|-------|
| `server/routes.ts` | NEEDS REFACTOR | Split into: calculatorRoutes, leadRoutes, bookingRoutes, aiRoutes, analyticsRoutes, stripeRoutes, dashboardRoutes |
| `server/storage.ts` | NEEDS REFACTOR | Split into domain repositories |
| `server/auth.ts` | NEEDS REFACTOR | Add token refresh |
| `server/aiChatEngine.ts` | NEEDS REFACTOR | Remove hardcoded TRADE_PRESETS, read from calculator config |
| `server/aiPricingAgent.ts` | NEEDS REFACTOR | Formalize constraints as schema, validate AI output |
| `server/bookingEmails.ts` | NEEDS REFACTOR | Extract HTML templates |
| `server/twilioClient.ts` | READY | Focused, clean |
| `server/jobs/*.ts` | NEEDS REFACTOR | Extract magic numbers to config |

### H. Persistence / Database

| Current File | Status | Notes |
|-------------|--------|-------|
| `server/db.ts` | READY | Drizzle + PostgreSQL connection |
| `shared/schema.ts` (DB tables) | READY | Tables are well-designed. JSONB fields support any config shape |
| `drizzle.config.ts` | READY | No changes needed |
| **No migration needed** | — | JSONB columns absorb schema evolution |

---

## G. STATE MANAGEMENT RED FLAGS

### Where State Currently Lives

| Location | Mechanism | Problem |
|----------|-----------|---------|
| `CalculatorWidget.tsx` | 42 `useState` hooks | Unmanageable. Quantity, tier, add-ons, lead form, booking, coupon, calendar, expiration — ALL independent `useState` calls. No way to snapshot, serialize, or replay state |
| `WizardCard.tsx` | 1 `useState<WizardState>` (14 fields) + manual spreading | Better than CalculatorWidget but still problematic. `setWs(prev => ({...prev, field: val}))` on every change. No validation on state transitions. No undo |
| `WizardCard.tsx` | `localStorage.getItem('qq_wizard')` / `setItem` | Manual JSON serialization on every state change. No debouncing. No versioning. No corruption recovery beyond try/catch |
| `DesignStudio.tsx` | Props + callbacks from WizardCard | All state lives in parent. 6 `useCallback` functions passed down. Works but creates tight coupling |
| `TestGateStep.tsx` | 16+ `useState` hooks | Scenario state, refinement state, accuracy scores — all independent hooks. Calculation logic mixed with state |
| `PublishStep.tsx` | 6+ `useState` hooks | Domain checking, embed tab, install mode — scattered state |
| `AIChatBubble.tsx` | 8 `useState` hooks | Chat messages, trial status, mobile detection — should be `useChat()` hook |
| `dashboard.tsx` | Uncounted but massive | Navigation, overview data, leads, analytics, settings, followup, booking — all in page-level state |

### Overloaded Files (State Density)

| File | useState Count | State Responsibility |
|------|---------------|---------------------|
| `CalculatorWidget.tsx` | 42 | estimate + lead + booking + coupon + expiration + calendar + UI |
| `TestGateStep.tsx` | 16+ | scenarios + accuracy + refinement + deviation |
| `WizardCard.tsx` | 15 | wizard flow + business config + AI draft + validation |
| `AIChatBubble.tsx` | 8 | chat + trial + mobile + loading |
| `PublishStep.tsx` | 6+ | tabs + domain + embed + DNS |

### Reusable Custom Hooks

| Hook | File | Verdict |
|------|------|---------|
| `use-toast.ts` | `client/src/hooks/use-toast.ts` | **KEEP** — well-designed reducer pattern, proper queue management |
| `use-mobile.tsx` | `client/src/hooks/use-mobile.tsx` | **KEEP** — clean matchMedia hook |
| `useLenis.ts` | `client/src/hooks/useLenis.ts` | **ARCHIVE** — marketing only (GSAP smooth scroll) |
| `useScrollReveal.ts` | `client/src/hooks/useScrollReveal.ts` | **ARCHIVE** — marketing only (GSAP scroll trigger) |
| `usePageView.ts` | `client/src/hooks/usePageView.ts` | **KEEP IF** used in product pages |

### What Must NOT Be Reused

1. **The `useState` explosion pattern** — Do not carry forward 42 independent `useState` hooks. Use `useReducer` or a state machine
2. **Manual localStorage serialization** — Replace with a proper persistence hook that handles versioning, debouncing, and corruption
3. **State-as-props drilling** — WizardCard passes its entire state + setters to child components. Replace with context or state machine
4. **Inline `setWs(prev => ({...prev, ...}))`** — This pattern makes every component a state mutation point with no validation

---

## H. API / BACKEND RED FLAGS

### File: `server/routes.ts` (2,293 lines)

**Endpoint Groups Currently Mixed Together:**

| Group | Endpoint Count | Lines (est.) | Domain |
|-------|---------------|-------------|--------|
| Marketing/SEO | 2 | ~30 | robots.txt, sitemap.xml |
| Contact | 1 | ~40 | POST /api/contact |
| AI Pricing | 4 | ~200 | generate-pricing, pricing-config-draft (create + poll), generate-pricing-draft |
| AI Chat | 4 | ~250 | demo-chat, support-chat, client-chat, create-ticket |
| Calculator CRUD | 7 | ~350 | create, check-slug, slugify, lookup, update, duplicate, track-view |
| Domain Management | 3 | ~150 | check-dns, issue-ssl, status |
| Leads | 6 | ~200 | create, list, dashboard list, delete, export CSV, update status, ai-pause |
| Coupons | 1 | ~50 | validate |
| Dashboard | 6 | ~250 | overview, analytics, track, settings update, republish, notification-logs |
| Followup | 3 | ~100 | get, update, test |
| Bookings | 5 | ~200 | availability, create, checkout, confirm, dashboard list, status update |
| Stripe | 4 | ~200 | connect, callback, refresh, status |
| SMS/Twilio | 3 | ~100 | inbound webhook, messages list, sms-status |
| Analytics | 1 | ~30 | pageview (currently a no-op) |

**Suggested Split:**

```
server/routes/
├── calculatorRoutes.ts   — CRUD + slug + duplicate + track-view
├── leadRoutes.ts         — create + list + delete + export + status
├── bookingRoutes.ts      — availability + create + checkout + confirm + status
├── aiRoutes.ts           — pricing generation + chat (demo/support/client)
├── dashboardRoutes.ts    — overview + analytics + settings + republish + notifications
├── stripeRoutes.ts       — connect + callback + refresh + status
├── twilioRoutes.ts       — inbound webhook + messages + sms-status
├── domainRoutes.ts       — check-dns + issue-ssl + status
├── followupRoutes.ts     — get + update + test
├── marketingRoutes.ts    — robots.txt + sitemap + contact
└── index.ts              — barrel export + route registration
```

### Reusable Service/Helper Files Behind Routes

| File | Lines | Reusable? |
|------|-------|-----------|
| `server/storage.ts` | 619 | YES — clean IStorage interface. Split into repos but keep logic |
| `server/auth.ts` | 74 | YES — password hashing + RBAC middleware |
| `server/twilioClient.ts` | 153 | YES — focused Twilio integration |
| `server/bookingEmails.ts` | 102 | YES — extract HTML templates, keep sending logic |
| `server/aiChatEngine.ts` | 507 | PARTIALLY — remove hardcoded presets, keep tool system |
| `server/aiPricingAgent.ts` | 478 | PARTIALLY — formalize constraints, keep derivation logic |
| `server/jobs/scheduler.ts` | 114 | YES — extract intervals to config |
| `server/jobs/aggregation.ts` | 50 | YES — simple and correct |
| `server/jobs/notificationWorker.ts` | 207 | YES — extract HTML templates, keep queue processing |
| `server/jobs/followupWorker.ts` | 231 | YES — extract HTML templates, keep template variable replacement |
| `server/jobs/weeklyReport.ts` | 154 | YES — extract HTML templates |

### Red Flags

1. **In-memory job queue** (`draftJobs = new Map()`) — Lost on restart. Replace with DB-backed or Redis-backed queue
2. **Hardcoded model names** — `"gpt-5-mini"` and `"gpt-5.1"` scattered in routes and AI engines
3. **Private IP detection duplicated** — notificationWorker.ts AND auditRoutes.ts both have the same SSRF protection code
4. **No rate limiting on API** — POST /api/calculators has no creation limit
5. **Analytics pageview endpoint is a no-op** — POST /api/analytics/pageview does nothing (lines 155-157)

---

## I. TOP 10 FILES TO INSPECT FIRST

In this exact order:

| # | File | Why First |
|---|------|----------|
| 1 | `shared/pricingConfig.ts` (204 lines) | Understand the pricing type system. This drives the entire product. Read every line |
| 2 | `shared/calculateEstimate.ts` (236 lines) | Understand the calculation pipeline. This is what customers interact with |
| 3 | `shared/schema.ts` (765 lines) | Understand the full config shape. This is your data model. Note the nesting depth and domain boundaries for the split |
| 4 | `shared/templateLibrary.ts` (165 lines) | Understand template definitions. This is where wizard step schemas will be added |
| 5 | `client/src/config/templateConfig.ts` (436 lines) | Understand the SECOND template system. This must be reconciled with #4. Note the `TemplateInput` interface — it's close to a wizard question schema |
| 6 | `shared/sliderMappings.ts` (46 lines) | Understand input configs. These feed directly into schema-driven question rendering |
| 7 | `client/src/components/wizard/WizardCard.tsx` lines 38-80 only | Read ONLY the WizardState interface and INITIAL_STATE. This documents what the builder collects. Skip the 1,800 lines of JSX |
| 8 | `client/src/components/calculator/CalculatorWidget.tsx` lines 1-100 only | Read ONLY the imports, interfaces, and state declarations. This documents what the customer widget must support. Skip the 2,100 lines of JSX |
| 9 | `shared/pricingIntakeMapper.ts` (221 lines) | Understand the Stage 1 → Stage 2 → Config pipeline. This is the builder's pricing flow |
| 10 | `client/src/config/planGating.ts` (79 lines) | Understand feature gating. Every builder feature check flows through `canAccess()` |

---

## J. MIGRATION PREP CHECKLIST

### Copy Forward (Into New Architecture)

- [ ] `shared/pricingConfig.ts` — as-is
- [ ] `shared/calculateEstimate.ts` — as-is
- [ ] `shared/sliderMappings.ts` — as-is
- [ ] `shared/slugUtils.ts` — as-is
- [ ] `shared/models/chat.ts` — as-is
- [ ] `client/src/components/ui/*.tsx` — all 45 shadcn files
- [ ] `client/src/components/calculator/SliderField.tsx` — as-is
- [ ] `client/src/components/IconBadge.tsx` — as-is
- [ ] `client/src/components/primitives/NavButton.tsx` — as-is
- [ ] `client/src/hooks/use-toast.ts` — as-is
- [ ] `client/src/hooks/use-mobile.tsx` — as-is
- [ ] `client/src/lib/utils.ts` — as-is
- [ ] `client/src/config/planGating.ts` — as-is
- [ ] `client/src/theme/tokens.ts` — remove effortel palette, keep rest
- [ ] `client/src/theme/platformTheme.ts` — as-is
- [ ] `client/src/theme/widgetTheme.ts` — as-is
- [ ] `server/db.ts` — as-is
- [ ] `server/auth.ts` — as-is
- [ ] `drizzle.config.ts` — as-is
- [ ] `package.json` — as-is (may prune GSAP/Lenis if marketing is separated)
- [ ] `tsconfig.json` — as-is
- [ ] `vite.config.ts` — as-is
- [ ] `tailwind.config.ts` — as-is

### Isolate (Before Touching)

- [ ] `shared/schema.ts` → Plan the domain split before editing
- [ ] `shared/templateLibrary.ts` → Design new step schema format before modifying
- [ ] `client/src/config/templateConfig.ts` → Decide how to merge with templateLibrary before editing
- [ ] `client/src/config/pricingPlans.ts` + `pricing.ts` → Decide single source of truth before editing
- [ ] `server/routes.ts` → Map all endpoints to new route files before splitting

### Freeze (Stop All Development)

- [ ] `client/src/components/wizard/WizardCard.tsx` — no new features
- [ ] `client/src/components/calculator/CalculatorWidget.tsx` — no new features
- [ ] `client/src/components/wizard/DesignStudio.tsx` — no new features
- [ ] `client/src/pages/dashboard.tsx` — no new features
- [ ] `client/src/pages/edit-calculator.tsx` — no new features

### Stop Editing Immediately

- [ ] Any file in `client/src/pages/marketing/` — do not invest in marketing pages
- [ ] Any file in `client/src/components/marketing/` — do not invest in marketing components
- [ ] Any root-level debug/recording scripts — do not use as development tools

---

## K. IMMEDIATE ACTION

The exact first 5 actions to take, in order, before any rebuild begins:

### Action 1: Delete All Junk (~75 MB)
Remove every file listed in Section D1. This is risk-free and immediately cleans up the repo. Run:
```
rm -rf bento-debug/ mobile-debug/ sticky-cards-debug/ scroll-recording/ feature-cards-recording/
rm -rf effortel-extracted/ "C:/" attached_assets/ AI_PROJECT_BRAIN/ test-results/
rm -f *.mjs *.cjs *.png
```

### Action 2: Read and Annotate the 5 Core Shared Files
Read these in order, noting exactly what each exports and how they interconnect:
1. `shared/pricingConfig.ts` — the pricing type system
2. `shared/calculateEstimate.ts` — the calculation engine
3. `shared/schema.ts` — the config data model
4. `shared/templateLibrary.ts` — the template system
5. `client/src/config/templateConfig.ts` — the SECOND template system (reconciliation target)

### Action 3: Design the Wizard Step Schema
Before writing any component code, design `shared/wizardSchema.ts`. This is the missing architectural layer. It should define:
- Step type (question, info, result, lead-capture)
- Question type (slider, select, toggle, package-card, text-input)
- Validation rules per question
- Conditional visibility (show step X only if answer to Y is Z)
- Step ordering and grouping

Use `client/src/config/templateConfig.ts`'s `TemplateInput` interface as a starting point — it already has `id`, `label`, `type`, `min`, `max`, `step`, `defaultValue`, `options[]`.

### Action 4: Split `shared/schema.ts` Into Domain Files
Create:
```
shared/schemas/
├── pricing.ts          — pricingIntakeSchema, stage2DataSchema, customTradeDataSchema, pricingDraftSchema, pricingAuditLogSchema
├── calculator.ts       — calculatorSettingsSchema (appearance, layout, conversion, integrations, followup, promotions, quote_rules, ai_employee, publish)
├── booking.ts          — bookingSettingsSchema, insertBookingSchema
├── db.ts               — all pgTable definitions + insert schemas + type exports
└── index.ts            — barrel re-export for backwards compatibility
```

### Action 5: Split `server/routes.ts` Into Domain Modules
Create the route file structure from Section H. Start with the cleanest extraction: `stripeRoutes.ts` (4 endpoints, self-contained) and `bookingRoutes.ts` (5 endpoints, clear domain). Then do calculatorRoutes, leadRoutes, etc. Keep a barrel `routes/index.ts` that registers all modules.
