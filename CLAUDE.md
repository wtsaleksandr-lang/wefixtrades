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
