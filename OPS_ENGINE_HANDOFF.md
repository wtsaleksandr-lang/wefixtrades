# Background AI Ops Engine — Handoff Context

**Branch:** `claude/design-ai-ops-engine-XMSKQ`
**Last session:** Phase 1 complete + smoke tested (51/51 pass)
**Next task:** `top_signals` field addition + Phase 2A ticket triage

---

## What Has Been Built (Phase 1 — Committed & Pushed)

### New files created
| File | Purpose |
|---|---|
| `server/services/opsDetectors.ts` | Deterministic SQL detection — ZERO AI. Four detectors output `OpsSignal[]` |
| `server/services/opsEngine.ts` | AI-only summarizer. Receives `OpsSignal[]`, calls Claude, validates output, stores snapshot |
| `server/jobs/opsIntelligenceJob.ts` | Daily job worker: runs detectors → engine |
| `server/routes/adminOpsRoutes.ts` | Admin API: GET /api/admin/ops/summary/daily, GET /api/admin/ops/snapshots, GET /api/admin/ops/snapshots/:id, POST /api/admin/ops/run |

### Modified files
| File | Change |
|---|---|
| `shared/schemas/adminCrm.ts` | Added `opsSnapshots` table (lines ~275–294) |
| `server/jobs/scheduler.ts` | Added `ops_daily_intelligence` cron at 07:00 UTC |
| `server/routes/index.ts` | Registered `adminOpsRoutes` |
| `client/src/pages/admin/CrmOverview.tsx` | Added `OpsIntelligenceWidget` showing priorities, risks, recommendations |

### Database table: `ops_snapshots`
```
id, snapshot_type, generated_at, period_start, period_end,
raw_signals (JSONB)      ← full OpsSignal[] — system truth, never AI
ai_output (JSONB)        ← DailyOpsSummaryOutput — AI explanation only
prompt_version, detector_version,
model_used, input_tokens, output_tokens, estimated_cost_usd,
signal_count, metadata (JSONB)
```
Migration status: **applied** (`drizzle-kit push` confirmed).

---

## Core Types (do not change without updating detectors + engine + UI)

### OpsSignal (defined in `server/services/opsDetectors.ts`)
```typescript
type OpsSignalSeverity = "low" | "medium" | "high" | "critical";

interface OpsSignal {
  type: string;          // e.g. "onboarding_stall", "task_blocked", "payment_failed"
  entity_type: string;   // e.g. "onboarding_submission", "fulfillment_task"
  entity_id: number;
  severity: OpsSignalSeverity;  // SET BY DETECTOR RULES ONLY, never by AI
  reason: string;
  detected_at: string;   // ISO timestamp
  metadata?: Record<string, any>;
}
```

### DailyOpsSummaryOutput (defined in `server/services/opsEngine.ts`)
```typescript
interface DailyOpsSummaryOutput {
  summary: string;
  priorities: OpsPriority[];   // max 10, ordered high→low
  risks: string[];             // max 5
  recommendations: string[];   // max 5
}

interface OpsPriority {
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  reason: string;
  related_entities: Array<{ type: string; id: number }>;
}
```

### Detector severity rules (DETERMINISTIC — no AI involved)
| Detector | Rule |
|---|---|
| `detectOnboardingStalls` | needs_followup→high; idle≥5d→high; idle 2–4d→medium; <2d→low |
| `detectBlockedTasks` | escalation_flag→critical; blocked→high; overdue→medium/high; waiting→low/medium |
| `detectOverduePayments` | failed→critical; overdue>7d→high; overdue 1–7d→medium |
| `detectUnansweredTickets` | urgent+24h→critical; high+48h→high; normal+72h→medium; low+96h→low |

---

## NEXT TASKS (approved, not yet implemented)

### TASK A: Add `top_signals` field to `opsSnapshots` table

**What:** Add a new JSONB column `top_signals` to the `ops_snapshots` table.

**Rules:**
- Derived from `raw_signals` ONLY — no AI involvement
- Sorted by severity (critical → high → medium → low)
- Capped at max 10 entries
- Computed in `opsEngine.ts` before the AI call
- Stored alongside `raw_signals`

**Purpose:**
- UI fallback when `ai_output` is null (AI failed)
- Deterministic priority display that never requires AI
- Future Rules & Routing Engine can consume it directly

**Where to change:**
1. `shared/schemas/adminCrm.ts` — add `top_signals: jsonb("top_signals")` column to `opsSnapshots` table
2. Run `drizzle-kit push` after schema change
3. `server/services/opsEngine.ts` — compute `top_signals` from `signals` arg before AI call, include in DB insert:
   ```typescript
   const SEVERITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };
   const topSignals = [...signals]
     .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])
     .slice(0, 10);
   ```
4. `client/src/pages/admin/CrmOverview.tsx` — update `OpsSnapshotResponse` type to include `top_signals` and use it as fallback when `ai_output` is null

---

### TASK B: Phase 2A — Ticket Triage (read-only, no DB mutations to supportTickets)

**Scope:**
- Extend `opsEngine.ts` with a ticket triage function
- Include triage results inside the daily `opsSnapshots` snapshot (add a `ticket_triage` field to `ai_output`)
- Surface triage results in `SupportInboxPage.tsx` — read from latest snapshot, show "AI Suggested" badge
- **NO writes to `supportTickets` table**
- **NO real-time trigger on ticket creation**
- **NO mutation to `ai_summary` or `ai_priority_hint` fields yet** (that is Phase 2B)

**New AI output contract extension:**

The `ai_output` JSONB stored in `opsSnapshots` should be extended to optionally include `ticket_triage`:

```typescript
interface TicketTriageItem {
  ticket_id: number;
  suggested_priority: "low" | "normal" | "high" | "urgent";
  suggested_category: "general" | "billing" | "service" | "onboarding" | "access" | "other";
  summary: string;        // 1-2 sentence AI summary of the ticket
  suggested_reply: string; // draft reply, clearly marked AI-generated
}

interface DailyOpsSummaryOutput {
  summary: string;
  priorities: OpsPriority[];
  risks: string[];
  recommendations: string[];
  ticket_triage?: TicketTriageItem[]; // NEW — max 10 tickets triaged
}
```

**Detector context for ticket triage:**
- Add `buildTicketTriageContext()` to `opsEngine.ts` (or a new `opsContextBuilder.ts`)
- Queries: open/in_progress tickets + their last few messages
- Passes compact ticket context to AI alongside daily signals
- AI returns `ticket_triage` array in the same JSON response

**UI changes (`SupportInboxPage.tsx`):**
- Fetch latest ops snapshot: `GET /api/admin/ops/summary/daily`
- For each ticket row in the inbox: look up `ticket_triage[].ticket_id`
- If a triage item exists for the ticket, show:
  - A small `AI Suggested` badge with the suggested priority (if different from current)
  - Tooltip or inline: AI summary sentence
- Keep it subtle — this is a suggestion, not a replacement for the real priority field
- No changes to any ticket data from the UI

---

## Architecture Rules (MUST NOT VIOLATE)

1. **`opsDetectors.ts`** — pure Drizzle SQL queries only. Zero AI. Severity assigned by hard rules only.
2. **`opsEngine.ts`** — AI calls only. No direct DB queries for business logic. Receives `OpsSignal[]`.
3. **`opsSnapshots`** — the only table written to by the ops engine in Phase 1 and 2A.
4. **`supportTickets.ai_summary` / `ai_priority_hint`** — NOT written to until Phase 2B (explicitly gated).
5. **All AI outputs labelled** — any UI surface showing AI data must say "AI Suggested" or "AI-generated".
6. **No auto-send, no auto-status-change** — everything in Phase 2A is read-only display.
7. **Hard JSON parse** — AI output must be validated field-by-field. Throw on invalid shape.
8. **`raw_signals` and `top_signals` always stored** — even when AI fails.

---

## Files to Read First

Before starting, read these files to understand current state:

1. `server/services/opsDetectors.ts` — full detector implementations + OpsSignal type
2. `server/services/opsEngine.ts` — full engine: prompt, validation, DB insert
3. `shared/schemas/adminCrm.ts` — opsSnapshots table definition (lines ~275–294)
4. `server/jobs/opsIntelligenceJob.ts` — simple job orchestrator
5. `server/routes/adminOpsRoutes.ts` — existing API endpoints
6. `client/src/pages/admin/CrmOverview.tsx` — OpsIntelligenceWidget (existing UI pattern to follow)
7. `client/src/pages/admin/SupportInboxPage.tsx` — where triage hints go in Phase 2A

---

## Implementation Order for Next Session

1. Add `top_signals` column to schema → run `npm run db:push`
2. Update `opsEngine.ts` to compute + store `top_signals`
3. Update `CrmOverview.tsx` widget to fall back to `top_signals` when `ai_output` is null
4. Extend `DailyOpsSummaryOutput` type with `ticket_triage?: TicketTriageItem[]`
5. Add ticket context builder to `opsEngine.ts` (query open tickets + messages)
6. Update the AI prompt to request `ticket_triage` alongside existing fields
7. Update `opsIntelligenceJob.ts` if needed
8. Add `ticket_triage` type to `SupportInboxPage.tsx` + fetch from `/api/admin/ops/summary/daily`
9. Render "AI Suggested" badge on matching ticket rows
10. Run `npm run db:push` if schema changed, re-run smoke tests
11. Commit + push to `claude/design-ai-ops-engine-XMSKQ`

---

## DB Connection (local dev)

```
DATABASE_URL=postgresql://wft:wft_dev@localhost:5432/wefixtrades
```
PostgreSQL 16 cluster must be started: `pg_ctlcluster 16 main start`

Run migration: `npm run db:push` (uses `DATABASE_URL` env var)

---

## Commit Convention

All commits go to branch: `claude/design-ai-ops-engine-XMSKQ`

Format:
```
feat(ops-engine): <description>

<body>

https://claude.ai/code/session_012PjjJQxQu51rnGyPeGqRN5
```
