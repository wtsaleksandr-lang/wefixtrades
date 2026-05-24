# Vapi assistants + AI system-prompts audit — 2026-05-24

Scope: every Vapi assistant in the production account + every AI system-prompt
in `server/` that ships text to a model (chat, voice, classification, lead
extraction, post-call follow-up). Goal: surface persona drift, hallucination
risk, missing safety guards, missing context, missing tool wiring.

Source of truth for code-side prompts: `server/services/promptBuilder.ts` and
`shared/prompts/`. Source of truth for live assistants: `GET
https://api.vapi.ai/assistant` against the `wefixtrades / prd` Doppler key.

---

## 1. Vapi assistant inventory (live in account)

Pulled 2026-05-24 via `curl -H "Authorization: Bearer $VAPI_API_KEY"
https://api.vapi.ai/assistant`. **Total assistants in account: 1.**

| # | ID (last 8) | Name | Model | Voice | First message | Tools |
|---|-------------|------|-------|-------|----------------|-------|
| 1 | `10bcfa` | Riley | OpenAI `gpt-5.4` (temp 0.5) | Vapi `Godfrey` | "Hey, how can I help?" | `recommend_services` (async, 12 product IDs) |

**Default assistant per Doppler `VAPI_ASSISTANT_ID`:** `34aa037e-...-10bcfa` —
that is Riley. So every inbound call to the WeFixTrades sales line is hitting
this single assistant.

### Notable per-assistant findings

- **Riley uses `provider: "openai"` directly with `gpt-5.4`** and includes the
  system prompt INSIDE the assistant config (`model.messages[0].content`). It
  does NOT use `custom-llm` pointing at our `/api/vapi/conversation` route.
  Therefore none of the code in `assistant.ts → assistantSync` (gates, usage
  logging, knowledge-base injection, brand voice block, conversion guidance)
  is in the path for the live sales-line call.
- **Riley's stored system prompt is a 14-line generic helper** with no
  hallucination guards, no PII guard, no escalation triggers, no real
  service-pricing knowledge, no end-call/voicemail handoff rules. It does
  carry a `recommend_services` function description that matches the
  RECOMMENDATION_PROTOCOL block in `promptBuilder.ts`, so cards still appear.
- **`endCallMessage` and `voicemailMessage` reference "Wellness Partners"**
  (the Vapi onboarding template never edited): "*Thank you for scheduling with
  Wellness Partners…*" — this is **persona drift in production**; a customer
  who hits voicemail or a clean end-of-call gets the wrong business name.
- **No TradeLine per-client assistants are persisted in the account.** The
  codebase has `upsertVapiAssistant()` and `provisionTradeLineAssistant()`
  flows that create one assistant per client_service, but at audit time
  zero customer-service-specific assistants exist. Either no TradeLine
  client has been provisioned in prod yet, or provisioning is silently
  failing — confirmed by the assistant count above.
- `firstMessage` ("Hey, how can I help?") does not identify the brand. By
  contrast, code-side `buildAssistantConfig()` returns "*WeFixTrades, this is
  Riley — how can I help?*". The brand cue is missing from the live
  assistant's greeting.

---

## 2. Code-side prompt inventory

| # | File:line | Surface | Persona summary | Notable gaps |
|---|-----------|---------|-----------------|--------------|
| 1 | `server/services/promptBuilder.ts:177` (`BRAND_VOICE`) | website / audit / dashboard | "Friendly knowledgeable growth advisor for WeFixTrades" — explicit rules against hype, fabrication, repeat CTAs | No PII rule; no refund / complaint escalation trigger |
| 2 | `server/services/promptBuilder.ts:346` (`buildSurfaceContext → vapi`) | vapi (sales line, when custom-llm is wired) | Voice-first version of BRAND_VOICE with VOICE RULES, GOAL, no markdown | Voice prompt is built but ISN'T REACHED by live Riley (see §1). No fabrication guard repeated for voice context |
| 3 | `server/services/promptBuilder.ts:744` (`buildTradeLinePrompt`) | per-client TradeLine voice | Customer-business AI receptionist with VOICE RULES, mode behavior (available/on_the_job/after_hours), per-client greeting + KB injection | No PII guard; no refund/dispute escalation trigger; "Never say I'm an AI unless directly asked" duplicated 2x in stack |
| 4 | `server/services/promptBuilder.ts:388` (`buildAdminPrompt`) | admin copilot | Internal ops assistant for WeFixTrades team. STRICT RULES section enforces data grounding, no fabrication, ID grounding for tool calls. DRAFTING CAPABILITIES with 4 typed drafts | Strong — the strictest prompt in the codebase. Minor: no rate-limit on tool calls per turn beyond "Do not call the same tool more than once per turn" |
| 5 | `server/services/promptBuilder.ts:874` (`buildPortalPrompt`) | authenticated portal | Account-aware portal assistant with billing/onboarding/support modes, anti-upsell rule, concierge addendum per trade | No PII guard; "never claim to perform actions" rule is good but conflicts with `executeCreateBooking` which DOES perform actions |
| 6 | `shared/prompts/tradelineDemoPrompt.ts:16` (`TRADELINE_DEMO_PROMPT`) | tradeline_demo (public marketing) | LIVE DEMO roleplay as customer's TradeLine dispatcher. 248-line spec with 20+ scenario plays, 50+ pricing anchors, NEVER-DO list | No PII guard; no instruction on what to do if visitor enters credit card / SSN; relies on banned-phrase list for "I'm just an AI" |
| 7 | `server/services/wftSalesLine.ts:51` (`extractCallerInfo`) | wft_sales (post-call) | JSON-only extractor for caller name/business/email/intent | OK — schema-constrained. Phone is captured as `caller_phone` but no E.164 normalization beyond model's best effort |
| 8 | `server/services/vapiService.ts:533` (`LEAD_EXTRACTION_SYSTEM_PROMPT`) | inbound_classifier (TradeLine post-call) | Single-string extractor: caller_name, caller_phone, caller_address, job_type, urgency, job_description, preferred_date | No defense against caller-provided PII (SSN, full card #) being persisted to `tradeline_call_logs.lead_data`; no length cap on transcript before extraction |
| 9 | `server/services/inboundClassifier.ts:89` (`classifyInbound`) | inbound_classifier | Categorize SMS/voice/chat into legitimate/spam/out_of_scope/needs_human using Haiku | OK — schema-constrained. Conservative fallback to "legitimate" on AI error is correct |
| 10 | `server/services/voiceFollowupConcierge.ts` (BA-8 agent loop) | tradeline_voice | Multi-step agent loop generating SMS/email after a voice call | Reuses BRAND_VOICE; relies on `aiSystemGate` + `aiChannelGate` correctly fail-closing — confirmed in `vapiService.ts:665` |
| 11 | `server/services/assistant.ts:88` (`chatSurfaceToAiSurface`) | n/a — gate router | Maps ChatSurface → AiSurface so chat() runs budget gate | All `vapi` + `tradeline_demo` traffic counts against `tradeline_voice` surface. Correct |
| 12 | `server/services/tradelineTemplates.ts:1670` (`buildFullSystemPrompt`) | tradeline (per-client deterministic build) | Identity + 30+ trade-specific templates (appliance_repair, electrical, hvac, plumbing, roofing, …) with callFlow, fallback, booking, escalation per trade | Excellent depth (1900+ lines of vetted trade knowledge). Used by `provisionTradeLineAssistant()` to push to Vapi — but see §1: no per-client assistants are currently in the live account, so this is dormant in prod |

---

## 3. Tool wiring audit

| Tool | Definition | Executor | Wired to live Riley? | Wired to per-client TradeLine? |
|------|------------|----------|----------------------|--------------------------------|
| `recommend_services` | Riley's `model.tools[0]` (12-id enum) + `RECOMMENDATION_PROTOCOL` in promptBuilder | Client renders cards from `<<<RECOMMEND>>>` block. The Vapi `recommend_services` function fires async (no executor return needed) | YES (lives on the assistant) | N/A (not a TradeLine function) |
| `checkAvailability` (Vapi) | `bookingTools.ts:91` | `executeCheckAvailability` | NO | YES (via `buildTradeLineAssistantConfig()` when `ctx.booking.enabled`) |
| `createBooking` (Vapi) | `bookingTools.ts:109` | `executeCreateBooking` | NO | YES (same path) |
| `check_availability` (Anthropic) | `bookingTools.ts:32` | Same executor | N/A (chat only) | YES (admin / portal copilot agent loop) |

**Gap:** Riley has zero booking tools. Inbound sales-line callers cannot book.
The function `executeCheckAvailability` requires a `calculatorId`, which the
sales line doesn't have anyway — so the gap is expected, but it means every
booking-intent caller must be deflected to the team.

---

## 4. Top 10 recommendations (ranked by impact)

1. **(P0 — fixes drift) Switch Riley to `custom-llm` pointed at
   `/api/vapi/conversation`**, OR PATCH Riley's `model.messages[0].content`
   in-place to match `buildSurfaceContext("vapi")` output. Today the live
   sales-line bypasses every guardrail in `promptBuilder.ts`. Quickest fix:
   one-shot PATCH from a script to push the canonical voice prompt onto the
   existing assistant.
2. **(P0 — drift) Fix Riley's `voicemailMessage` and `endCallMessage`** —
   both reference "Wellness Partners" instead of WeFixTrades. Customers
   hitting voicemail today get the wrong company name. Fix via Vapi PATCH.
3. **(P0 — drift) Fix Riley's `firstMessage`** to identify the brand
   ("WeFixTrades, this is Riley — how can I help?" — already the canonical
   value in `buildAssistantConfig()`).
4. **(P1 — safety) Add a PII guard block to every voice/chat prompt** that
   could collect intake: "Never request, repeat, or store full credit-card
   numbers, CVVs, SSN, drivers' licence numbers, or banking credentials. If
   the caller volunteers any of these, redirect them to the secure payment
   link and do not echo the value back." Single shared constant in
   `promptBuilder.ts` reused by `buildSurfaceContext("vapi")`,
   `buildTradeLinePrompt()`, and `TRADELINE_DEMO_PROMPT`.
5. **(P1 — safety) Add explicit escalation triggers** to BRAND_VOICE and
   `buildTradeLinePrompt`: refunds, billing disputes, legal threats, injury
   reports, suspected data breach → "Hand off to a human, take name + number
   + brief summary, do not commit to anything." Mirrors what
   `tradelineTemplates.ts` already does per-trade for safety escalations.
6. **(P1 — hallucination) Strip PII from `extractLeadFromTranscript`**
   output before persisting to `tradeline_call_logs.lead_data` — regex SSN
   / card-pattern scrub, since the model can echo whatever the caller said.
7. **(P2 — gap) Investigate why no TradeLine per-client assistants exist in
   the Vapi account.** Either no TradeLine clients are live yet (then this
   is just a flag, not a bug) or `provisionTradeLineAssistant()` is silently
   failing. Add a one-line ops check: `GET /assistant?metadata.source=
   tradeline_template_engine` and surface the count on the integration health
   page.
8. **(P2 — drift) Stop duplicating the "Never say I'm an AI"** clause —
   `BRAND_VOICE` says it, `buildSurfaceContext("vapi")` doesn't repeat it,
   but `buildTradeLinePrompt` says it twice (own block + via mode behavior).
   Consolidate into a single shared CLAUSE constant.
9. **(P2 — context) `executeCheckAvailability` / `executeCreateBooking`
   tool descriptions don't list valid services.** Models will invent
   `service` values. Either expose the calculator's actual `services` enum
   in the tool description, or strip the `service` field entirely.
10. **(P3 — observability) Add an `ai_assistant_drift_check` job** that
    diffs every live Vapi assistant's `model.messages[0].content` against
    the canonical builder output and posts a Slack alert on diff. The whole
    audit above hinges on a manual `curl` today.

---

## 5. Quick-win inline fixes shipped in this PR

- **(R8) De-duplicated the "I'm an AI" clause** in
  `buildTradeLinePrompt()` — the rule was emitted both in the IMPORTANT
  block (line 850) and would also be emitted via mode-specific behavior in
  some paths. Now stated once.
- **(R4) Added shared `PII_GUARD` constant** in `promptBuilder.ts` and
  wired it into `BRAND_VOICE`, `buildSurfaceContext("vapi")`, and
  `buildTradeLinePrompt()`. Single source of truth for the no-card / no-SSN
  rule. Demo prompt already has banned-phrase coverage; PII guard does not
  belong in roleplay copy.

No live Vapi assistant changes shipped from this audit — those need a
separate PR with an explicit ops-approved PATCH script and rollback note,
because Riley is in-account and any change is live the moment it's pushed.

---

## 6. References

- Live assistants: `curl -H "Authorization: Bearer $VAPI_API_KEY"
  https://api.vapi.ai/assistant` (returns array; 1 assistant as of audit).
- Code-side prompt entrypoints: `server/services/promptBuilder.ts`,
  `shared/prompts/tradelineDemoPrompt.ts`,
  `server/services/tradelineTemplates.ts`,
  `server/services/wftSalesLine.ts`,
  `server/services/vapiService.ts`,
  `server/services/inboundClassifier.ts`.
- Surface → gate mapping: `server/services/assistant.ts:88`.
- Tool definitions: `server/services/bookingTools.ts`.
