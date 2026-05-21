# AI Infrastructure Audit — W-AU-6

**Date:** 2026-05-21
**Scope:** Every external AI-provider call site in `wefixtrades` and the
gates that protect them (auth, budget, fallback, retry, attribution).
**Method:** static read-only review. No live AI calls made.

---

## 1. Provider inventory

| Provider | Used for | Active in code? | Doppler key name | Status |
|---|---|---|---|---|
| Anthropic Claude | Chat, audits, ContentFlow text, replies, inbound-email triage, assistant | Yes (primary) | `ANTHROPIC_API_KEY` | wired |
| OpenAI (chat) | Text-rotator fallback, pricing agent, social topic gen, review automation, mapguard post gen, etc. | Yes | `OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_API_KEY` (both accepted) | wired |
| OpenAI (Whisper-1) | Audio transcription (mobile Ask, voicemail) | Yes | reuses OpenAI key | wired |
| OpenAI (gpt-image-1 / gpt-image-1.5) | ContentFlow image hero | Yes | reuses OpenAI key | wired |
| Google Gemini | Text-rotator fallback (tier 3) | Code present, **key not provisioned** | `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` | code-ready, key missing |
| Replicate (Flux) | Image-rotator fallback (tier 2) | Code present, **key not provisioned** | `REPLICATE_API_TOKEN` | code-ready, key missing |
| Ideogram | Image-rotator fallback (tier 3) | Code present, **key not provisioned** | `IDEOGRAM_API_KEY` | code-ready, key missing |
| Luma AI (Dream Machine) | Video generation primary | Code present, gated OFF | `LUMA_API_KEY` | feature-flagged disabled (`VIDEO_GENERATION_ENABLED=false`) |
| Runway ML | Video generation fallback | Code present, gated OFF | `RUNWAY_API_KEY` | feature-flagged disabled |
| HeyGen | none | no grep hits | n/a | not integrated |
| Synthesia | none | no grep hits | n/a | not integrated |
| Vapi | Voice (LLM-driven phone agent) | Yes | `VAPI_API_KEY` etc. | wired (separate domain) |

### Call sites (representative)

- **Text rotator (Anthropic→OpenAI→Gemini):** `server/services/ai/textRotator.ts`, consumed by `server/services/contentflow/aiText.ts`.
- **Direct Anthropic via aiService.chat():** `server/services/aiService.ts` (Anthropic SDK, prompt cache, circuit-breaker, retry x2). Used by mobile Ask, assistant, opsEngine, reply intelligence, audit service.
- **Direct OpenAI chat (raw fetch):** several services — `socialSync/contentGenerator.ts`, `socialSync/topicGenerator.ts`, `socialSync/reviewAutomation.ts`, `reputation/reviewCore.ts`, `mapguard/mapguardPostGenerator.ts`, `replyIntelligence.ts`, `prospectEnrichment.ts`, `onboardingAI.ts`, `inboundClassifier.ts`, `conversationArchiver.ts`, `sitelaunchFinalization.ts`, `supplierDispatch.ts`, `adflowReports.ts`.
- **Image rotator:** `server/services/ai/imageRotator.ts` (OpenAI → Replicate → Ideogram).
- **Image generation production path:** `server/services/contentflow/imageGenerationService.ts` — calls OpenAI **directly**, not yet routed through `imageRotator.ts`.
- **Video:** `server/services/contentflow/videoGenerationService.ts` (Luma → Runway, killswitched off).
- **Whisper:** `server/services/whisper.ts` (+ Replit integrations audio client for `gpt-4o-mini-transcribe`).

---

## 2. Auth + budget gating

### Where gating exists

- **ContentFlow product gate** (`server/services/contentflow/contentflowGate.ts`):
  - Kill switch (`contentflow_settings.kill_switch`).
  - Monthly spend cap (`monthly_spend_cap_usd`, compared against `storage.getContentflowMonthlySpendMicroUsd()`).
  - Per-channel disable list.
  - Wired by: `aiText.ts` (text generation) and `imageGenerationService.ts` (image generation).
- **QuoteQuick editor AI budget** (`server/services/quotequickAiBudget.ts`):
  - Per-user cumulative cap, daily ceiling, per-call max, image lifetime cap.
  - `ai_budget_audit_log` + `ai_spend_log` tables.
  - Wired by: `server/routes/quotequickAiChatRoutes.ts`.
- **Generic AI usage logging:** `server/services/usageTracker.ts` → `ai_usage_logs` table. Per-model cost via `aiPricing.ts`.

### Gaps — calls that bypass any gate

| Surface | Provider call | Gate? |
|---|---|---|
| SocialSync content generation | OpenAI chat | **no contentflow gate** — pre-dates rotator; would be silently sending while kill switch is on |
| SocialSync topic generation | OpenAI chat | **no gate** |
| MapGuard post generator | OpenAI chat | **no gate** |
| Reputation review reply core | OpenAI chat | **no gate** |
| Reply intelligence | OpenAI chat | **no gate** |
| Prospect enrichment | OpenAI chat | **no gate** |
| Onboarding AI | OpenAI chat | **no gate** |
| Inbound email classifier | OpenAI chat | **no gate** |
| Supplier dispatch | OpenAI chat | **no gate** |
| AdFlow reports | OpenAI chat | **no gate** |
| Image generation (`imageGenerationService.ts`) | OpenAI image | **contentflow gate present**, but does not route through `imageRotator.ts` so no Replicate/Ideogram fallback wired |
| Whisper transcription | OpenAI audio | **no gate** — small risk vector (audio uploads up to 25 MB) |

The "kill switch" is therefore NOT system-wide — flipping it on will pause ContentFlow article/repurposer/image generation but the SocialSync, MapGuard, Reputation, and Reply-Intelligence pipelines keep calling OpenAI.

### Doppler-key existence check (from `.env.example` + code references)

- `ANTHROPIC_API_KEY` — referenced, expected set
- `OPENAI_API_KEY` / `AI_INTEGRATIONS_OPENAI_API_KEY` — both referenced (textRotator + others), expected set
- `GEMINI_API_KEY` / `GOOGLE_AI_API_KEY` — referenced but **not provisioned** (rotator silently skips)
- `REPLICATE_API_TOKEN` — referenced but **not provisioned**
- `IDEOGRAM_API_KEY` — referenced but **not provisioned**
- `LUMA_API_KEY` / `RUNWAY_API_KEY` — referenced; feature gated off
- `HEYGEN_API_KEY` — not used anywhere
- `SYNTHESIA_API_KEY` — not used anywhere

---

## 3. Fallback chain

- **Text:** clean 3-provider chain through `rotator.ts` (Anthropic → OpenAI → Gemini). Circuit-breaker: 5 consecutive failures → open 30s. Fall-through on 429 / 401 / 404 / 410 / network. ✅
- **Image (via rotator):** OpenAI → Replicate → Ideogram, same circuit-breaker. ⚠ Code path exists, but the production caller `imageGenerationService.ts` does NOT use it — calls OpenAI directly, so a multi-hour OpenAI outage = no images.
- **Video:** Luma → Runway hard-coded in `videoGenerationService.ts`. ✅
- **OpenAI-only call sites listed in §2 gaps:** no fallback at all.

---

## 4. Retry semantics

- `aiService.ts` — 2 retries with linear backoff, skips 400/401 (Anthropic).
- `whisper.ts` — **was missing**; **this PR adds 3 attempts with 500ms / 1500ms backoff on 429 / 5xx.**
- `rotator.ts` — no per-provider retry; relies on multi-provider fallback. OK.
- Most direct-OpenAI services (SocialSync, MapGuard, etc.) have no retry; one transient 429 from OpenAI fails the entire content draft.

---

## 5. Per-customer attribution

- `ai_usage_logs` schema includes `user_id`, `session_id`, `report_id`, `surface`, `channel`, `provider` — good schema, used by `usageTracker.logUsage()`.
- ContentFlow text path emits cost-per-call (`costMicroUsd`) and rolls up via `storage.addDraftGenerationCost`. Customer attribution is via the draft's `client_id`.
- QuoteQuick editor — full per-user accounting (`ai_spend_log`, `ai_budget_audit_log`).
- **Gap:** the SocialSync / MapGuard / Reputation OpenAI call sites do not call `logUsage()` either, so they are invisible in the usage chart that the customer portal needs to show.

---

## 6. Top 5 gaps (ranked by impact)

1. **Kill switch is product-scoped, not system-scoped.** A "stop the AI billing" emergency requires turning off ContentFlow + SocialSync + MapGuard + Reputation + Reply-Intelligence + Onboarding-AI + Inbound-Classifier individually. Introduce a global `AI_KILL_SWITCH=1` env var checked by `rotator.ts` (one chokepoint) and migrate the direct-OpenAI callers to use the rotator. Estimated 1-day refactor PR.
2. **`imageGenerationService.ts` does not route through `imageRotator.ts`.** Existing Replicate/Ideogram fallback code is dead. An OpenAI image outage → no FB/IG images publishable. Wire the rotator into the existing function and keep the prompt assembly + R2 upload + persistence intact.
3. **`ai_usage_logs` is not populated by ~10 surfaces.** Direct-OpenAI callers (SocialSync, MapGuard, Reputation, Reply-Intelligence, etc.) skip `usageTracker.logUsage()`. The customer-portal usage chart will under-report. Wrap each `fetch("https://api.openai.com/v1/chat/completions")` in a tiny shared helper that emits `logUsage`.
4. **Whisper had no retry on transient failures** — fixed in this PR.
5. **`.env.example` was missing 5 keys the code references** (`GEMINI_API_KEY` / `GOOGLE_AI_API_KEY`, `REPLICATE_API_TOKEN`, `IDEOGRAM_API_KEY`, `AI_TEXT_PROVIDERS`, `AI_IMAGE_PROVIDERS`, `SENDGRID_SPF_INCLUDE`, `SENDGRID_DKIM_SELECTOR`) — fixed in this PR. Lowest impact but easy.
