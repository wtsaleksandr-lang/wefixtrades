# WeFixTrades — Claude Code Context

This file gives Claude Code (in VS Code or CLI) orientation before starting any task.
Read it before touching any file.

---

## Project Overview

WeFixTrades is a SaaS platform that sells digital marketing and automation services to trades
businesses (plumbers, electricians, roofers, etc.). It is evolving into an AI-operated service
control tower. The codebase is a TypeScript monorepo:

- **Backend:** Node.js + Express v5, Drizzle ORM, PostgreSQL
- **Frontend:** React 18, Vite
- **Jobs:** node-cron (in-process scheduler, no external queue server)
- **AI:** Anthropic Claude (primary), OpenAI (secondary), Vapi (voice)
- **Payments:** Stripe (subscriptions + one-time)
- **Comms:** Twilio (SMS/WhatsApp), Nodemailer (SMTP)

---

## Directory Structure

```
/shared/schemas/      ← DB table definitions (Drizzle + Zod)
  db.ts               ← leads, bookings, support tickets, notification queue, job logs
  adminCrm.ts         ← clients, services, fulfillment tasks, onboarding, payments, orders
  pricing.ts          ← pricing draft/job states

/server/
  routes/             ← Express route handlers (one file per domain)
  jobs/               ← Background workers (scheduler.ts, notificationWorker.ts, etc.)
  services/           ← Business logic helpers (aiService, promptBuilder, vapiService, etc.)
  lib/                ← Email transport, PDF generation, onboarding email, etc.
  storage.ts          ← Main data access layer (IStorage interface, ~1200 lines)
  auth.ts             ← Session auth (Passport.js, local strategy)

/client/src/
  pages/              ← React pages (admin/, portal/, public/)
  components/         ← Shared UI components
  config/             ← portalLabels.ts (status → display string mappings)

/docs/                ← Architecture plans and research
```

---

## Git discipline (binding for any agent in this repo)

1. Never commit directly to `main`. Always PR through a feature branch.
2. Before every commit run `git branch --show-current` and verify it
   matches your intended branch.
3. Stage by explicit file path — never `git add -A` or `git add .`.
4. Don't `git stash` across branch boundaries; working-tree state leaks
   between branches that way.
5. If another agent or human may be using the same checkout, before any
   commit run `git status` and confirm the working tree contains only
   your intended changes.
6. Don't checkout, rebase, or commit on a branch you didn't create
   unless you've been told to take it over.

---

## Active Feature Branch

**Branch:** `claude/design-rules-routing-engine-N2UmT`

This branch is currently in the **planning phase** for the Rules & Routing Engine.
The implementation plan is at: `docs/rules-routing-engine-plan.md`

---

## Current Work: Rules & Routing Engine

### What this is

A deterministic business logic layer that:
- Reads existing DB state (no new data sources needed)
- Applies typed rule functions per entity type
- Assigns items to named work queues
- Writes results to a new `routing_events` table
- Produces audit trail in existing `adminActivityLog`
- Does NOT use LLM judgment for routing decisions

### What is NOT done yet

- The `routing_events` table does not exist yet
- No `server/engine/` directory exists yet
- The routing worker has not been written
- No queue assignment logic exists anywhere

### Key design decisions already made

See `docs/rules-routing-engine-plan.md` for the full plan. Summary:

1. **New table:** `routing_events` — tracks queue assignments with full lifecycle
   (`active` → `system_resolved` | `admin_acknowledged` | `snoozed`)
2. **Re-queue policy:** `admin_acknowledged` is terminal for that event *instance*, but
   if the underlying condition still holds past a per-queue threshold, a NEW event is created
3. **New directory:** `server/engine/` with `types.ts`, `thresholds.ts`, `evaluator.ts`,
   `routingWorker.ts`, and `rules/` subdirectory
4. **Scheduler:** routingWorker added to `server/jobs/scheduler.ts` as a 5-minute cron
5. **Phase 1 first:** Schema + storage methods only — no rule logic yet

### Recommended first step

Add `routing_events` table to `shared/schemas/adminCrm.ts` and add four storage methods
to `server/storage.ts`:
- `createRoutingEvent(data)` — idempotent insert
- `systemResolveRoutingEvent(entityType, entityId, queue)` — condition cleared
- `adminAcknowledgeRoutingEvent(id, userId)` — human acted on this instance
- `listQueueItems(queue, limit)` — active/snoozed events for a queue

---

## Key Status Fields (already in DB — do not redefine)

```
clients.status:               lead | onboarding | active | paused | churned
clientServices.status:        pending | onboarding | active | paused | cancelled | completed
fulfillmentTasks.status:      not_started | submitted | in_progress | waiting | blocked | delivered | cancelled
fulfillmentTasks.priority:    low | normal | high | urgent
fulfillmentTasks.waiting_on:  client | supplier | internal
fulfillmentTasks.handled_by:  internal | supplier | automation
fulfillmentTasks.automation_status: idle | running | completed | failed
fulfillmentTasks.escalation_flag:   boolean (exists, currently unused)
fulfillmentTasks.human_review_required: boolean (exists, currently unused)
onboardingSubmissions.status: not_sent | sent | viewed | submitted | approved | needs_followup
clientPayments.status:        pending | paid | failed | partial | refunded
supportTickets.status:        open | in_progress | waiting_on_customer | resolved | closed
supportTickets.priority:      low | normal | high | urgent
supportTickets.category:      general | billing | service | onboarding | access | other
actor_type (all tables):      human | ai_agent | system
```

---

## Coding Conventions

- TypeScript strict mode throughout
- Drizzle ORM for all DB queries — no raw SQL except in migrations
- Zod schemas generated from Drizzle tables via `createInsertSchema()`
- All admin mutations logged to `adminActivityLog` with `actor_type`
- Background jobs use `jobLogs` table for run tracking (create + update pattern)
- Workers are run via node-cron in `server/jobs/scheduler.ts` — no external queue server
- No raw `console.log` in production paths — use prefixed `[Worker]`, `[Engine]`, etc.
- New routes are registered in `server/routes/index.ts`

### Error handling for fire-and-forget promises (do NOT use `.catch(() => {})`)

The `.catch(() => {})` pattern silently swallows failures. It shipped the
prerender bug for weeks in May 2026 and produced the entire Wave 92
silent-failure audit. Don't reach for it. The CI guard
`scripts/check-no-silent-catch.mjs` fails any new occurrence.

For a fire-and-forget Promise where you do NOT want to await but the
failure still matters (analytics writes, alert delivery, audit-trail
rows, cost-tracking, retry stamps, notification stamps, etc.), use
`noisyCatch` from `server/lib/silentFailureGuard.ts`:

```ts
import { noisyCatch } from "../lib/silentFailureGuard";

// Before — silent swallow:
storage.trackEvent({ ... }).catch(() => {});

// After — structured log + Sentry bridge on failure:
noisyCatch(storage.trackEvent({ ... }), {
  op: "calculator.trackEvent.view",
  meta: { calculatorId, deviceType },
});
```

`noisyCatch` returns `Promise<void>` so existing `await` semantics are
preserved — same call-site shape, just no longer silent.

If a return value matters (body-parse fallback, default-on-failure
boolean, etc.), use the explicit-return shape instead — those are NOT
silent and the guard does not flag them:

```ts
res.json().catch(() => ({}))        // body-parse fallback
fetch(url).catch(() => false)       // boolean-return guard
listFiles().catch(() => [])         // array-return guard
```

For exception blocks: `} catch {}` and `} catch (e) {}` with empty
bodies are flagged identically. Either log + re-throw, or use a
fall-through default, or use `noisyCatch` on the promise itself.

The narrow allowed-silent set lives in `scripts/silent-catch-baseline.txt`
— don't add to it without a strong reason (fs unlink of temp file,
idempotency-after-success metadata write, body-parse fallback that's
unguarded only because its return shape happens to match the pattern).

---

## Do Not Change Without Reading the Plan

- `shared/schemas/adminCrm.ts` — understand existing tables before adding
- `server/storage.ts` — large file; add methods at the end of the relevant section
- `server/jobs/scheduler.ts` — overlap guard logic is important; do not break existing jobs
- `server/routes/adminCrmRoutes.ts` — already has many routes; add routing endpoints in a
  clearly separated block

---

## Previous Work on This Branch

The support ticket system (schema, storage, admin routes, portal UI) was completed in earlier
commits on this branch. It is fully functional. Do not modify support ticket code unless
explicitly required by the routing engine implementation.

---

## References

- Full routing engine plan: `docs/rules-routing-engine-plan.md`
- Support ticket plan (completed): `docs/support-ticket-system-plan.md`
- DB schema: `shared/schemas/db.ts` and `shared/schemas/adminCrm.ts`
- Status label mappings: `client/src/config/portalLabels.ts`
