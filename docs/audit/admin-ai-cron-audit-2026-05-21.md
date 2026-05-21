# Wave AU-3 — Admin AI + Cron Audit

**Date:** 2026-05-21
**Branch:** `audit/wave-au3-ai-cron-dashboard`
**Scope:** Read-only inventory of every cron schedule and every AI integration in the WeFixTrades codebase, plus a gap analysis vs. Alex's request for an "AI that acts on behalf of admin on a cron schedule to operate the business."

---

## A. What exists today

### A.1 Cron schedules

All cron jobs are registered in [`server/jobs/scheduler.ts`](../../server/jobs/scheduler.ts) via `node-cron`. There is **no BullMQ / Redis-backed queue**; every recurring task is a plain `cron.schedule(...)` call with in-process overlap guards (`isRunning` booleans) and a `runJob()` wrapper that writes start/finish/error rows to the `job_logs` table.

Inventory (~50 distinct schedules):

| Job | Schedule (UTC) | Purpose | AI? |
|---|---|---|---|
| `daily_aggregation` | `0 2 * * *` | Rolls per-trade KPIs into daily aggregates | No |
| `chat_memory_cleanup` | `0 3 * * *` | Purges expired chat memory rows | No |
| `tradeline_bill_retention` | `30 3 * * *` | 90-day cleanup of TradeLine call bills | No |
| `trial_pro_expiry` | `0 4 * * *` | Flips trial flag past 14-day window + emails | No |
| `socialsync_expiry_check` | `0 4 * * *` | Warns on expiring SocialSync OAuth tokens | No |
| `quotequick_slug_release` | `30 4 * * *` | Releases stale free-tier QQ slugs (day-23 warn, day-30 release) | No |
| `contentflow_image_retention` | `30 4 * * *` | Deletes aged generated images from R2 | No |
| `competitor_snapshots` | `30 4 * * *` | Daily competitor metric snapshot | No |
| `reputation_token_refresh` | `15 3 * * *` | Proactive Google OAuth refresh | No |
| `socialsync_media_cleanup` | `0 5 * * *` | Cleans aged generated media | No |
| `embed_broken_detection` | `0 6 * * *` | Detects calculators with zero 14-day views, fires alerts | No |
| **`ops_daily_intelligence`** | `0 7 * * *` | Runs detectors then **Claude summarization** → `opsSnapshots` | **AI (summary only)** |
| `mapguard_review_responder` | `0 8 * * *` | Drafts + auto-posts GBP review replies | **AI (Claude)** |
| `adflow_metrics_check` | `0 8 * * *` | Alerts on missing month-end AdFlow metrics (28th-30th) | No |
| `contentflow_generation` | `30 8 * * *` | Daily per-client ContentFlow generation | **AI (Claude)** |
| `reputation_reports` | `0 9 * * *` | Monthly reputation reports per client | Partial |
| `trial_lifecycle` | `0 9 * * *` | Trial nudges + pause expired trials | No |
| `upsell_emails` | `0 10 * * *` | WebCare upsell 7d after delivery | No |
| `mapguard_post_drain` | `30 14 * * *` | Generates + publishes GBP local posts | **AI (Claude)** |
| `reputation_connect_nudge` | `0 16 * * *` | Re-nudges customers who never finished Google OAuth | No |
| `recurring_task_generation` | `0 1 * * *` | Generates monthly fulfillment tasks from templates | No |
| `weekly_email_report` | `0 13 * * 1` | Monday weekly summary email | No |
| `rankflow_plan_generation` | `0 4 * * 1` | Weekly RankFlow plan | Partial |
| `mapguard_weekly_scan` | `0 4 * * 2` | Weekly local-rank scan | No |
| `rankflow_tracking` | `0 5 * * 3` | Weekly RankFlow rank tracking | No |
| `mapguard_weekly_update` | `0 9 * * 5` | Friday client update emails | No |
| `socialsync_weekly_generation` | `0 6 * * 0` | Sunday batch content generation | **AI (Claude)** |
| `data_retention` | `30 2 * * 0` | Weekly cleanup of error logs + Stripe events | No |
| `mapguard_post_fanout` | `0 3 1 * *` | Monthly scheduled-post fan-out | No |
| `webcare_monthly_maintenance` | `0 3 1 * *` | WebCare plugin updates + reports (1st of month) | No |
| `mapguard_monthly_reports` | `0 10 2 * *` | Monthly reports | No |
| `rankflow_monthly_reports` | `0 11 2 * *` | Monthly reports | No |
| `socialsync_monthly_reports` | `0 12 2 * *` | Monthly reports | No |
| `adflow_monthly_reports` | `0 13 2 * *` | Monthly reports | No |
| `notification_worker` | `* * * * *` | Drains notification queue | No |
| `followup_worker` | `* * * * *` | Drains followup jobs | No |
| `audit_followup_worker` | `* * * * *` | Audit followups | No |
| `review_followup_worker` | `* * * * *` | Review followups | No |
| `email_queue` | `* * * * *` | Drains pending emails | No |
| `api_webhook_delivery` | `*/30 * * * * *` | Drains API webhook deliveries (every 30s) | No |
| `contentflow_publish_queue` | `*/2 * * * *` | Drains 5-channel publish queue | No |
| `reply_post_queue_drain` | `*/2 * * * *` | Retries failed GBP reply posts | No |
| `auto_activation` | `*/5 * * * *` | Auto-activates services when readiness met | No |
| `routing_engine` | `*/5 * * * *` | Applies typed rule functions, writes `routing_events` | No |
| `tradeline_mode_sync` | `*/5 * * * *` | Switches TradeLine mode by business hours | No |
| `dunning_queue` | `*/5 * * * *` | Day-2/5/7 billing reminders | No |
| `outbound_sync` | `*/15 * * * *` | Pushes prospects to Instantly/Smartlead | No |
| `webcare_health` | `*/15 * * * *` | WebCare site health pings | No |
| `tradeline_retry` | `*/15 * * * *` | Retries failed Vapi assistant builds | No |
| `review_request_delivery` | `*/15 * * * *` | Drains review-request sends | No |
| `tradeline_provision_retry` | `17 * * * *` | Hourly retry of queued TradeLine provisioning | No |
| `review_monitoring` | `0 */6 * * *` | Reviews polling every 6h | No |
| `socialsync_review_automation` | `0 */6 * * *` | Reviews automation every 6h | No |
| `contentflow_performance` | `*/30 * * * *` | Pulls engagement signals into draft.metadata | No |

**Total: ~55 scheduled jobs. Of those, 5 invoke Claude on a schedule**, all narrowly scoped to one product (ContentFlow generation, MapGuard reviews, MapGuard posts, SocialSync weekly, OpsEngine summary). The `setInterval` grep returned only rate-limiter / route-internal usage — no shadow schedulers.

### A.2 AI features (current)

| Feature | Provider | Trigger | Surface |
|---|---|---|---|
| Admin AI Copilot | Claude (`@anthropic-ai/sdk`) | User chat on admin dashboard | `surface: "admin"` actions in `adminTools.ts` |
| Portal AI Copilot | Claude | Customer chat in portal | `surface: "portal"` actions |
| TradeLine AI replies | Vapi (calls) | Inbound call routing | Realtime |
| QuoteQuick AI chat + vision | Claude | Customer chat / image-to-template | Realtime + per-customer |
| ContentFlow generation | Claude | Cron 08:30 UTC + manual | Per-client batch |
| MapGuard review responder | Claude | Cron 08:00 UTC | Auto-post when policy allows |
| MapGuard post drainer | Claude | Cron 14:30 UTC | Auto-publish to GBP |
| SocialSync weekly generation | Claude | Cron Sun 06:00 UTC | Per-client batch |
| **OpsEngine daily summary** | **Claude** | **Cron 07:00 UTC** | **Writes `opsSnapshots`, no actions taken** |
| ReplyIntelligence | Claude | Per-message in inbound concierge | Realtime |
| WebFix audit / SiteLaunch finalization | Claude | Per-onboarding | One-shot |
| Onboarding AI | Claude | Per-onboarding | One-shot |
| Inbound email classifier + concierge | Claude | Per-email | Realtime |

Provider footprint per `package.json`: `@anthropic-ai/sdk ^0.95.1` (primary, model default = `claude-haiku-4-5-20251001`), `openai ^6.22.0` (Whisper transcription only — see `whisper.ts`). No Gemini/Google AI SDK is imported.

### A.3 Copilot action registry (the closest thing to "AI acting on admin's behalf")

[`server/services/copilotActionRegistry.ts`](../../server/services/copilotActionRegistry.ts) defines three risk tiers:

- `low` — one human-confirm click required
- `draft` — AI prepares, human still sends/commits
- `auto` — executes immediately, no confirmation (reserved at build time, never decided at runtime)

Today only **four** admin-surface actions are registered in [`adminTools.ts`](../../server/services/adminTools.ts):

| Action | Tier |
|---|---|
| `update_task_status` | `low` |
| `draft_review_reply` | `draft` |
| `send_support_email` | `low` |
| `send_support_sms` | `low` |

**Zero are `auto` tier**, and **none are cron-invoked**. The registry is only entered through the admin chat UI (the human prompts the model). The framework is built for autonomy but the autonomy never fires.

---

## B. The gap

Alex's ask: a **Business Operator AI** that wakes itself on a schedule, reads business state, and **acts** — fills cells, triages, routes, escalates — without needing a human chat prompt to kick it off.

What we have is two halves that don't meet:

1. A **summary-only AI cron** (`ops_daily_intelligence`) that writes a narrative + priority list to `opsSnapshots` but never executes anything. The whole point of the engine's separation-of-concerns design is that *AI does not mutate any other table*.
2. A **richly typed action registry** (Anthropic tool-use schemas, surface binding, idempotent executors, audit logs) that can only be entered via interactive chat.

The missing piece is the **schedule + decision loop** that bridges them: a cron job that reads OpsEngine's output (or detector signals directly), picks an allowlisted action per signal, and either auto-executes (`auto` tier) or files an escalation for human review. None of the existing 55 crons cover this.

There is also **no `admin_ai_actions` table** — the closest equivalents are `opsSnapshots` (read-only AI output), `routing_events` (deterministic rule output, no AI), and `job_logs` (worker telemetry only).

---

## C. Architecture proposal: Business Operator Agent

### C.1 New files

```
server/services/businessOperatorAgent.ts   — decision loop + Claude tool-use binding
server/jobs/businessOperatorWorker.ts      — cron entrypoint, hourly
shared/schema.ts                           — adds admin_ai_actions table
server/routes/adminAiActivityRoutes.ts     — list / escalate / approve endpoints
client/src/pages/admin/AiActivity.tsx      — "AI Activity" admin UI
```

### C.2 New table: `admin_ai_actions`

```ts
admin_ai_actions = {
  id: serial,
  detected_at: timestamp,
  source: enum('ops_signal', 'detector', 'manual'),
  signal_ref: jsonb,           // OpsSignal payload or detector key + entity id
  proposed_action: text,       // registered action name from registry
  proposed_args: jsonb,
  decision: enum('pending','auto_executed','escalated','skipped','admin_approved','admin_rejected'),
  decision_reason: text,       // Claude's narrative
  executed_at: timestamp | null,
  execution_result: jsonb | null,
  escalated_to_user_id: int | null,
  reviewed_at: timestamp | null,
  reviewed_by_user_id: int | null,
}
```

### C.3 Decision loop (hourly cron, `0 * * * *`)

```
1. Pull OpsSignal[] from runAllDetectors() — same source the daily summary uses
2. For each signal:
   a. Look up an allowlisted "playbook" entry for signal.kind
      (registered in a new businessOperatorPlaybook.ts — NOT runtime-decided)
   b. Call Claude with the playbook's tool schema + signal context
   c. Claude returns one of: { action, args } | { skip, reason } | { escalate, reason }
   d. Persist a row in admin_ai_actions
   e. If action + playbook.tier === 'auto' → invoke the action's executor (re-validating args)
   f. If action + playbook.tier === 'low' → mark escalated (human approves in UI)
3. Write a summary row to job_logs as usual
```

### C.4 Reuse, not rebuild

- **AI plumbing**: reuse `aiService.chat()` (circuit-breaker, retries, usage logging already there).
- **Tool schemas**: reuse `copilotActionRegistry.ts` — the new playbook just maps `signal.kind → CopilotAction.name`.
- **Detectors**: reuse `opsDetectors.ts` verbatim.
- **Audit**: reuse `job_logs` for worker telemetry, `aiUsageLogs` for token spend.
- **Alerting**: reuse `fireAlert()` for any decision-loop failure.

### C.5 Admin UI

New page `/admin/ai-activity`:
- "Pending" tab — escalated rows awaiting admin approve / reject
- "Auto-executed" tab — last-30-day timeline of automated actions
- "Skipped" tab — for tuning the playbook
- Per-row diff: signal in, proposed action, executor's result

---

## D. Effort estimate

| Phase | Scope | Days |
|---|---|---|
| 1 | `admin_ai_actions` schema + migration + the basic list/approve endpoints + bare-bones UI | ~1 |
| 2 | `businessOperatorAgent.ts` + hourly cron + Claude tool-use loop + initial 3-5 playbook entries (escalate-only, no `auto`) | ~2 |
| 3 | Approve/reject UI polish + audit timeline + escalation notification (uses existing notification worker) | ~1 |
| 4 | Playbook expansion — add `auto`-tier entries one at a time, each gated behind a feature flag for first 30 days | ongoing |

**v1 shippable in 3-5 days** if Alex pre-decides the initial playbook scope (Section E.1).

---

## E. Risks

### E.1 AI making bad decisions on production data
- **Mitigations**: every action goes through the registered executor with re-validation; first 30 days every entry runs in `escalate-only` mode (no `auto` tier); per-playbook feature flags; one-shot dry-run path that writes the row but skips the executor.
- **Open product question for Alex**: which signals are even candidates for `auto` execution vs. always-escalate? (Currently the registry has zero `auto` actions — that's a deliberate Phase-3 decision per the registry's own docstring.)

### E.2 Cost
- OpsEngine today: 1 Claude call/day. Hourly Business Operator at ~10 signals/run × 24 runs = ~240 calls/day, Haiku at ~600 max tokens. **Estimate: $50-200/mo at moderate scale**, dominated by cached system prompt + small per-call deltas. Falls under existing `aiBudget.ts` envelopes.

### E.3 Audit / observability
- Mandatory: every decision writes `admin_ai_actions` *before* the executor fires (so even an executor crash is reconstructable). Every action's executor already writes a `journalEvents` row via the registry's `actor_name: "AI Copilot"` pattern — extend that to `"Business Operator AI"` so the timeline distinguishes cron-driven from human-prompted.

### E.4 Concurrency
- Overlap guard pattern from scheduler.ts (`let businessOperatorRunning = false`) applies. Also need a per-signal lock so two ticks don't both file actions for the same stuck task.

### E.5 Feedback loop
- Without an admin-reject UI surfacing into the prompt, the loop will repeat the same bad call. Phase-3 includes feeding the last-30-day reject reasons into the system prompt as examples.

---

## F. Decision needed from Alex (before any build)

1. **Initial playbook** — which 3-5 signals should the v1 act on? (Suggested: stuck onboardings, missing AdFlow metrics late in month, embed-broken alerts, dunning escalations, expiring OAuth tokens.)
2. **Failure-mode policy** — on Claude failure: skip the tick entirely, or escalate everything as a fallback?
3. **Budget cap** — monthly ceiling? At what spend do we shut the loop off automatically?
4. **First-30-day mode** — confirmed escalate-only? Auto-execute on day 31, or require an explicit toggle per playbook entry?
