# Architecture Audit: Quote/Estimate Wizard Codebase

**Date:** 2026-03-18
**Auditor:** Staff Engineer Forensic Review
**Scope:** Full codebase audit against target product architecture

---

## 1. EXECUTIVE VERDICT

The codebase is **structurally salvageable but architecturally misaligned** with the target product vision.

What exists today is a functional SaaS platform for single-calculator creation — NOT a wizard builder product. The pricing engine is genuinely good. The Zod schemas are solid. The Radix UI foundation is reusable. But the two most important components — `WizardCard.tsx` (1,889 lines) and `CalculatorWidget.tsx` (2,284 lines) — are monolithic god-components that violate every principle in the target architecture. They hardcode logic into UI, mix concerns aggressively, and cannot support schema-driven dynamic questions without a rewrite.

The current codebase was built as a "get it working" prototype. It got it working. But it was never architected for the product described in the target spec — a configurable, multi-trade, template-driven wizard builder with separate customer-facing and builder experiences.

**Bottom line:** The foundations (pricing engine, schemas, DB, UI primitives) are worth keeping. The wizard/calculator UI layer and state management are architectural dead ends that need to be rebuilt from scratch against a proper schema-driven architecture.

---

## 2. RECOMMENDED PATH

**SALVAGE PARTS, REBUILD CORE**

Specifically:
- **Keep** the pricing engine, Zod schemas, DB schema, Radix UI primitives, template library, and slider mappings
- **Rebuild** the wizard UI (both builder and customer-facing) from scratch using a schema-driven step renderer
- **Rebuild** state management using a proper wizard state machine (not 40+ useState hooks)
- **Separate** builder product from customer-facing widget into distinct module boundaries
- **Introduce** a wizard schema/JSON definition layer that drives both builder and renderer

This is NOT a "refactor WizardCard into smaller pieces" situation. The component's architecture assumes hardcoded steps with hardcoded fields. Making it dynamic requires a fundamentally different rendering approach.

---

## 3. KEEP (Preserve As-Is or With Minimal Cleanup)

### 3.1 Pricing Engine — `shared/pricingConfig.ts` + `shared/calculateEstimate.ts`
- **Quality:** Excellent
- 10 pricing families as Zod discriminated union
- Clean `calculateEstimate()` function with modular modifier pipeline
- Supports add-ons (fixed + %), difficulty tiers, travel fees, after-hours multipliers
- Proper validation with fallback to `CALL_FOR_QUOTE`
- **236 lines total.** Tight, tested, reusable
- This is the single best piece of architecture in the codebase

### 3.2 Zod Schema Layer — `shared/schema.ts`
- **Quality:** Very good
- 765 lines of comprehensive, well-structured schemas
- `calculatorSettingsSchema` covers: appearance, layout, conversion blocks, lead form, followup, promotions, quote rules, AI employee, booking, publishing
- All types are inferred from Zod — single source of truth
- DB schemas use `drizzle-zod` for insert validation
- **This is already close to a config-driven system.** The schemas define the shape of what a wizard configuration looks like

### 3.3 Template Library — `shared/templateLibrary.ts`
- 6 template definitions with layout configs
- Trade-to-template mapping (160+ entries)
- Per-template config (sticky summary, breakdown display, trust blocks, layout style)
- Ready to be extended for the wizard builder

### 3.4 Slider Mappings — `shared/sliderMappings.ts`
- 30+ unit type configurations (sq ft, linear ft, bedrooms, hours, etc.)
- Min/max/step/suffix definitions
- Directly reusable for dynamic slider generation

### 3.5 Pricing Intake Mapper — `shared/pricingIntakeMapper.ts`
- Clean two-stage intake → PricingConfigV1 conversion
- 160 lines of deterministic mapping logic
- Works well for the builder product's guided pricing setup

### 3.6 Radix UI Primitives — `client/src/components/ui/`
- Standard shadcn/ui component library (40+ components)
- Properly wrapped Radix primitives with Tailwind styling
- Compound component patterns (Card, Form, Tabs, etc.)
- Fully reusable for any rebuild

### 3.7 Database Schema — PostgreSQL via Drizzle ORM
- `calculators`, `leads`, `bookings`, `followupJobs`, `analyticsEvents`, `smsMessages` tables
- JSONB fields for `pricing_config` and `calculator_settings` — flexible by design
- Proper foreign keys and relationships
- **No schema migration needed** for the target architecture

### 3.8 Design Tokens & Theme System
- `client/src/theme/platformTheme.ts` — design token definitions
- `client/src/theme/widgetTheme.ts` — per-widget theme customization
- `client/src/theme/tokens.ts` — shared token values
- CSS custom properties in `index.css` for light/dark mode

### 3.9 Trades Catalog — `client/src/data/trades.ts`
- 8 categories, 100+ trades
- Simple `{id, categoryId, label}` structure
- Ready for template selection and trade-specific configuration

---

## 4. REFACTOR (Has Value But Needs Restructuring)

### 4.1 Server Routes — `server/routes.ts` (2,293 lines)
- **Problem:** Single 2,293-line file handling ALL API routes
- **Value:** The endpoints themselves are well-designed (calculator CRUD, lead management, booking, analytics, AI pricing)
- **Action:** Split into route modules: `calculatorRoutes.ts`, `leadRoutes.ts`, `bookingRoutes.ts`, `aiRoutes.ts`, `analyticsRoutes.ts`
- **Keep:** The endpoint signatures and business logic — just reorganize

### 4.2 Storage Layer — `server/storage.ts` (619 lines)
- **Problem:** Single `DatabaseStorage` class with all queries
- **Value:** Clean Drizzle ORM usage, proper query patterns
- **Action:** Split into domain-specific repositories but keep the query logic

### 4.3 Wizard Sub-Steps — `DesignStudio.tsx`, `PricingIntakeStage2.tsx`, `TestGateStep.tsx`, `LeadFormStep.tsx`, `PublishStep.tsx`
- **Problem:** Tightly coupled to WizardCard's state shape and prop drilling
- **Value:** The form logic, field layouts, and validation within each step are reasonable
- **Action:** Refactor to accept a standardized step context/props interface; extract from WizardCard's monolithic state

### 4.4 AI Pricing Agent — `server/aiPricingAgent.ts`
- **Problem:** Constraints defined in prose within system prompts, not enforced structurally
- **Value:** The constraint concept (allowed pricing types, allowed operations) is correct
- **Action:** Formalize constraints as a schema; validate AI output against Zod before storing

### 4.5 Query Client — `client/src/lib/queryClient.ts`
- **Problem:** `staleTime: Infinity` and no structured error handling
- **Value:** TanStack Query is the right choice
- **Action:** Add proper stale/cache config, structured error boundaries, mutation hooks

---

## 5. REMOVE / REBUILD (Architectural Dead Ends)

### 5.1 `WizardCard.tsx` — 1,889 lines — REBUILD COMPLETELY
**This is the #1 problem in the codebase.**

Why it's a dead end:
- **God component:** 1,889 lines handling 6 hardcoded steps, form state, validation, API calls, localStorage persistence, AI draft polling, trade selection, template recommendation — all in one file
- **State explosion:** WizardState interface with 14 top-level fields, managed via a single `useState` + manual spreading
- **Hardcoded step sequence:** Steps 0–5 are baked into a switch statement. You cannot add, remove, or reorder steps without editing this component
- **No schema-driven rendering:** Every question, every input, every validation rule is hardcoded JSX. There is no concept of "render a step from a definition"
- **localStorage coupling:** `loadState()`/`saveState()` manually serialize the entire wizard state on every change
- **Cannot support dynamic questions:** The target spec requires 5–7 steps that vary by trade. This component cannot do that without a fundamental rewrite

This component should be replaced with:
1. A wizard step schema (JSON definition of steps, questions, validations)
2. A generic step renderer that reads the schema
3. A state machine (XState or similar) managing transitions
4. Individual question components that are schema-driven, not hardcoded

### 5.2 `CalculatorWidget.tsx` — 2,284 lines — REBUILD COMPLETELY
**This is the #2 problem in the codebase.**

Why it's a dead end:
- **42+ useState hooks** in a single component (quantity, tier, add-ons, difficulty, after-hours, lead form, booking, coupon, expiration, calendar state...)
- **Mixed concerns:** Pricing calculation, lead capture form, booking calendar with time slots, coupon validation, quote expiration countdown, trust badges, testimonials, image galleries — all in one render function
- **Inline business logic:** Coupon validation, deposit calculation, booking availability fetching, and analytics tracking are all inline in the component
- **Not one-question-per-screen:** The target spec requires a mobile-first, one-question-per-screen wizard. This component renders everything on a single page (or as a two-column layout). The multi-step mode exists but is bolted on as an afterthought
- **Cannot support Good/Better/Best packages cleanly:** Package selection is handled as a tier index (`selectedTierIndex`) with no visual package card UI

This component should be decomposed into:
1. A customer-facing wizard shell (progress + navigation)
2. Individual question renderers (slider, select, toggle, package card, etc.)
3. A pricing display component
4. A lead capture component
5. A booking component
6. Separate concerns for coupon, expiration, and analytics

### 5.3 Marketing Pages — `client/src/pages/marketing/`
- 15+ marketing pages (home, product, pricing, features, solutions, docs)
- Heavily coupled to a marketing site that is NOT the wizard builder product
- GSAP scroll animations, hero sections, trust marquees, bento grids
- **These should live in a separate marketing site/repo**, not in the wizard builder codebase
- They add cognitive overhead and make the codebase feel larger and more complex than the product core actually is

### 5.4 Debug/Reference Directories
- `bento-debug/`, `sticky-cards-debug/`, `mobile-debug/`, `scroll-recording/`, `feature-cards-recording/`
- `C:/WebAssets/` (Windows-style path with extracted reference sites)
- `effortel-extracted/`, `effortel-ref.cjs`, `effortel-scrape.mjs`
- **Pure noise.** Remove entirely

### 5.5 In-Memory Job Queue — `server/routes.ts` lines 221–230
- `draftJobs = new Map<string, PricingDraftJob>()`
- 5-minute TTL, no persistence, no retry mechanism
- Jobs lost on server restart
- Replace with proper job queue (Bull/BullMQ with Redis) or at minimum database-backed jobs

### 5.6 AI Chat Engine Demo Presets — `server/aiChatEngine.ts`
- Hardcoded `TRADE_PRESETS` with fixed rates (plumbing: $125/hr, electrical: $110/hr)
- These should come from the calculator's actual pricing config, not hardcoded constants
- The demo mode creates a false impression of how the system works

---

## 6. BIGGEST ARCHITECTURAL PROBLEMS

### Problem 1: No Separation Between Builder and Customer-Facing Widget
The builder wizard (`WizardCard`) and the customer-facing calculator (`CalculatorWidget`) live side by side in the same component tree with no architectural boundary. They share state patterns (lots of useState), share the same routing context, and both directly access the API layer. The target product requires these to be fundamentally different experiences:
- **Builder:** Guided setup, selectors/toggles, schema editing
- **Widget:** Ultra-simple, one-question-per-screen, mobile-first

Currently they're both "big forms that do everything."

### Problem 2: No Schema-Driven Rendering
The target spec calls for a wizard structure that is "ideally schema/JSON-driven." Currently:
- Every step is a hardcoded JSX block
- Every question is a hardcoded form field
- Every validation rule is inline
- Adding a new question to any step requires editing a 1,889-line component

There is NO concept of "wizard step definition" as data. The Zod schemas define what a *calculator configuration* looks like, but there is no schema defining what a *wizard flow* looks like.

### Problem 3: State Management Is Unsustainable
- `CalculatorWidget`: 42+ `useState` hooks
- `WizardCard`: 14-field state object with manual spreading
- No state machine, no context providers, no reducer pattern
- localStorage persistence is manual JSON serialization
- State shape is tightly coupled to component structure — changing the UI means changing the state

### Problem 4: Monolithic Components
- Two components account for 4,173 lines (WizardCard + CalculatorWidget)
- Each is essentially an entire application crammed into a single function
- Impossible to test individual steps or sections in isolation
- Impossible to lazy-load steps for performance

### Problem 5: Pricing Logic Leaks Into UI
While `calculateEstimate()` is clean and separate, the *interpretation* of pricing config is scattered throughout `CalculatorWidget`:
- Lines 76–100: Manual extraction of settings, booking config, promotions, quote rules, UI template, conversion blocks
- Coupon validation logic inline
- Deposit calculation inline
- Expiration countdown inline
- These should be in hooks or service layers, not in the render component

### Problem 6: No Multi-Trade Support Path
Each calculator is one trade, one pricing config, one widget. The target spec mentions "future trades should be configurable without cloning entire flows." Currently, supporting a new trade means creating a new calculator from scratch. There's no template instantiation, no trade-specific question sets, no inherited configuration.

---

## 7. BIGGEST REUSABLE WINS

1. **Pricing Engine** (`shared/calculateEstimate.ts` + `shared/pricingConfig.ts`) — 400 lines of clean, validated, composable pricing logic. This IS the core product engine. Keep it exactly as-is.

2. **Zod Schema System** (`shared/schema.ts`) — 765 lines that already define the shape of calculator configuration. Extend this to also define wizard flow schemas, and you have a config-driven system.

3. **Template Library** (`shared/templateLibrary.ts`) — Already maps trades to templates with per-template config. Extend to include step definitions and question sets.

4. **Slider Mappings** (`shared/sliderMappings.ts`) — Ready-made input configuration for 30+ unit types. Directly usable by a schema-driven question renderer.

5. **Database Schema** — JSONB fields mean the DB doesn't care what shape the config is. No migration needed for architectural changes.

6. **Radix UI Components** — 40+ accessible, styled primitives. These are the building blocks for any rebuild.

7. **Pricing Intake Two-Stage Model** — The Stage 1 (what do you charge) → Stage 2 (enter your rates) flow is correct for the builder product. The logic just needs to be decoupled from WizardCard.

---

## 8. SUGGESTED MIGRATION STRATEGY

### Phase 1: Extract & Isolate (Week 1–2)
1. Move marketing pages to a separate route group or repo — get them out of the product codebase
2. Delete debug directories (`bento-debug/`, `sticky-cards-debug/`, etc.)
3. Split `server/routes.ts` into domain modules
4. Create a `shared/wizardSchema.ts` that defines wizard steps as data (step ID, question type, validation rules, conditional logic)

### Phase 2: Rebuild Customer-Facing Widget (Week 2–4)
1. Design the wizard step schema format
2. Build a generic `WizardShell` component (progress bar + step navigation)
3. Build atomic question components: `SliderQuestion`, `SelectQuestion`, `ToggleQuestion`, `PackageCardQuestion`, `TextInputQuestion`
4. Build a `StepRenderer` that reads a step definition and renders the appropriate question component
5. Build a `PricingDisplay` component (exact price, range, breakdown, packages)
6. Build a `LeadCaptureStep` component
7. Wire up with a proper state machine (useReducer or XState)

### Phase 3: Rebuild Builder Wizard (Week 4–6)
1. Build the builder as a separate page/module
2. Guided setup flow: Trade selection → Pricing setup (Stage 1 + 2) → Design customization → Lead form config → Test & validate → Publish
3. Each builder step edits the wizard schema/config, not hardcoded UI
4. Live preview panel showing the customer-facing widget rendering from the schema
5. Template selection that pre-populates the schema

### Phase 4: Polish & Extend (Week 6–8)
1. Add Good/Better/Best package UI
2. Add add-on selection step
3. Add booking integration as an optional post-quote step
4. Add AI import path for pricing configuration
5. Add multi-trade template support

---

## 9. SPECIFIC FILES/FOLDERS TO INSPECT FIRST

When starting the rebuild, examine these in order:

| Priority | File | Why |
|----------|------|-----|
| 1 | `shared/pricingConfig.ts` | Understand the pricing type system — this drives everything |
| 2 | `shared/calculateEstimate.ts` | Understand the calculation pipeline — this is the engine |
| 3 | `shared/schema.ts` | Understand the full config shape — this is the data model |
| 4 | `shared/templateLibrary.ts` | Understand template definitions — extend for wizard steps |
| 5 | `shared/sliderMappings.ts` | Understand input configs — reuse for question rendering |
| 6 | `shared/pricingIntakeMapper.ts` | Understand the intake → config flow — reuse in builder |
| 7 | `client/src/components/wizard/WizardCard.tsx` | Understand what NOT to do — learn from the anti-patterns |
| 8 | `client/src/components/calculator/CalculatorWidget.tsx` | Understand what the widget needs to support — extract requirements |
| 9 | `server/routes.ts` | Understand the API surface — keep the endpoints, restructure the file |
| 10 | `client/src/data/trades.ts` | Understand the trade catalog — extend for trade-specific configs |

---

## 10. WHAT NOT TO BUILD ON TOP OF

1. **Do NOT add features to `WizardCard.tsx`.** Every line added makes the eventual rewrite harder. It's already 1,889 lines.

2. **Do NOT add features to `CalculatorWidget.tsx`.** At 2,284 lines with 42+ state hooks, it's past the point of productive extension.

3. **Do NOT use the current state management pattern** (mass `useState` hooks) for any new features. Introduce `useReducer` or a state machine.

4. **Do NOT build the builder product as "more steps in WizardCard."** The builder and the customer-facing widget are fundamentally different UX patterns that happen to edit the same data model.

5. **Do NOT hardcode new question types into JSX.** Every new question should be a schema definition rendered by a generic renderer.

6. **Do NOT add marketing features to this codebase.** The marketing site and the product should be separate concerns.

7. **Do NOT continue using in-memory job queues** for anything that matters (pricing draft generation, followup scheduling). Server restarts lose everything.

8. **Do NOT extend the current authentication system** (URL tokens with 7-day expiry) for multi-user or team features. It needs proper session management.

---

## FINAL CALL

### **SALVAGE PARTS, REBUILD CORE**

The pricing engine, schemas, database, UI primitives, template library, and slider mappings are genuinely good — roughly 30% of the codebase by value. They represent solid engineering decisions that should be preserved.

The wizard UI layer (WizardCard + CalculatorWidget = 4,173 lines), the state management approach, and the lack of schema-driven rendering are architectural dead ends that cannot be incrementally refactored into the target product. They need to be rebuilt from scratch against a proper wizard schema system.

The marketing pages are out of scope for the product and should be separated.

**Estimated salvageable code: ~30% by value, ~15% by line count.**
**Estimated rebuild scope: The entire wizard/builder/widget UI layer + state management.**
**Estimated timeline: 6–8 weeks for a senior engineer to reach feature parity with a clean architecture.**
