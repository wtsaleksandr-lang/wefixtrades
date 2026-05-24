# AI Infrastructure Audit — 2026-05-24

Read-only review of the AI stack at `685a6126` (origin/main).
Scope: providers, cost tracking, gates, memory/learning, safety,
efficiency, customer-satisfaction signals.

---

## 1. Providers used

| Provider     | Where                                                         | Models in use                                                                   | Volume (qualitative) |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------- |
| Anthropic    | `server/services/aiService.ts` (shared client)                | `claude-haiku-4-5-20251001` (default), `claude-sonnet-4-6`, `claude-opus-4-7`   | High — every assistant surface, every TradeLine call turn |
| Anthropic    | `aiBudgetRouter.ts` tiers                                     | cheap=haiku, standard=sonnet-4-6, premium=opus-4-7                              | Routed per-call by client band + task complexity |
| Anthropic    | `aiChatEngine.ts`, `aiPricingAgent.ts` (legacy)               | `gpt-4o-mini` (mis-named — actually Anthropic surface in some sites; some still OpenAI) | Legacy, low |
| OpenAI       | `openaiClient.ts` (lazy singleton)                            | `gpt-4o-mini`, `gpt-4o`, `gpt-image-1.5`, `whisper-1`, `tts-1`, `gpt-4o-mini-transcribe` | Medium |
| OpenAI       | `services/whisper.ts`                                         | `whisper-1` (mobile Ask STT)                                                    | Low-medium |
| OpenAI       | `lib/voicePreview.ts`                                         | `tts-1` (admin voice preview)                                                   | Low (cached per voice slug) |
| OpenAI       | `replit_integrations/audio/client.ts`                         | `gpt-4o-mini-transcribe` (chat audio surface)                                   | Low |
| OpenAI       | `routes/voicemailRoutes.ts`                                   | `whisper-1`                                                                     | Low |
| Replicate    | `services/ai/imageRotator.ts`                                 | `flux-pro`, `flux-schnell` (fallback in rotation; API token not provisioned)    | None today |
| Ideogram     | `services/ai/imageRotator.ts`                                 | `ideogram-v3` (fallback; API key not provisioned)                               | None today |
| Google       | `services/ai/textRotator.ts`, `routes/aiDemoRoutes.ts`        | `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.0-flash` (demo + rotator)       | Low (demo surface only) |
| Vapi         | `services/vapiService.ts`                                     | Vapi assistant orchestration → custom-llm endpoint                              | Medium (TradeLine voice) |
| ElevenLabs   | via Vapi config (`voice: { provider: "11labs" }`)             | Voice ID from `VAPI_WFT_VOICE_ID`                                               | Medium (TradeLine voice) |
| Deepgram     | via Vapi config (`transcriber: { provider: "deepgram", model: "nova-2" }`) | `nova-2`                                                            | Medium (TradeLine voice STT) |
| Twilio       | `twilioClient.ts`, voice/SMS routes                           | n/a (transport, not LLM)                                                        | Medium |

Single Anthropic SDK + single OpenAI SDK. No Groq / Mistral / Cohere /
Together / direct Bedrock call sites.

---

## 2. Cost-tracking maturity — MOSTLY MATURE, with attribution gaps

**Tables**

- `ai_usage_logs` (per-call: model, surface, tokens, latency, micro-cents cost, loop_run_id, step_index).
- `ai_model_pricing` (per-model tier + input/output rates — cents per 1M).
- `client_variable_costs` (per-client month + lifetime AI / SMS / voice + generated profit cols, default budget cents).
- `client_variable_costs_history` (6-month rolling per-client).
- `admin_ai_budget` (Business Operator monthly cap $50).
- `admin_ai_actions.ai_cost_cents` (per-action cost line).
- `ai_system_gates.monthly_spent_cents` (per-surface budget meter).

**Pricing**
- `services/aiPricing.ts` — substring match (opus / sonnet / haiku) → micro-cents. Conservative Sonnet default for unknowns. Good.
- `services/aiModelPricingTable.ts` — DB-backed pricing with cheap/standard/premium tiers feeding the router.
- `services/quotequickAiBudgetMath.ts` — separate per-model rate map for QuoteQuick. **Drift risk:** two tables of truth.

**The gap** — `server/services/aiService.ts:chat()` requires `surface` to:
1. call `aiGateAllowed(surface)` BEFORE the API call,
2. write `ai_usage_logs`,
3. increment `ai_system_gates.monthly_spent_cents`.

A grep of all `await chat({` callers shows **7 site groups still pass no surface** (so all three behaviors above are skipped):

- `services/assistant.ts:273` — non-streaming `assistantSync`. Logs usage manually but uses `req.surface` (which is `ChatSurface`, not `AiSurface`). Does NOT pass `surface` into `chat()`, so no gate + no spend recorded on `ai_system_gates`.
- `services/conversationArchiver.ts:147` — classifier call. **Fixed inline in this PR** → `inbound_classifier`.
- `services/vapiService.ts:541` (`extractLeadFromTranscript`). **Fixed inline in this PR** → `inbound_classifier`.
- `services/opsEngine.ts:162` — daily ops summary. No surface registered for this; should be `business_operator` or a new `ops_engine` surface.
- `services/webfixAuditService.ts:167, 228` — two performance-audit narrative calls. Should map to `adflow_reports` or a new `webfix_audit` surface.
- `services/wftSalesLine.ts:50` — sales-line transcript extraction. Should map to `inbound_classifier` (same pattern as TradeLine lead extraction).
- `auditRoutes.ts:2605`, `routes/demoRoutes.ts:78, 230`, `services/sitelaunchFinalization.ts:183`, `services/supplierDispatch.ts:471`.

Per-client cost rollup: present (`incrementVariableCost` from `usageTracker`). Tied to `userId` only; calls without `userId` (background workers, anonymous demo surfaces) silently skip the per-client increment.

Daily/monthly burn-rate alerting: present **only** at two specific spots:
- `admin_ai_budget` (Business Operator) — 80%/100% thresholds tracked in `alerts_sent`, sent once.
- `ai_system_gates.alert_threshold_pct` (per-surface) — column exists, alerts_sent jsonb present, but no scheduled email worker that fires off them was found in `server/cron/` or `server/jobs/`. Treat as **defined-but-not-enforced** until a cron is wired.

---

## 3. AI gates — WORKING, with one critical caveat

Three coexisting gates:

1. **`ai_system_gates`** (per-surface) — `aiGateAllowed(surface)` →
   `{allowed, reason}`. **Fail-OPEN** on infra error. Honored by every
   `chat()` call that passes a `surface`. Kill switch + monthly budget cap.
2. **`ai_channel_gates`** (per-customer-channel: email/sms/voice/chat) —
   `aiChannelGateOn(channel)`. **Fail-CLOSED** on infra error. Defaults
   to OFF for every channel. Honored by W-BA-8 voice follow-up loop.
3. **`ai_channel_settings`** (older, separate row) — both must be ON for
   the AI to respond. Distinct from #2.

**Per-client budget dial** (`aiBudgetRouter.selectModelForTask` +
`aiBudget.classifyBand`) — never a kill switch, only a model demotion.
default → soft_cap → over_cap (forced cheap). Fail-open. Correct
philosophy (service degrades, never stops).

**Caveat — pre-API budget enforcement is post-hoc, not pre-flight**

- `ai_system_gates.monthly_spent_cents` is incremented **after** a
  successful call (`aiService.chat` line 269). So the call that crosses
  the cap is allowed. The cap blocks call N+1.
- `client_variable_costs.ai_cost_cents_month` is incremented in
  `usageTracker.recordAiCostForUser` **after** the call returns. The
  router reads this on the NEXT call. Same one-call slip.
- Only QuoteQuick uses pre-flight estimate-based gating
  (`quotequickAiBudget.gateDecision()` runs before the Anthropic call).
  That pattern should be generalized.

---

## 4. Memory + learning — STRONG, with one true gap

**What's persisted**

- `chat_memory` — 7-day rolling per-session memory: `messages_json`, `previous_topics`, `interested_in_pricing`, `interested_in_booking`, name/business/area/website. `expires_at` enforced.
- `ai_conversations` — calculator agent thread (per session_id).
- `ai_conversation_archive` — long-term archive for save-worthy conversations only (high_value / support / sales_intent / report_followup). Classified by `conversationArchiver`.
- `support_tickets.transcript_json` — escalated AI transcripts.
- `tradeline_knowledge_base` — per-client, curated FAQ/service/policy/pricing/doc, priority-ordered, embedded into the TradeLine system prompt at call time.
- `tradeline_learning_candidates` — proposed AI-template updates from research / conversations / manual. Lifecycle pending → approved → rejected.
- `admin_ai_actions` — per-playbook signal + AI reasoning + proposed action + review state, with consecutive-approval auto-unlock at 3.
- `admin_ai_playbook_state.consecutive_approvals` — the explicit feedback loop: each admin approve increments, any rejection resets to 0, auto-execute only unlocks at >= 3.

**What's queried into prompts**

- TradeLine: `buildTradeLineContextWithKnowledge` pulls active KB rows (priority desc, capped 40, 1500-char cap per entry) and embeds in system prompt under "BUSINESS KNOWLEDGE". No vector search — recent-N + priority is the entire retrieval. **Fine for today's KB sizes (<40 entries/client); will need a vector retrieval before per-client KB cardinality exceeds ~100.**
- Website/portal: `compileKnowledge` returns a flat compiled corpus (not retrieved per question).
- chat_memory: `previous_topics` and intent flags surfaced in `WHAT YOU REMEMBER ABOUT THIS USER` section.

**Real gap — there is NO message-level admin feedback loop**

Searches for `thumbs`, `rating`, `csat`, `nps`, `feedback`, `response_rating`, `good_response`, `bad_response` found ONLY:
- Review/star-rating surfaces (`reviews.ts`, `reviewRequests.ts`) — about Google reviews of *clients*, not about AI responses.
- `admin_ai_playbook_state.consecutive_approvals` — playbook-level, not message-level.
- `low-rating-alert` — about a 1–2 star Google review, not AI.

There is no admin UI for "this AI response was bad" / "this was good"
that feeds back into prompt revisions, prompt-version benchmarking, or
candidate templates. `tradeline_learning_candidates.kind='conversation'`
(see schema comment) is **explicitly marked "not built yet"** — V2 of
the pipeline. This is the highest-impact gap for product improvement.

---

## 5. Safety posture — DECENT, with two missing pieces

**Present**

- Rate limiters (`services/rateLimiter.ts`): chat 20/min/IP, AI chat 20/min/IP, voice transcribe 30/hr/user, image-to-template 5/hr/user, scrape 5/hr/admin, auth 10/15min, password-reset dedupe 1/min, magic-link dedupe 1/min. In-memory store (single-server). Notes documented for Redis migration.
- Heuristic spam pre-filter in `services/inboundClassifier.ts` (crypto/loan/pharma/link-bait regex).
- Claude-haiku classifier for inbound messages → drop spam / polite-decline out-of-scope / ticket-route needs_human / reply only on legitimate.
- Vapi webhook HMAC verification (`verifyWebhookSignature`) — rejects in production when secret missing; warns in dev.
- Circuit breaker on Anthropic client (5 failures / 2 min → open 30s, half-open probe).
- Fail-closed `ai_channel_gates` for customer-facing channels.
- Per-client cost band that DEMOTES model (never kills).
- SMS notification dedupe per phone (5-min window) in `vapiService`.

**Missing**

1. **No PII redaction before prompts.** Searches for `redact`, `scrub`, `sanitize`, `pii` in the AI path found nothing. Phone numbers, emails, addresses, and full transcripts go to Anthropic verbatim. For a category-2 jurisdiction this is acceptable today (Anthropic's data policy + BAA cover it for customer data), but the **`extractLeadFromTranscript` call ships the full transcript including caller_phone, caller_address** with no opt-out for clients who didn't consent. Worth a per-client "share transcripts with AI" toggle.
2. **No moderation / abuse detection on the customer-widget AI path.** The QuoteQuick widget (`quotequick_widget_ai` surface) takes anonymous user input and there's no `/v1/moderations` pre-screen, no toxicity check. The rate-limit + per-conversation cost cap (25¢/run) are the only protections against an attacker draining quota. Adding an OpenAI moderation pre-screen at ~$0/1M tokens would be near-free and meaningfully reduce abuse.

---

## 6. Performance / efficiency

**Prompt caching (Anthropic)**

Wired in 4 places via `cache_control: { type: "ephemeral" }`:
- `services/aiService.ts:192` (the `buildCachedSystem` helper — all surfaces calling `chat()` get system-prompt caching).
- `services/aiAgentLoopCore.ts:135` (agent loop also caches system prompt).
- `routes/quotequickAiChatRoutes.ts:286` (explicit per-route caching).
- `services/quotequickAiTools.ts:12` (note re: server-side caching).

**Not yet cached** — tool definitions (`tools: any[]`). Anthropic supports
`cache_control` on the last tool block too. With 8+ tools per agent loop
run, that's another 1k–3k input tokens repeated across every turn that
could be cached for −90% on the cached portion.

**Streaming** — `aiService.streamChat` exists; routes that need SSE
(chatRoutes, quotequickAiChatRoutes) use it. Good.

**Parallel tool calls** — agent loop processes tool_uses sequentially in
the same step (Anthropic returns them as an array; the loop iterates).
For independent calls (e.g. "fetch client_status AND fetch open_tasks")
this is fine because Anthropic dispatches them in one response. ✓

**Model routing** — `aiBudgetRouter.selectModelForTask` exists with
cheap/standard/premium tiers but is **not consistently invoked** by all
call sites. Most callers still hard-code `claude-haiku-4-5-20251001` or
let the env `CLAUDE_MODEL` decide. The router only fires from explicit
callers that pass `clientId + taskComplexity`. Wider adoption is a
multi-percent monthly savings.

**TTS** — `lib/voicePreview.ts` uses `tts-1` cached to disk by voice slug
(good). `tts-1` is ~$15/1M chars; switching the admin-preview cache to
`tts-1-hd` would 4x cost for no real quality lift on a 15-word sample.
Stay on `tts-1`. ✓

**STT** — `whisper-1` at $0.006/min on mobile Ask. The newer
`gpt-4o-mini-transcribe` is ~50% cheaper but doesn't return duration,
which the mobile UI needs (see comment in `whisper.ts`). The audio
chat surface (`replit_integrations/audio/client.ts`) already uses
`gpt-4o-mini-transcribe`. Switching mobile would save ~50% on STT
spend if the UI is OK without `duration` (the comment explains why
they kept whisper-1). Tradeoff documented; not a slam dunk.

---

## 7. Customer satisfaction signals

**Present**

- TradeLine voice: full transcript + `summary` from Vapi end-of-call
  report stored in `tradeline_call_logs`. `extractLeadFromTranscript`
  parses caller_name/phone/job_type/urgency/job_description.
- `support_tickets.ai_summary` + `ai_priority_hint`.
- `conversationArchiver` classifies primary_intent into 8 buckets.
- Low-rating alert email when a 1-2 star Google review appears (about
  the *client's* business — not the AI itself).

**Missing**

- No per-message thumbs / rating on any AI surface.
- No post-conversation CSAT survey on portal AI / TradeLine voice.
- No transcript review queue for admin ("show me the worst 20 AI
  conversations this week"). The data is in `ai_conversation_archive`,
  the UI is not.
- No escalation trigger from the AI itself ("I tried 3 times, send to
  human") — escalation today is keyword-based in
  `inboundClassifier`, not behavioral.

---

## Top 10 improvements ranked by impact

1. **Add `surface` to the 7 remaining ungated `chat()` call sites**
   (assistant.ts, opsEngine, webfixAuditService×2, wftSalesLine,
   auditRoutes:2605, demoRoutes×2, sitelaunchFinalization,
   supplierDispatch). Today these calls don't hit
   `aiGateAllowed`, don't write `ai_usage_logs`, don't increment any
   monthly budget. **Result of fix: every call gated + logged + capped;
   monthly burn-rate alerting becomes meaningful.** Estimated dev: 2h.
   *Two inline fixes shipped in this PR (vapiService.extractLeadFromTranscript,
   conversationArchiver) — same pattern for the rest.*

2. **Add Anthropic prompt-caching to tool definitions** in
   `aiAgentLoopCore.ts` and any caller that passes `tools: [...]`.
   Currently only system prompt is cached. Adding
   `cache_control: { type: "ephemeral" }` to the last tool block
   reduces input tokens by ~80% on the tool portion across multi-turn
   agent loops. **Estimated savings: 15-25% of agent-loop input cost.**

3. **Per-client weekly cost ceiling with auto-pause.** Today the per-
   client `default_budget_cents` only demotes the model. Add a hard
   weekly cap (e.g. $20/client/week, configurable) that, when crossed,
   sets a per-client flag the next `aiGateAllowed` reads. Service
   degrades to "your weekly AI quota is reached — resets Sunday"
   instead of the founder eating runaway calls.

4. **Pre-flight cost estimate gating across all surfaces.** Generalize
   `quotequickAiBudget.estimateCallCost + gateDecision` into a shared
   helper called from `aiService.chat()` BEFORE the API call. Eliminates
   the "call that breaks the cap is still allowed" one-call slip on
   `ai_system_gates`.

5. **Build the admin "AI response feedback" loop.** New table
   `ai_response_feedback (usage_log_id, rating, note, admin_id)`. New
   admin UI: paginated `ai_conversation_archive` with per-message
   thumbs up/down and a "promote this exchange to a
   tradeline_learning_candidate" button. **Unblocks the V2 conversation
   → KB pipeline the schema is already designed for.**

6. **Add OpenAI moderation pre-screen on `quotequick_widget_ai` surface**
   (the only anonymous-customer AI surface). One `/v1/moderations`
   call per inbound user message. Cost is effectively zero
   (free tier). Cuts abuse risk on the only surface where an attacker
   can drive cost without auth.

7. **Wire the `ai_system_gates.alert_threshold_pct` cron.** Column +
   alerts_sent jsonb already exist. Need a 6-hourly job that:
   - selects gates where `monthly_spent_cents >= alert_threshold_pct *
     monthly_budget_cents` AND not already in `alerts_sent`,
   - sends admin email,
   - appends the threshold key to `alerts_sent`. **Today this column is
     defined-but-not-enforced** — Alex finds out about overspend by
     reading the dashboard, not by getting paged.

8. **Adopt `selectModelForTask` across high-volume call sites.** Today
   `aiBudgetRouter` only fires when callers explicitly pass `clientId +
   taskComplexity`. The TradeLine voice + portal copilot + website chat
   surfaces all use `getModel()` which reads `CLAUDE_MODEL` env. Wiring
   the router into `assistantSync` would automatically demote Sonnet→Haiku
   for over-cap clients on every surface. **Estimated savings: 5-10% of
   Anthropic spend for clients hitting soft_cap.**

9. **Per-client "share transcripts with AI" consent flag.** Today
   `vapiService.extractLeadFromTranscript` ships caller_phone + address
   + full transcript to Anthropic regardless of caller consent. Add a
   per-client tradeline-config toggle `pii_extract_consent` (default
   true), and when false skip extraction (fall back to manual ticket).
   Low effort, defuses a category of complaint pre-launch.

10. **PII redaction helper called from `chat()` pre-call.** Mask phone
    / email / address in the messages array before they leave the
    process. The existing extraction logic in `extractLeadFromTranscript`
    *needs* the raw transcript, so a per-surface opt-out is required.
    Default-on for `inbound_classifier`, `reply_intelligence`,
    `prospect_enrichment`; default-off for `quotequick`, voice
    extraction surfaces.

---

## Inline fixes shipped in this PR

- `server/services/vapiService.ts` —
  `extractLeadFromTranscript` now passes `surface: "inbound_classifier"`.
  Pre-fix: every TradeLine call's lead extraction was ungated, missing
  from `ai_usage_logs`, and uncapped.
- `server/services/conversationArchiver.ts` —
  classifier call now passes `surface: "inbound_classifier"`. Same
  before/after as above.

Both fixes use the existing `inbound_classifier` surface (already
seeded with a $5 monthly cap) rather than adding a new surface, to
keep the diff small. New surfaces (`ops_engine`, `webfix_audit`,
`sales_line`) belong to follow-up improvement #1.
