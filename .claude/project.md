CONTEXT: Some tasks from a previous
session were partially completed.
Before starting each task:
1. Check if the code already exists
2. Run the verification test for that task
3. If it passes — mark as done and
   move to next task
4. If it fails — fix it properly

The following was confirmed working
in the last session:
- max_tokens fixed to 4096 ✅
- narrative JSON parsing fixed ✅
- websiteQualityChecks returns 9 keys ✅
- actionPlanCount returns 3 ✅
- speedMobile returns real number ✅

DO NOT re-do these unless a test
shows they are broken.
Start from Task 2 verification,
then continue through all remaining
tasks.

═══════════════════════════════
AUTONOMOUS WORK RULES — ALWAYS FOLLOW
═══════════════════════════════

TESTING LOOP — mandatory for every task:
1. Make the change
2. Run: npx tsc --noEmit
3. Fix ALL TypeScript errors
4. Restart server: npm run dev
5. Test with curl against the
   running server
6. Read the response and verify
   the specific field you just fixed
7. Only move to next task when
   verified working
8. If a fix fails twice — try a
   completely different approach
9. Never skip verification
10. Never assume it works without testing

TEST BUSINESSES — use all three:
Plumbing: Priority Plumbing & Drains
  placeId: ChIJyb-b9z00K4gRe7gfm2znXTA
  city: Toronto, ON
  expected trade: plumbing

Cleaning: Upkeep Home Services
  placeId: ChIJqw2hdImjKogRjfGgZXJMsyA
  city: Barrie, ON
  expected trade: cleaning

Electrical: (search Google Places for
  an electrician in Hamilton ON and
  use their placeId)
  expected trade: electrical

DESIGN RULES — never violate:
- DO NOT change colors, layout,
  spacing, fonts, or animations
- DO NOT modify design tokens:
  DARK, CYAN, GREEN, AMBER, RED,
  GREY, WHITE, BORDER
- Backend logic and data only
  unless explicitly told otherwise

COMMIT RULES:
- Commit after each verified task
- Message format: "fix: [task name]
  — verified passing"
- Never commit broken code
- Never commit TypeScript errors

═══════════════════════════════

# Project Architecture

## Project Name
TradeQuote SaaS Platform (package: rest-express)

## Purpose
A SaaS platform for home service / trade businesses. It provides embeddable calculators for instant quotes, online booking, an AI chat employee, SMS follow-ups, and lead management — all configurable via a dashboard and embeddable on customer websites.

## Main Stack
- Language: TypeScript
- Framework: React 18 (frontend), Express 5 (backend)
- Runtime: Node.js 20
- Build tool: Vite (frontend), esbuild via tsx (backend)
- Package manager: npm
- Database: PostgreSQL with Drizzle ORM
- Styling: Tailwind CSS + Radix UI component library

## High-Level Structure
- `client/` = React SPA (frontend app, pages, components)
- `server/` = Express API server (routes, storage, jobs, integrations)
- `shared/` = Shared Drizzle schema and types used by both client and server
- `script/` = Build scripts
- `attached_assets/` = Design assets and uploaded files

## Entry Points
- Frontend entry: `client/src/App.tsx`, `client/index.html`
- Backend entry: `server/index.ts`
- Main config files: `package.json`, `drizzle.config.ts`, `vite.config.ts`, `tailwind.config.ts`

## Important Files
- `package.json` — scripts, dependencies
- `server/index.ts` — Express app setup, server bootstrap
- `server/routes.ts` — all API route registrations
- `server/storage.ts` — database access layer (IStorage interface + implementation)
- `shared/schema.ts` — Drizzle table definitions and shared types
- `client/src/App.tsx` — frontend router and page map
- `drizzle.config.ts` — DB migration config

## Core Features
- Feature 1: Embeddable quote calculators (configurable fields, slug-based public URLs)
- Feature 2: Booking system with scheduling and confirmation
- Feature 3: AI chat employee (OpenAI-powered, embeddable)
- Feature 4: SMS notifications and follow-ups (Twilio)
- Feature 5: Lead management and analytics dashboard
- Feature 6: Stripe-based billing / subscription plans
- Feature 7: Marketing site (home, pricing, features, docs, templates)

## Data Flow
User action → React component → TanStack Query (API call) → Express route → Storage layer → Drizzle ORM → PostgreSQL → JSON response → React UI update

Background jobs (node-cron scheduler) also trigger notifications and follow-ups independently.

## Current Constraints
- Prefer minimal edits
- Reuse existing Radix UI + Tailwind patterns
- Avoid adding new dependencies without justification
- Do not rewrite architecture unless asked
- Shared schema in `shared/schema.ts` — changes affect both client and server

## Common Commands
- install: `npm install`
- dev: `npm run dev`
- build: `npm run build`
- db push: `npm run db:push`
- type check: `npm run check`

## Risk Areas
- `server/routes.ts` — central API file; changes affect all endpoints
- `shared/schema.ts` — Drizzle schema; changes require DB migration (`db:push`)
- Stripe integration — payment/subscription logic
- Twilio integration — SMS sending (`server/twilioClient.ts`)
- Auth — Passport.js session-based auth
- Background scheduler — `server/jobs/` handles timed notifications and follow-ups

## Notes for Claude
- Follow existing Radix UI + Tailwind component patterns in `client/src/components/`
- Marketing pages live in `client/src/pages/marketing/`
- App/dashboard pages live in `client/src/pages/` (Wizard, Calculator, Leads, Dashboard)
- All DB access goes through the storage interface in `server/storage.ts`
- Keep code modular and production-oriented
- Test after changes — use dev server to verify visually if no test suite

---

## Single Source of Truth Files

These files own their domain across the
entire platform. Always update them first.
Never hardcode their data elsewhere.

### server/data/services.ts
Owns: all service names, prices,
descriptions, features, and issue mappings.
Auto-syncs to:
  - Audit report Tab 3 (action plan)
  - Nav dropdown menu
  - Pricing page
  - AI chat widget context
  - Bundle recommendations
Update this file when:
  - Any price changes
  - Service added or removed
  - Description or features change
Never hardcode service names or prices
in any other file.

### shared/schemas/
Owns: all database table definitions.
Update here first when adding new fields.

---

## File Ownership Rules

These rules prevent cross-file breakage.
State which file you are working on
before making any changes.

  FreeAudit.tsx — data/logic ONLY
    No UI components. No design tokens.

  ReportView.tsx — UI/display ONLY
    No API calls. No data fetching.

  auditRoutes.ts — audit backend ONLY
    No unrelated routes or logic.

  services.ts — service data ONLY
    No business logic. Pure data.

---

## Code Style Rules

- New React components: inline styles only
- No Tailwind in new components
- All external API calls: Promise.allSettled
  with graceful null fallback
- Never crash the audit if one API fails
