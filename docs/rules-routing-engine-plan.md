# Rules & Routing Engine — Implementation Plan

## Context

WeFixTrades is operationally driven by status fields, timestamps, and boolean flags spread across
eight+ database tables. Right now there is no system that looks across those fields and decides
what needs attention, who owns it, or how urgent it is. Admins must manually scan tickets,
tasks, and onboarding submissions to find what is stale, blocked, or failed. This plan
introduces a **deterministic Rules & Routing Engine** that reads existing data, evaluates
rule conditions, assigns items to named queues, and writes an audit trail — with no
freeform AI involvement in routing decisions.

---

## 1. CURRENT RULES / ROUTING STATE

### What exists (routing logic today)

| Location | What it does |
|---|---|
| `server/routes/stripeBillingRoutes.ts` | Stripe webhook: on `checkout.session.completed` → provisions service, creates tasks, sends onboarding email. On `invoice.payment_failed` → records `clientPayments.status = "failed"`. |
| `server/routes/onboardingPublicRoutes.ts` | On form submit → `onboardingSubmissions.status = "submitted"`. On first view → `"viewed"`. |
| `server/routes/adminSupportRoutes.ts` | Admin manually PATCH ticket status. Sets `resolved_at`/`closed_at` timestamps. |
| `server/storage.ts` | `updateClientService()`: when service status → `"active"`, auto-sets `clients.status = "active"`. |
| `server/jobs/followupWorker.ts` | Skips followup if `lead.status !== "new"`. Only explicit routing gate in any worker. |

### What is missing / fully manual

- No stale-detection (no code checks if onboarding is overdue, tasks are stuck, payments are past due)
- No queue assignment — items sit in DB state with no concept of "this needs human attention in queue X"
- No escalation automation — `fulfillmentTasks.escalation_flag` exists in schema but is never set by code
- No cross-entity routing (e.g. failed payment → billing queue; no support ticket auto-created)
- No completeness checks for onboarding submissions
- `fulfillmentTasks.human_review_required` boolean exists but triggers no workflow
- `clients.human_override` boolean exists but is never acted on

---

## 2. DIAGNOSIS

**Biggest gaps:**

1. **No staleness detection.** Onboarding sent 5 days ago, not submitted? Nothing fires. Tasks stuck "in_progress" for 10 days? No alert. Invoices past due? No routing.
2. **Queue concept does not exist.** There is a `supportTickets.status` and `fulfillmentTasks.status` but no named work queues the business can act on as a list.
3. **Escalation flags are inert.** Schema has `escalation_flag` and `human_review_required` but no code reads them to trigger anything.
4. **Billing failures are silent.** `clientPayments.status = "failed"` is recorded by Stripe webhook but nothing routes it to an actionable queue.
5. **Support ticket routing is entirely manual.** Priority, category, and assignment all require an admin to touch the ticket. No rule elevates an urgent billing complaint automatically.
6. **Vendor tasks have no tracking.** `handled_by = "supplier"` tasks can sit in waiting state indefinitely with no timeout rule.
7. **AI copilot is read-only by necessity** — because there is no routing layer for it to hand off to.

---

## 3. TARGET ARCHITECTURE

```
[Events / Webhooks / State Changes]
         │
         ▼
[Intake Handoff Layer]           ← existing routes write to DB as today
         │ (existing tables: fulfillmentTasks, onboardingSubmissions, clientPayments, etc.)
         ▼
[Rule Evaluation Layer]          ← NEW: server/engine/evaluator.ts
  - Reads entity data from DB
  - Applies typed rule functions per domain
  - Returns QueueAssignment[]
         │
         ▼
[Queue Assignment Layer]         ← NEW: writes to routing_events table
  - entity_type + entity_id + queue name + rule_name + reason + evaluated_at
  - Idempotent: same item can be re-evaluated; only new events written on change
         │
         ▼
[Escalation Layer]               ← Phase 4: controlled mutations
  - Sets escalation_flag = true on tasks
  - Elevates ticket priority
  - Creates internal notes
  - Creates support tickets from billing failures
         │
         ▼
[Audit / Logging Layer]          ← writes to existing adminActivityLog
  - actor_type = "system", actor_name = "routing_engine"
  - action = "routing.queued", entity_type, entity_id, summary
         │
         ▼
[Downstream Consumers]
  ├── Admin UI queue views   ← read from routing_events
  ├── Admin Copilot          ← gets queue counts/items in page context
  └── Background AI Ops      ← receives flagged items for summarization (future)
```

---

## 4. CORE QUEUES / WORKFLOW STATES

Each queue maps to a named string constant. Items enter a queue via a `routing_events` row.
Multiple queues can hold the same entity simultaneously (see conflict rules in §5c).

### Onboarding queues

| Queue | Entity | Exact Trigger Condition |
|---|---|---|
| `onboarding_followup` | `onboarding_submissions` | `status IN ("sent","viewed")` AND `NOW() - COALESCE(sent_at, created_at) > 3 days` |
| `onboarding_review_pending` | `onboarding_submissions` | `status = "submitted"` AND `approved_at IS NULL` AND `NOW() - submitted_at > 1 day` |

**Distinction:** `onboarding_followup` fires when the *client* has not acted. `onboarding_review_pending` fires when the client *has* submitted but *admin* has not approved. They are mutually exclusive — a submission cannot be both `submitted` and `sent/viewed` at the same time.

### Fulfillment queues

| Queue | Entity | Exact Trigger Condition |
|---|---|---|
| `fulfillment_ready` | `fulfillment_tasks` | `status = "not_started"` AND `client_service.status = "active"` AND zero sibling tasks (same `client_service_id`) with `status = "blocked"` AND zero sibling tasks with `status = "waiting" AND waiting_on = "internal"` |
| `blocked_fulfillment` | `fulfillment_tasks` | `status = "blocked"` OR (`status = "waiting"` AND `COALESCE(last_action_at, created_at) < NOW() - 5 days`) |
| `ops_alert` | `fulfillment_tasks` | (`due_at IS NOT NULL` AND `due_at < NOW()` AND `status NOT IN ("delivered","cancelled")`) OR `automation_status = "failed"` OR `escalation_flag = true` |
| `qa_review` | `fulfillment_tasks` | `status = "delivered"` AND `human_review_required = true` AND `completed_at IS NULL` |
| `vendor_review` | `fulfillment_tasks` | `handled_by = "supplier"` AND `status = "waiting"` AND `waiting_on = "supplier"` AND `COALESCE(last_action_at, created_at) < NOW() - 7 days` |

**fulfillment_ready sibling check:** Query `fulfillment_tasks WHERE client_service_id = $id AND status IN ("blocked")`. If count > 0, suppress `fulfillment_ready` for all tasks in that service. This prevents starting work that depends on a blocked predecessor.

### Billing queues

| Queue | Entity | Exact Trigger Condition |
|---|---|---|
| `billing_attention` | `client_payments` | `status = "failed"` OR (`status = "pending"` AND `due_at IS NOT NULL` AND `due_at < NOW()`) |

### Support queues

| Queue | Entity | Exact Trigger Condition |
|---|---|---|
| `urgent_support` | `support_tickets` | `priority = "urgent"` OR (`category = "billing"` AND `priority IN ("high","urgent")`) |
| `support_sla_breach` | `support_tickets` | `status IN ("open","in_progress")` AND `NOW() - created_at > 48 hours` AND `priority != "urgent"` |
| `needs_triage` | `support_tickets` | `status = "open"` AND `assigned_to IS NULL` AND `ai_summary IS NULL` |

**Distinction between urgent_support and support_sla_breach:** `urgent_support` is driven by *priority or category* — it fires immediately when a ticket is marked urgent or is a high-priority billing issue, regardless of age. `support_sla_breach` is driven purely by *elapsed time* — an ordinary ticket that has aged past 48 hours without resolution. They can fire on different tickets. A ticket already in `urgent_support` suppresses `support_sla_breach` (see §5c precedence).

### Client / service queues

| Queue | Entity | Exact Trigger Condition |
|---|---|---|
| `admin_approval` | `clients` / `client_services` | `(clients.human_override = true)` OR `(client_services.human_review_required = true AND client_services.status NOT IN ("cancelled","completed"))` |

---

## 5. DETERMINISTIC RULE MODEL

**Approach: Code-first with threshold config file.**

Rules are TypeScript functions. Each returns `QueueAssignment | null`.
A central evaluator runs all rules and collects results.
Thresholds live in a single config file — not the database — so they are version-controlled.

```
server/engine/
  thresholds.ts          ← named constants: ONBOARDING_STALE_DAYS = 3, VENDOR_STALE_DAYS = 7, etc.
  types.ts               ← QueueName enum, QueueAssignment interface, OwnerType enum
  evaluator.ts           ← runAllRules(context) → QueueAssignment[]
  routingWorker.ts       ← cron-compatible: scoped batch loader, evaluates, writes routing_events
  rules/
    onboardingRules.ts   ← rules for onboardingSubmissions
    fulfillmentRules.ts  ← rules for fulfillmentTasks
    billingRules.ts      ← rules for clientPayments
    supportRules.ts      ← rules for supportTickets
    clientRules.ts       ← rules for clients / clientServices
```

---

### 5a. Routing Output Contract

Every `QueueAssignment` produced by a rule must include all of the following fields:

```typescript
interface QueueAssignment {
  entity_type:          string;      // "fulfillment_task" | "onboarding_submission" | "client_payment" | "support_ticket" | "client_service"
  entity_id:            number;
  current_status:       string;      // exact value of the entity's status field at evaluation time
  assigned_queue:       QueueName;   // named queue constant
  priority:             "low" | "normal" | "high" | "urgent";
  owner_type:           OwnerType;   // see ownership model below
  rule_name:            string;      // e.g. "onboarding_stale", "payment_failed"
  reason:               string;      // human-readable: "Sent 4d ago, not submitted"
  blocked_reason?:      string;      // present only if queue is blocked_fulfillment / ops_alert
  next_action_required: string;      // e.g. "Follow up with client", "Escalate to admin"
  requires_human:       boolean;     // true = must not be acted on by automation alone
}
```

`priority` is set by the rule, not inherited from the entity — a task can be `normal` priority
in the DB but the rule assigns `high` if the overdue threshold is exceeded.

**Example rule:**

```typescript
// onboardingRules.ts
export function checkOnboardingStale(sub: OnboardingSubmission): QueueAssignment | null {
  if (!["sent", "viewed"].includes(sub.status)) return null;
  const ageDays = diffDays(sub.sent_at ?? sub.created_at, new Date());
  if (ageDays < ONBOARDING_STALE_DAYS) return null;
  return {
    entity_type: "onboarding_submission",
    entity_id: sub.id,
    current_status: sub.status,
    assigned_queue: "onboarding_followup",
    priority: ageDays > 7 ? "high" : "normal",
    owner_type: "admin",
    rule_name: "onboarding_stale",
    reason: `Sent ${ageDays}d ago, not submitted`,
    next_action_required: "Send follow-up or contact client directly",
    requires_human: true,
  };
}
```

---

### 5b. Ownership Model

Each queue has a **default owner type**. Owner type determines who is responsible for acting.

```typescript
enum OwnerType {
  system  = "system",   // automated action expected; no human needed yet
  admin   = "admin",    // internal team member must act
  vendor  = "vendor",   // external supplier must act
  client  = "client",   // client must act (e.g. complete onboarding)
}
```

**Queue → default owner mapping:**

| Queue | Default Owner | Notes |
|---|---|---|
| `onboarding_followup` | `admin` | Admin sends follow-up to client |
| `onboarding_review_pending` | `admin` | Admin reviews submitted responses |
| `fulfillment_ready` | `system` | Task can proceed; may auto-assign |
| `blocked_fulfillment` | `admin` | Admin must identify and resolve blocker |
| `ops_alert` | `admin` | Overdue/escalated; requires human attention |
| `qa_review` | `admin` | Human must sign off on delivered work |
| `billing_attention` | `admin` | Admin contacts client or retries charge |
| `urgent_support` | `admin` | Immediate human response required |
| `support_sla_breach` | `admin` | SLA clock exceeded; escalation required |
| `needs_triage` | `admin` | Assign and categorize before action |
| `vendor_review` | `vendor` | Supplier is stalled; admin to chase |
| `admin_approval` | `admin` | Explicit approval gate; requires_human = true always |

`requires_human = true` is forced for: `urgent_support`, `admin_approval`, `qa_review`, `ops_alert`.
`requires_human = false` is allowed for: `fulfillment_ready`, `needs_triage` (AI can prepare summary).

---

### 5c. Conflict Resolution & Queue Precedence

**Allowed combinations (same entity can be in both simultaneously):**

- `onboarding_followup` + `billing_attention` — distinct concerns, both valid
- `blocked_fulfillment` + `ops_alert` — blocked task that is also overdue
- `needs_triage` + `urgent_support` — ticket is urgent AND untriaged
- `vendor_review` + `ops_alert` — vendor stalled AND task overdue

**Mutually exclusive pairs (only highest-precedence queue applies):**

| Pair | Precedence rule |
|---|---|
| `onboarding_followup` vs `onboarding_review_pending` | If status = "submitted", only `onboarding_review_pending` applies |
| `urgent_support` vs `support_sla_breach` | `urgent_support` takes precedence (higher severity) |
| `fulfillment_ready` vs `blocked_fulfillment` | If any sibling task is `blocked`, `fulfillment_ready` does NOT fire |
| `needs_triage` vs `urgent_support` | `urgent_support` takes precedence; `needs_triage` suppressed |

**Primary vs secondary flags:**

The first matching queue for an entity is its **primary queue** (highest precedence rule that fired).
All additional queues are **secondary flags** — stored in `routing_events` with `is_primary = false`.
Admin UI shows primary queue in the main work list; secondary flags appear as badges.

**Precedence order (highest to lowest):**

1. `ops_alert`
2. `urgent_support`
3. `support_sla_breach`
4. `admin_approval`
5. `blocked_fulfillment`
6. `billing_attention`
7. `qa_review`
8. `vendor_review`
9. `onboarding_review_pending`
10. `onboarding_followup`
11. `fulfillment_ready`
12. `needs_triage`

---

### 5d. Event Lifecycle (routing_events)

Routing events have three distinct resolution paths — not one generic "resolved" flag:

```
routing_events
  id                serial PK
  entity_type       varchar(50)
  entity_id         integer
  assigned_queue    varchar(50)
  is_primary        boolean         -- true = primary queue for this entity
  rule_name         varchar(100)
  reason            text
  blocked_reason    text            -- nullable
  next_action       text
  requires_human    boolean
  owner_type        varchar(20)
  priority          varchar(20)
  current_status    varchar(30)     -- entity status at time of evaluation
  -- Lifecycle fields:
  state             varchar(30)     -- "active" | "system_resolved" | "admin_acknowledged" | "snoozed"
  system_resolved_at  timestamp     -- set when condition no longer holds (engine sets this)
  acknowledged_at     timestamp     -- set when admin marks it handled (human sets this)
  acknowledged_by     integer       -- user_id of acknowledging admin
  snoozed_until       timestamp     -- set when admin snoozes (re-activates after this time)
  -- Audit:
  evaluated_at      timestamp       -- updated each cycle; shows last check time
  created_at        timestamp
```

**State transitions:**

```
active
  → system_resolved    when: engine re-evaluates and condition no longer holds
  → admin_acknowledged when: admin clicks "acknowledge" in UI (human has seen/acted on this instance)
  → snoozed            when: admin sets snooze; engine re-activates after snoozed_until

snoozed
  → active             when: NOW() > snoozed_until AND condition still holds
  → system_resolved    when: condition no longer holds (even while snoozed)

admin_acknowledged and system_resolved are terminal for that event INSTANCE.
```

**Re-queue after acknowledgement (admin_acknowledged is not permanently terminal):**

`admin_acknowledged` means "a human saw and handled this specific routing event." It does NOT mean
the underlying business condition is fixed. If the condition persists long enough after acknowledgement,
the engine creates a **new** routing event with a new `created_at`, a fresh reason string noting
the prior acknowledgement, and the cycle restarts.

Re-queue is not immediate — each queue type has a **requeue threshold** before a new event fires:

| Queue | Requeue threshold after admin_acknowledged |
|---|---|
| `billing_attention` | 24 hours — if payment still failed/past-due after 24h, new event: "Still unresolved 24h after acknowledgement" |
| `urgent_support` | 4 hours — ticket still open/in_progress and still urgent after 4h |
| `support_sla_breach` | 24 hours — ticket still open/in_progress past SLA after 24h |
| `blocked_fulfillment` | 48 hours — task still blocked after 48h |
| `ops_alert` | 24 hours — still overdue/escalated after 24h |
| `vendor_review` | 48 hours — supplier still stalled after 48h |
| `onboarding_followup` | 3 days — client still hasn't submitted after another 3 days |
| `onboarding_review_pending` | 2 days — admin still hasn't approved after 2 more days |
| `qa_review` | 3 days — delivered task still pending QA sign-off after 3 days |
| `admin_approval` | 2 days — approval gate still uncleared after 2 days |
| `needs_triage` | 12 hours — ticket still untriaged after 12h |
| `fulfillment_ready` | No requeue — if task sits not_started, the condition is still true continuously; existing active event stays active (not re-acknowledged into terminal state without the condition clearing) |

**Implementation:** Worker checks: for each `admin_acknowledged` event, if condition STILL holds AND
`NOW() - acknowledged_at > requeue_threshold[queue]` → insert new `active` event with `reason` prefixed
with "Re-flagged: still unresolved after acknowledgement on [date]."

Idempotency: before inserting any new event, check for existing `active` or `snoozed` row with same
`(entity_type, entity_id, assigned_queue)`. If found, update `evaluated_at` and `current_status` only.
Do not create duplicate active events.

---

## 5e. Worker Scope Controls

The routing worker must not do full-table scans on every cycle. These constraints are non-negotiable.

**Active-only scans:** Each query filters to only records that can possibly qualify for a queue.
Never scan terminal-state records. Specific exclusions per entity:

| Entity | Excluded states (never scan) |
|---|---|
| `onboarding_submissions` | `approved`, `needs_followup` |
| `fulfillment_tasks` | `delivered`, `cancelled` |
| `client_payments` | `paid`, `refunded` |
| `support_tickets` | `resolved`, `closed` |
| `clients` / `client_services` | `churned`, `cancelled`, `completed` |

**Batch limits:** Each worker cycle processes at most N records per entity type to bound runtime.
Default batch limits (configurable in `thresholds.ts`):

```
BATCH_LIMIT_ONBOARDING   = 200
BATCH_LIMIT_FULFILLMENT  = 500
BATCH_LIMIT_BILLING      = 200
BATCH_LIMIT_SUPPORT      = 300
BATCH_LIMIT_CLIENT       = 200
```

If a batch is saturated (returned rows = limit), the worker logs a warning to `jobLogs.metadata`
so the operator knows records may have been missed that cycle.

**Changed-since windows:** For entities with `updated_at` timestamps, prefer scanning only records
updated since the last successful worker run. Worker stores `last_run_at` in `jobLogs` metadata.
Query: `WHERE updated_at > last_run_at OR (state = "active" AND evaluated_at < NOW() - 10 minutes)`.
The second clause ensures existing active events are re-validated even if entity was not recently
updated (catches records that age into a threshold without an `updated_at` change).

Entities without reliable `updated_at` (e.g. checking sibling tasks) always use the active-only
filter as a full scan substitute — these are bounded by `status NOT IN (terminal states)`.

**Overlap guard:** Worker registers a `jobLogs` entry with `status = "running"` at start.
If an entry with `job_name = "routing_engine"` and `status = "running"` already exists and
`started_at > NOW() - 10 minutes`, skip the cycle entirely. This prevents overlap on slow
database cycles without an external lock service.

---

## 6. V1 SCOPE

The smallest useful first version:

1. `routing_events` table added to schema + migration
2. `server/engine/` scaffolded with types, thresholds, evaluator, and four rule files
3. `routingWorker.ts` registered in scheduler as a new cron job (runs every 5 minutes)
4. Rules implemented for: `onboarding_followup`, `blocked_fulfillment`, `ops_alert`, `billing_attention`, `urgent_support`
5. All routing decisions write to `routing_events` — **no mutations to existing records**
6. `adminActivityLog` entry written for each new routing event (actor_type = "system")
7. One read-only admin endpoint: `GET /api/admin/routing/queue/:queueName` returning active routing events

V1 is purely detection and logging. No existing entity statuses are changed. Safe to ship without UI.

---

## 7. PHASED IMPLEMENTATION PLAN

### Phase 1 — Foundation (schema + structure)
**Goal:** Infrastructure in place. No logic yet.

- Add `routing_events` table to `shared/schemas/adminCrm.ts`
- Write migration (Drizzle push or migration file)
- Create `server/engine/types.ts` — QueueName enum, interfaces
- Create `server/engine/thresholds.ts` — all threshold constants
- Create `server/engine/evaluator.ts` — empty `runAllRules()` stub
- Create `server/engine/rules/` with four empty rule files
- Add `routing_events` CRUD methods to `server/storage.ts`

**Risk:** Zero — no existing code touched except schema append and storage additions.

---

### Phase 2 — Rule Implementation (read-only detection)
**Goal:** Engine runs on schedule, writes routing events, changes nothing else.

- Implement all five V1 rules (onboarding, fulfillment, billing, support, ops)
- Create `server/engine/routingWorker.ts` — loads entities in batches, calls evaluator, writes events
- Register routingWorker in `server/jobs/scheduler.ts` (every 5 minutes cron)
- Write to `adminActivityLog` on new routing events
- Add `GET /api/admin/routing/queue/:queueName` to `server/routes/adminCrmRoutes.ts`

**Risk:** Low — read-only. Only new rows written to new tables.

---

### Phase 3 — Admin Surfacing
**Goal:** Admins can see routed queues in the UI.

- Add queue summary to admin dashboard page context (counts per queue)
- Expose queue counts in `server/services/promptBuilder.ts` `PageContext` for Admin Copilot
- Add per-queue list views to admin frontend (read from routing_events + join entity tables)
- Add `POST /api/admin/routing/events/:id/acknowledge` — admin marks event handled
- Add `POST /api/admin/routing/events/:id/snooze` — admin snoozes event with `snoozed_until` timestamp

**Risk:** Low — only new UI and new read endpoints.

---

### Phase 4 — Controlled Actions
**Goal:** Engine can make limited, logged mutations when conditions are met.

- `billingRules.ts`: on `billing_attention` event → auto-create a support ticket (`category="billing"`, `priority="high"`, `source="system"`) if none exists for the payment
- `fulfillmentRules.ts`: on persistent `ops_alert` (> 24h unresolved) → set `fulfillmentTasks.escalation_flag = true`
- `supportRules.ts`: on `urgent_support` → elevate ticket priority to "urgent" if currently "normal" or "low"
- All mutations logged to `adminActivityLog` with `actor_type = "system"`

**Risk:** Medium — mutations to existing records. Must be idempotent and logged. Each action gated by: (a) condition still true, (b) no human has already acted, (c) not already done by a prior routing cycle.

---

### Phase 5 — Downstream Integration
**Goal:** Routing engine hands off to AI Ops and notification system.

- Enqueue notification to admin on new `urgent_support` or `ops_alert` routing events
- Expose routing queue data to Background AI Ops engine so it can summarize flagged items
- Add `needs_triage` queue: flag support tickets for AI summary generation
- Add `vendor_review` and `admin_approval` queues
- Add `qa_review` and `onboarding_blocked` queues

**Risk:** Low per integration — each is additive.

---

## 8. FILES / AREAS INVOLVED

**New files to create:**
```
server/engine/types.ts
server/engine/thresholds.ts
server/engine/evaluator.ts
server/engine/routingWorker.ts
server/engine/rules/onboardingRules.ts
server/engine/rules/fulfillmentRules.ts
server/engine/rules/billingRules.ts
server/engine/rules/supportRules.ts
server/engine/rules/clientRules.ts
```

**Existing files to modify:**
```
shared/schemas/adminCrm.ts          ← add routing_events table definition
server/storage.ts                   ← add createRoutingEvent(), resolveRoutingEvent(), listQueueItems()
server/jobs/scheduler.ts            ← register routingWorker cron (every 5 min)
server/routes/adminCrmRoutes.ts     ← add GET /api/admin/routing/queue/:queueName
server/services/promptBuilder.ts    ← add queue counts to PageContext (Phase 3)
```

**Read-only reference files (no changes needed):**
```
shared/schemas/db.ts                ← supportTickets, leads, clientPayments schemas
server/routes/stripeBillingRoutes.ts
server/routes/adminSupportRoutes.ts
server/routes/onboardingPublicRoutes.ts
```

---

## 9. RISKS / EDGE CASES

| Risk | Mitigation |
|---|---|
| Same item qualifies for multiple queues simultaneously | Allowed — `routing_events` has one row per `(entity_type, entity_id, queue)`. Admin UI shows primary queue prominently; secondary flags as badges. |
| Admin acknowledges an item but condition still holds | `admin_acknowledged` closes that event instance. If the condition persists past the per-queue requeue threshold, engine creates a new `active` event with updated reason. Admin cannot silence a real problem indefinitely without fixing it. |
| Admin snoozes an item; condition resolves before snooze expires | Engine marks event `system_resolved` regardless of snooze state. Snoozed events are checked for condition expiry on every cycle. |
| Partial onboarding (some steps filled, not submitted) | Rule checks `status IN ("sent","viewed")` only — partial fill without submit does not trigger `onboarding_review_pending`. |
| Payment marked "failed" then retried and paid | Stripe webhook sets `status = "paid"`; next routing cycle finds condition no longer holds → marks event `system_resolved`. |
| Fulfillment task blocked then unblocked by admin | Status change to `"in_progress"` → next cycle finds `status != "blocked"` → `system_resolved`. |
| Engine runs while admin is actively editing a record | Engine is read-only in Phase 2. In Phase 4, mutations are idempotent and only applied if `admin_acknowledged` is not already set. |
| Routing worker overlaps with itself | `jobLogs` overlap guard (see §5e) prevents concurrent cycles. |
| Vendor task `last_action_at` is null | Rule uses `COALESCE(last_action_at, created_at)` so null is treated as task creation time. |
| `due_at` null on fulfillment tasks | `ops_alert` overdue condition requires `due_at IS NOT NULL` explicitly. |
| `fulfillment_ready` fires for task with a blocked sibling added after task was queued | Worker re-evaluates all active `fulfillment_ready` events each cycle; if sibling is now blocked, event is `system_resolved`. |
| Batch limit reached mid-table | Worker logs warning to `jobLogs.metadata`; remaining records processed on next 5-min cycle. No records are skipped permanently. |

---

## 10. RECOMMENDED FIRST STEP

**Add `routing_events` table to `shared/schemas/adminCrm.ts` and add four storage methods to `server/storage.ts`:**

1. `createRoutingEvent(data)` — insert with idempotency check (`active`/`snoozed` row for same key → update `evaluated_at` only)
2. `systemResolveRoutingEvent(entityType, entityId, queue)` — set `state = "system_resolved"`, `system_resolved_at = NOW()` when condition no longer holds
3. `adminAcknowledgeRoutingEvent(id, userId)` — set `state = "admin_acknowledged"`, `acknowledged_at`, `acknowledged_by`
4. `listQueueItems(queue, limit)` — return `state IN ("active", "snoozed")` routing events for a queue, joined to a minimal entity summary

This is the only prerequisite for everything else. It can be done, reviewed, and deployed in isolation before any rule logic is written. Once this is in place, Phase 2 rule implementation can begin immediately.
