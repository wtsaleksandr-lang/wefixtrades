# Phase 1 Execution Plan: Architecture Skeleton

---

## A. BRANCH STRATEGY

### Branch Layout

| Branch | Purpose | Status |
|--------|---------|--------|
| `main` (remote) / `master` (local) | Production baseline | DO NOT TOUCH directly |
| `claude/audit-wizard-architecture-MKsIh` | Audit documents (ARCHITECTURE_AUDIT.md, EXTRACTION_MAP.md) | STAYS UNMERGED — reference only |
| `phase1/architecture-skeleton` | Phase 1 implementation | CREATE FROM `master` — all Phase 1 work goes here |
| `phase2/customer-widget` | Phase 2: Customer-facing wizard rebuild | Create LATER, branched from `phase1/architecture-skeleton` after merge |
| `phase3/builder-wizard` | Phase 3: Builder product rebuild | Create LATER |

### Rules

1. `phase1/architecture-skeleton` branches from `master` (current production)
2. All Phase 1 commits go to `phase1/architecture-skeleton`
3. The audit branch is NEVER merged — it exists as documentation alongside the codebase
4. Phase 1 merges to `main` only after validation (builds, no regressions)
5. Phase 2 branches from the merged Phase 1

---

## B. PHASE 1 SCOPE

### WILL Be Done in Phase 1

| # | Task | Risk | Description |
|---|------|------|-------------|
| 1 | Delete junk files/dirs | None | Remove debug dirs, screenshots, scrapers, Windows path artifacts (~75 MB) |
| 2 | Split `shared/schema.ts` | Low | Break 765-line file into domain modules with barrel re-export for backward compat |
| 3 | Split `server/routes.ts` | Low | Break 2,293-line file into domain route modules with barrel registration |
| 4 | Create `shared/wizardSchema.ts` | None | New file — the missing wizard step schema layer. Types and schema only, no runtime logic |
| 5 | Reconcile template systems | Low | Merge `client/src/config/templateConfig.ts` definitions into `shared/templateLibrary.ts` |
| 6 | Reconcile pricing plan files | Low | Merge `client/src/config/pricingPlans.ts` + `pricing.ts` into single source |
| 7 | Create new folder structure | None | Empty skeleton directories for future phases |
| 8 | Freeze marker comments | None | Add `// FROZEN — scheduled for Phase 2/3 rebuild` headers to god-components |

### Will NOT Be Done in Phase 1

| # | Task | Why Not Yet |
|---|------|-------------|
| 1 | Rewrite WizardCard.tsx | Phase 3 — builder rebuild |
| 2 | Rewrite CalculatorWidget.tsx | Phase 2 — widget rebuild |
| 3 | Rewrite DesignStudio.tsx | Phase 3 — builder rebuild |
| 4 | Rewrite dashboard.tsx | Phase 3 — builder rebuild |
| 5 | Build new customer-facing wizard | Phase 2 |
| 6 | Build new builder product | Phase 3 |
| 7 | Add state machine / new state management | Phase 2 — introduced with new widget |
| 8 | Move marketing pages to separate repo | Not Phase 1 priority — low risk leaving them |
| 9 | Rewrite AI chat or AI pricing agents | Phase 4 — polish |
| 10 | Change database schema or run migrations | Not needed — JSONB columns absorb changes |
| 11 | Change authentication system | Phase 4 — polish |

---

## C. NEW STRUCTURE TO CREATE

### New Folders

```
shared/
├── schemas/                    # NEW — domain-split schema modules
│   ├── pricing.ts
│   ├── calculator.ts
│   ├── booking.ts
│   ├── leads.ts
│   ├── db.ts
│   └── index.ts               # barrel re-export

server/
├── routes/                     # NEW — domain-split route modules
│   ├── calculatorRoutes.ts
│   ├── leadRoutes.ts
│   ├── bookingRoutes.ts
│   ├── aiRoutes.ts
│   ├── dashboardRoutes.ts
│   ├── stripeRoutes.ts
│   ├── twilioRoutes.ts
│   ├── domainRoutes.ts
│   ├── followupRoutes.ts
│   ├── marketingRoutes.ts
│   └── index.ts               # barrel registration
```

### New Files

| File | Purpose |
|------|---------|
| `shared/wizardSchema.ts` | Wizard step schema types: StepDefinition, QuestionType, ValidationRule, ConditionalVisibility, WizardFlow |
| `shared/schemas/pricing.ts` | Extracted from schema.ts: customTradeDataSchema, stage2DataSchema, sampleQuoteSchema, pricingIntakeSchema, pricingDraftSchema, pricingAuditLogSchema |
| `shared/schemas/calculator.ts` | Extracted from schema.ts: calculatorSettingsSchema and all nested sub-schemas (appearance, layout, conversion, etc.) |
| `shared/schemas/booking.ts` | Extracted from schema.ts: bookingSettingsSchema |
| `shared/schemas/leads.ts` | Extracted from schema.ts: lead-related schemas, followup templates |
| `shared/schemas/db.ts` | Extracted from schema.ts: all pgTable definitions, insert schemas, type exports |
| `shared/schemas/index.ts` | Barrel re-export so `import { X } from '@shared/schema'` still works |
| `server/routes/index.ts` | Route registration barrel — calls `app.use()` for each domain module |
| `server/routes/calculatorRoutes.ts` | Calculator CRUD + slug + duplicate + track-view |
| `server/routes/leadRoutes.ts` | Lead create + list + delete + export + status |
| `server/routes/bookingRoutes.ts` | Availability + create + checkout + confirm + status |
| `server/routes/aiRoutes.ts` | AI pricing generation + AI chat (demo/support/client) |
| `server/routes/dashboardRoutes.ts` | Overview + analytics + settings + republish + notifications |
| `server/routes/stripeRoutes.ts` | Connect + callback + refresh + status |
| `server/routes/twilioRoutes.ts` | Inbound webhook + messages + sms-status |
| `server/routes/domainRoutes.ts` | Check-dns + issue-ssl + status |
| `server/routes/followupRoutes.ts` | Get + update + test |
| `server/routes/marketingRoutes.ts` | robots.txt + sitemap + contact |

### Old Files to Freeze (Add Freeze Header Only)

| File | Freeze Phase |
|------|-------------|
| `client/src/components/wizard/WizardCard.tsx` | Phase 3 |
| `client/src/components/calculator/CalculatorWidget.tsx` | Phase 2 |
| `client/src/components/wizard/DesignStudio.tsx` | Phase 3 |
| `client/src/components/wizard/TestGateStep.tsx` | Phase 3 |
| `client/src/components/wizard/PublishStep.tsx` | Phase 3 |
| `client/src/components/wizard/CustomTradeQuestionnaire.tsx` | Phase 3 |
| `client/src/components/wizard/PricingIntakeStage2.tsx` | Phase 3 |
| `client/src/components/wizard/LeadFormStep.tsx` | Phase 3 |
| `client/src/pages/dashboard.tsx` | Phase 3 |
| `client/src/pages/edit-calculator.tsx` | Phase 3 |

### Old Files to Leave Untouched

Everything in `client/src/components/ui/` — don't touch, already good.
Everything in `client/src/pages/marketing/` — ignore, not in scope.
`server/auth.ts`, `server/db.ts`, `server/bookingEmails.ts`, `server/twilioClient.ts` — fine as-is.
All job files (`server/jobs/*.ts`) — fine for now.
`client/src/hooks/*` — all clean.
`client/src/lib/*` — all clean.
`client/src/theme/*` — all clean.
`client/src/data/trades.ts` — leave as-is, extend in Phase 2.

---

## D. SCHEMA SPLIT STRUCTURE

### Current: `shared/schema.ts` (765 lines, everything in one file)

### Target: `shared/schemas/` (6 files)

```
shared/schemas/
├── pricing.ts          ← lines 6-137 of current schema.ts
├── calculator.ts       ← lines 139-487 of current schema.ts
├── booking.ts          ← lines 139-155 of current schema.ts (bookingSettingsSchema)
├── leads.ts            ← lead_form, followup, promotions sub-schemas
├── db.ts               ← lines 491-765 of current schema.ts (all pgTable + insert + types)
└── index.ts            ← barrel re-export
```

### Responsibility of Each File

**`shared/schemas/pricing.ts`**
- `customTradeDataSchema` + `CustomTradeData`
- `stage2DataSchema` + `Stage2Data`
- `sampleQuoteSchema` + `SampleQuote`
- `pricingIntakeSchema` + `PricingIntake`
- `aiDraftRequestSchema` + `AIDraftRequest`
- `aiDraftResponseSchema` + `AIDraftResponse`
- `pricingDraftSchema` + `PricingDraft`
- `pricingDraftJobSchema` + `PricingDraftJob`
- `pricingAuditLogSchema` + `PricingAuditLog`

**`shared/schemas/calculator.ts`**
- `uiTemplateSchema` + `UITemplate`
- `conversionBlocksSchema` + `ConversionBlocks` + `ConversionImageItem` + `ConversionTestimonialItem`
- `calculatorSettingsSchema` + `CalculatorSettings`
- All nested sub-schemas: appearance, layout, conversion, integrations, publish, quote_rules, ai_employee, test_history

**`shared/schemas/booking.ts`**
- `bookingSettingsSchema` + `BookingSettings`

**`shared/schemas/leads.ts`**
- Lead form sub-schema (fields, consent, cta, delivery, spam)
- Followup sub-schema (channels, schedule, templates, personalization, notifications, reminders)
- Promotions sub-schema (coupons)

NOTE: leads.ts and booking.ts are consumed by calculator.ts, so the import direction is:
```
calculator.ts ← imports from → pricing.ts, booking.ts, leads.ts
db.ts ← imports from → (drizzle-orm only, self-contained)
index.ts ← re-exports from → all above
```

**`shared/schemas/db.ts`**
- All `pgTable` definitions: users, calculators, leads, bookings, followupJobs, analyticsEvents, notificationQueue, deploymentStatus, calculatorAnalyticsSummary, jobLogs, aiConversations, supportTickets, smsMessages
- All `createInsertSchema` + `InsertX` types
- All `Select` types (Calculator, Lead, Booking, etc.)

**`shared/schemas/index.ts`**
- Re-exports everything from all sub-modules
- `shared/schema.ts` becomes a thin re-export wrapper pointing to `shared/schemas/index.ts` for backward compat

### Backward Compatibility Strategy

The old `shared/schema.ts` file will be replaced with:
```ts
// shared/schema.ts — backward-compatible re-export
// All schemas have moved to shared/schemas/
export * from './schemas';
```

This means ZERO changes needed in any file that imports from `@shared/schema`. Every existing import keeps working. The split is invisible to consumers.

---

## E. ROUTE SPLIT STRUCTURE

### Current: `server/routes.ts` (2,293 lines, everything in one function)

### Target: `server/routes/` (11 files)

```
server/routes/
├── index.ts               ← registers all route modules on Express app
├── calculatorRoutes.ts    ← 7 endpoints, ~350 lines
├── leadRoutes.ts          ← 6 endpoints, ~200 lines
├── bookingRoutes.ts       ← 5 endpoints, ~200 lines
├── aiRoutes.ts            ← 8 endpoints, ~450 lines
├── dashboardRoutes.ts     ← 6 endpoints, ~250 lines
├── stripeRoutes.ts        ← 4 endpoints, ~200 lines
├── twilioRoutes.ts        ← 3 endpoints, ~100 lines
├── domainRoutes.ts        ← 3 endpoints, ~150 lines
├── followupRoutes.ts      ← 3 endpoints, ~100 lines
└── marketingRoutes.ts     ← 3 endpoints, ~70 lines
```

### Endpoint Assignment

**`calculatorRoutes.ts`**
- `POST /api/calculators` — create calculator
- `GET /api/calculators/check-slug` — validate slug
- `GET /api/calculators/slugify` — generate slug from name
- `GET /api/calculators/lookup` — public lookup by slug
- `PATCH /api/calculators/:id` — update calculator
- `POST /api/calculators/:id/duplicate` — duplicate calculator
- `POST /api/calculators/track-view` — increment view counter

**`leadRoutes.ts`**
- `POST /api/leads` — create lead from widget submission
- `GET /api/leads` — list leads by token
- `GET /api/leads/dashboard` — list leads for dashboard
- `DELETE /api/leads/:id` — delete lead
- `GET /api/leads/export` — CSV export
- `PATCH /api/leads/:id/status` — update lead status
- `PATCH /api/leads/:id/ai-pause` — toggle AI pause

**`bookingRoutes.ts`**
- `GET /api/bookings/availability` — fetch available slots
- `POST /api/bookings` — create booking
- `POST /api/bookings/checkout` — create Stripe checkout
- `POST /api/bookings/confirm` — confirm booking after payment
- `GET /api/bookings/dashboard` — list bookings for dashboard
- `PATCH /api/bookings/:id/status` — update booking status

**`aiRoutes.ts`**
- `POST /api/ai/generate-pricing` — quick pricing suggestion
- `POST /api/ai/pricing-config-draft` — async detailed pricing generation
- `GET /api/ai/pricing-config-draft/:jobId` — poll for job status
- `POST /api/ai/generate-pricing-draft` — alternative draft endpoint
- `POST /api/ai/demo-chat` — demo AI chat
- `POST /api/ai/support-chat` — support chatbot
- `POST /api/ai/client-chat` — live client AI assistant
- `POST /api/ai/create-ticket` — escalate to support ticket

**`dashboardRoutes.ts`**
- `GET /api/dashboard/overview` — dashboard summary data
- `GET /api/dashboard/analytics` — analytics data
- `POST /api/dashboard/track` — track analytics event
- `PATCH /api/dashboard/settings` — update calculator settings
- `POST /api/dashboard/republish` — republish calculator
- `GET /api/dashboard/notification-logs` — notification history

**`stripeRoutes.ts`**
- `POST /api/stripe/connect` — initiate Stripe Connect
- `GET /api/stripe/callback` — OAuth callback
- `POST /api/stripe/refresh` — refresh Stripe token
- `GET /api/stripe/status` — check Stripe connection status

**`twilioRoutes.ts`**
- `POST /api/twilio/inbound` — SMS webhook
- `GET /api/twilio/messages` — message history
- `GET /api/twilio/sms-status` — delivery status

**`domainRoutes.ts`**
- `POST /api/domains/check-dns` — verify CNAME records
- `POST /api/domains/issue-ssl` — request SSL provisioning
- `GET /api/domains/status` — domain status check

**`followupRoutes.ts`**
- `GET /api/followup/settings` — get followup config
- `PATCH /api/followup/settings` — update followup config
- `POST /api/followup/test` — send test followup

**`marketingRoutes.ts`**
- `GET /robots.txt` — SEO
- `GET /sitemap.xml` — SEO
- `POST /api/contact` — contact form submission

### Shared Dependencies Across Route Modules

All route modules will import from:
- `server/storage.ts` — data access (the `storage` singleton)
- `@shared/schemas` — validation schemas
- `@shared/pricingConfig` — pricing validation (aiRoutes, calculatorRoutes)
- `server/auth.ts` — authentication middleware (dashboardRoutes)

Each route module exports a single function:
```ts
export function registerXxxRoutes(app: Express, storage: IStorage): void { ... }
```

The barrel `routes/index.ts` calls each registration function.

### Backward Compatibility Strategy

The old `server/routes.ts` is replaced entirely. The new `server/index.ts` imports from `server/routes/index.ts` instead of `server/routes.ts`. This is a clean swap — no re-export wrapper needed because routes.ts is consumed in exactly one place (server/index.ts).

---

## F. SALVAGE PLAN

### Keep As-Is (Zero Modifications)

| File | Reason |
|------|--------|
| `shared/pricingConfig.ts` | Best code in codebase. Zero deps beyond Zod |
| `shared/calculateEstimate.ts` | Clean engine. Only depends on pricingConfig |
| `shared/sliderMappings.ts` | No deps. Direct input to schema-driven rendering |
| `shared/slugUtils.ts` | No deps. Pure utility |
| `shared/models/chat.ts` | Clean Drizzle schema |
| `client/src/lib/utils.ts` | cn() utility |
| `client/src/hooks/use-mobile.tsx` | Pure hook |
| `client/src/hooks/use-toast.ts` | Well-architected reducer |
| `client/src/config/planGating.ts` | Clean access control |
| `client/src/components/calculator/SliderField.tsx` | Reusable question input |
| `client/src/components/ui/*.tsx` (45 files) | shadcn primitives |
| `client/src/theme/tokens.ts` | Design system |
| `client/src/theme/platformTheme.ts` | Dashboard theme |
| `client/src/theme/widgetTheme.ts` | Widget theme |
| `server/db.ts` | DB connection |
| `server/auth.ts` | Auth middleware |
| `server/twilioClient.ts` | Twilio integration |
| `server/bookingEmails.ts` | Email templates |
| `server/jobs/*.ts` (5 files) | Job workers |
| All root configs (package.json, tsconfig, vite, tailwind, drizzle, postcss) | Build infrastructure |

### Copy and Refactor (Phase 1 Active Work)

| File | What Changes |
|------|-------------|
| `shared/schema.ts` | Split into `shared/schemas/*.ts`, leave thin re-export wrapper |
| `server/routes.ts` | Split into `server/routes/*.ts`, delete original |
| `server/index.ts` | Update to import from `server/routes/index.ts` |

### Wrap Temporarily (Bridge to Future Phases)

| File | Wrapping Strategy |
|------|-------------------|
| `shared/templateLibrary.ts` | Keep current exports working. Add new `WizardStepDefinition[]` field to `TemplateDefinition` type. Existing consumers unaffected |
| `client/src/config/templateConfig.ts` | Add `@deprecated` JSDoc. In Phase 2, consumers migrate to shared/templateLibrary.ts |
| `client/src/config/pricingPlans.ts` | Merge plan definitions into this file. Mark `config/pricing.ts` products section as the canonical product catalog |

### Replace Later (Frozen, Rebuilt in Phase 2/3)

| File | Replace Phase |
|------|--------------|
| `client/src/components/wizard/WizardCard.tsx` | Phase 3 |
| `client/src/components/calculator/CalculatorWidget.tsx` | Phase 2 |
| `client/src/components/wizard/DesignStudio.tsx` | Phase 3 |
| `client/src/components/wizard/TestGateStep.tsx` | Phase 3 |
| `client/src/components/wizard/PublishStep.tsx` | Phase 3 |
| `client/src/components/wizard/CustomTradeQuestionnaire.tsx` | Phase 3 |
| `client/src/components/wizard/PricingIntakeStage2.tsx` | Phase 3 |
| `client/src/components/wizard/LeadFormStep.tsx` | Phase 3 |
| `client/src/pages/dashboard.tsx` | Phase 3 |
| `client/src/pages/edit-calculator.tsx` | Phase 3 |
| `server/aiChatEngine.ts` | Phase 4 |
| `server/aiPricingAgent.ts` | Phase 4 |

---

## G. FIRST 10 IMPLEMENTATION ACTIONS

Execute in this exact order. Each action is a single commit.

### Action 1: Delete Junk Files
Delete all debug directories, scrapers, screenshots, Windows path artifacts, and stale AI project notes.
- Remove: `bento-debug/`, `mobile-debug/`, `sticky-cards-debug/`, `scroll-recording/`, `feature-cards-recording/`, `effortel-extracted/`, `C:/`, `attached_assets/`, `AI_PROJECT_BRAIN/`, `test-results/`
- Remove: `bento-debug.mjs`, `mobile-debug-script.mjs`, `sticky-cards-debug-script.mjs`, `effortel-ref.cjs`, `effortel-scrape.mjs`, `extract-sites.cjs`, `record-feature-cards.mjs`, `scroll-recorder.mjs`
- Remove: all root `*.png` files
- **Risk: Zero** — none of these are imported by anything
- **Commit message:** `chore: remove debug dirs, scrapers, and screenshot artifacts`

### Action 2: Create shared/schemas/ Directory and Split Schema
- Create `shared/schemas/` directory
- Create `pricing.ts` — move pricing-related Zod schemas
- Create `calculator.ts` — move calculatorSettingsSchema and nested sub-schemas
- Create `booking.ts` — move bookingSettingsSchema
- Create `leads.ts` — extract lead form, followup, promotions sub-schemas
- Create `db.ts` — move all pgTable definitions, insert schemas, type exports
- Create `index.ts` — barrel re-export everything
- Replace `shared/schema.ts` with `export * from './schemas'`
- **Risk: Low** — barrel re-export preserves all existing imports
- **Validation: Run `npx tsc --noEmit` to confirm zero type errors**
- **Commit message:** `refactor: split shared/schema.ts into domain modules`

### Action 3: Create shared/wizardSchema.ts
- Define new types: `QuestionType`, `StepType`, `ValidationRule`, `ConditionalVisibility`, `StepDefinition`, `WizardFlow`
- Define Zod schemas for each
- Export types and schemas
- No runtime logic — pure type/schema definitions
- **Risk: Zero** — new file, no existing code affected
- **Commit message:** `feat: add wizard step schema definitions`

### Action 4: Create server/routes/ Directory and Split Routes
- Create `server/routes/` directory
- Extract `stripeRoutes.ts` first (cleanest, most self-contained — 4 endpoints)
- Extract `bookingRoutes.ts` (clear domain boundary — 5 endpoints)
- Extract `twilioRoutes.ts` (small, focused — 3 endpoints)
- Extract `domainRoutes.ts` (3 endpoints)
- Extract `followupRoutes.ts` (3 endpoints)
- Extract `marketingRoutes.ts` (3 endpoints)
- Extract `leadRoutes.ts` (6 endpoints)
- Extract `calculatorRoutes.ts` (7 endpoints)
- Extract `dashboardRoutes.ts` (6 endpoints)
- Extract `aiRoutes.ts` (8 endpoints — largest, extract last)
- Create `index.ts` barrel that registers all modules
- Update `server/index.ts` to use new barrel
- Delete old `server/routes.ts`
- **Risk: Low** — functional equivalence, same Express app
- **Validation: Start server, hit 3-4 endpoints across different modules**
- **Commit message:** `refactor: split server/routes.ts into domain route modules`

### Action 5: Add Freeze Headers to God-Components
- Add `// FROZEN — scheduled for rebuild in Phase 2/3. Do not add features.` to top of:
  - `WizardCard.tsx`, `CalculatorWidget.tsx`, `DesignStudio.tsx`, `TestGateStep.tsx`, `PublishStep.tsx`, `CustomTradeQuestionnaire.tsx`, `PricingIntakeStage2.tsx`, `LeadFormStep.tsx`, `dashboard.tsx`, `edit-calculator.tsx`
- **Risk: Zero** — comments only
- **Commit message:** `chore: add freeze headers to components scheduled for rebuild`

### Action 6: Extend shared/templateLibrary.ts with Step Schema Support
- Import `StepDefinition` from `shared/wizardSchema.ts`
- Add optional `steps?: StepDefinition[]` to `TemplateDefinition` interface
- Add step definitions for 1 template (e.g., `multi_step_progressive`) as proof of concept
- Existing consumers unaffected — field is optional
- **Risk: Zero** — additive change, optional field
- **Commit message:** `feat: extend template definitions with wizard step schemas`

### Action 7: Deprecate client/src/config/templateConfig.ts
- Add `@deprecated` JSDoc to file header and `TEMPLATES` export
- Add comment pointing to `shared/templateLibrary.ts` as canonical source
- Do NOT delete or modify logic — existing demo pages still consume it
- **Risk: Zero** — comments and JSDoc only
- **Commit message:** `chore: mark client templateConfig as deprecated in favor of shared templateLibrary`

### Action 8: Reconcile Pricing Plan Files
- Review `client/src/config/pricingPlans.ts` and `client/src/config/pricing.ts`
- Merge duplicated plan tier definitions into `pricingPlans.ts` as the single source for plan tiers
- Keep `pricing.ts` as the product catalog (10 products with billing details) — clearly separate scope
- Add cross-reference comments in both files
- **Risk: Low** — clarifying scope, minor data moves
- **Commit message:** `refactor: clarify pricing plan vs product catalog separation`

### Action 9: Verify Full Build
- Run `npx tsc --noEmit` — confirm zero type errors
- Run `npm run build` — confirm production build succeeds
- Spot-check: start dev server, load homepage, load a calculator by slug, create a lead
- **Risk: Zero** — read-only validation
- **Commit message:** none (validation step, no code change)

### Action 10: Update .gitignore and Clean Up
- Add debug/junk patterns to `.gitignore` to prevent re-creation:
  ```
  *-debug/
  *-recording/
  attached_assets/
  AI_PROJECT_BRAIN/
  test-results/
  *.mjs
  ```
- Note: `*.mjs` only if the project doesn't use .mjs files legitimately (verify first)
- **Risk: Zero** — gitignore only
- **Commit message:** `chore: update .gitignore to prevent debug artifact re-creation`

---

## H. DO-NOT-TOUCH LIST

### Files Claude Must NOT Modify in Phase 1

| File | Why |
|------|-----|
| `client/src/components/wizard/WizardCard.tsx` | Frozen — Phase 3 rebuild target. Adding freeze header is the ONLY allowed change |
| `client/src/components/calculator/CalculatorWidget.tsx` | Frozen — Phase 2 rebuild target. Freeze header only |
| `client/src/components/wizard/DesignStudio.tsx` | Frozen — Phase 3 |
| `client/src/components/wizard/TestGateStep.tsx` | Frozen — Phase 3 |
| `client/src/components/wizard/PublishStep.tsx` | Frozen — Phase 3 |
| `client/src/components/wizard/CustomTradeQuestionnaire.tsx` | Frozen — Phase 3 |
| `client/src/components/wizard/PricingIntakeStage2.tsx` | Frozen — Phase 3 |
| `client/src/components/wizard/LeadFormStep.tsx` | Frozen — Phase 3 |
| `client/src/pages/dashboard.tsx` | Frozen — Phase 3 |
| `client/src/pages/edit-calculator.tsx` | Frozen — Phase 3 |
| `client/src/pages/marketing/*.tsx` | Out of scope — not product code |
| `client/src/components/marketing/*.tsx` | Out of scope |
| `client/src/components/ui/*.tsx` | Already good — no reason to touch |
| `shared/pricingConfig.ts` | Already good — preserve as-is |
| `shared/calculateEstimate.ts` | Already good — preserve as-is |
| `shared/sliderMappings.ts` | Already good — preserve as-is |
| `shared/slugUtils.ts` | Already good — preserve as-is |
| `server/auth.ts` | Adequate — Phase 4 concern |
| `server/db.ts` | Already good |
| `server/twilioClient.ts` | Already good |
| `server/bookingEmails.ts` | Adequate |
| `server/jobs/*.ts` | Adequate |
| `server/aiChatEngine.ts` | Phase 4 concern |
| `server/aiPricingAgent.ts` | Phase 4 concern |
| All root config files | Already correct |
| Database schema / migrations | No migration needed |

### Actions Claude Must NOT Take in Phase 1

1. Do NOT rewrite any component logic
2. Do NOT introduce new dependencies (no XState, no Zustand, no new packages)
3. Do NOT change any API endpoint signatures or behavior
4. Do NOT modify the database schema
5. Do NOT change the authentication system
6. Do NOT delete marketing pages
7. Do NOT merge any branch to main without explicit approval
8. Do NOT modify import paths in frozen files (schema barrel re-export handles this)
9. Do NOT add new features to any frozen component
10. Do NOT refactor CSS, theme tokens, or design system
