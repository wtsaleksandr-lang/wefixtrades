# Wave 20 — Content generation consolidation audit

**Decision (Alex, 2026-05-26):** ContentFlow becomes the only generator.
RankFlow handles website delivery (CMS integration, scheduling, SEO tracking)
and calls ContentFlow for content. SocialSync handles social delivery and
calls ContentFlow for content. Two AI systems coordinating in the backend;
neither Alex nor users see the boundary. Errors at every stage surface in
user portal AND admin dashboard.

## Existing generation surfaces

### 1. ContentFlow internal generator (article path)
- Entry: `server/services/contentflow/articleService.ts`
  - `createDraftFromRankflowTask({task, profile})` — idempotent draft insert
  - `generateArticleBody(draftId)` — fires AI via `generateContentflowText`,
    runs full quality gate (3-layer: heuristics → cadence → detector +
    humanization orchestrator).
- Provider: `server/services/contentflow/aiText.ts` →
  `server/services/ai/textRotator.ts` (Anthropic → OpenAI fallback).
- Gate: `contentflowGate.ts` (kill switch + monthly spend cap).
- Image path: `server/services/contentflow/imageGenerationService.ts` and
  `imageOrchestrator.ts`.
- Cron: `server/jobs/contentflowGenerationWorker.ts` (daily, per active
  standalone subscriber; delegates to SocialSync orchestrator for the
  multi-channel content output — see Sprint D comment block).

### 2. RankFlow generation calls
- Generation is **already a thin wrapper** around ContentFlow:
  - `server/jobs/rankflowWorker.ts` calls
    `createDraftFromRankflowTask()` + `generateArticleBody()` from
    ContentFlow's `articleService`. **No direct LLM call.**
  - `server/routes/rankflowRoutes.ts` and `server/routes/portal/rankflow.ts`
    expose admin-triggered regenerate endpoints that call into the same
    ContentFlow article path.
- RankFlow's own services (`planGenerator`, `taskGenerator`, `qaService`,
  `searchConsoleService`, `rankTracker`, `batchService`, `keywordHelper`,
  `marginGuardrails`, `deliveryFramework`, `indexChecker`) all do
  NON-generation work (planning, SEO data fetch, CMS delivery,
  margin checks).
- **Migration cost: low.** RankFlow already calls ContentFlow.
  We add a thin pass-through to the new unified API so the call is
  routed via `requestContent({source: "rankflow"})` and the pipeline
  log captures the source for the admin dashboard.

### 3. SocialSync generation calls
- `server/services/socialSync/contentGenerator.ts` calls
  `chat()` directly from `aiService` (NOT via ContentFlow). It builds
  platform-specific prompts (Facebook / Instagram / Google Business /
  LinkedIn), parses JSON, runs SocialSync's own `qualityGate.ts`, then
  creates a `social_sync_posts` row.
- `server/services/socialSync/orchestrator.ts` is the per-client weekly
  generator that calls `generatePostFromTopic()` → produces a
  ContentFlow draft via `createDraftFromSocialPost`, then optionally
  triggers image gen and WordPress queue.
- **Migration cost: medium.** SocialSync's text generation is the only
  surface that bypasses ContentFlow's text pipeline today. We route its
  call through `requestContent({source: "socialsync", type:
  "social_post"})`. SocialSync's quality gate stays as a delivery-side
  guardrail (platform-length / hashtag count); ContentFlow's quality
  gate is now the canonical content-quality gate.

### 4. Per-client ContentFlow worker (`contentflowGenerationWorker.ts`)
- Schedules daily output for standalone ContentFlow subscribers.
- Today delegates to SocialSync's `generateWeekForClient()`.
- Wave 20: kept intact (the cron stays). The downstream SocialSync
  generation step now routes through `requestContent` like every other
  SocialSync call. No new code path; the worker is unchanged.

## Already-canonical: ContentFlow's quality gate

`server/services/contentflow/qualityGate/` is the 3-layer system Alex
flagged as canonical:
- `articleQualityGate.ts` — Layer-3 AI review with clean / regen thresholds
- `humanizeRewrite.ts` — orchestrator-driven rewrite
- `algorithmicHumanizer.ts` — cadence
- `cadenceVerifier.ts`
- `detectorGate.ts` — ZeroGPT or equivalent

SocialSync's `qualityGate.ts` is **kept** for platform-specific guardrails
(hashtag counts, max length, banned phrases) but no longer the canonical
content-quality gate.

## New tables (additive)

- `content_requests` — top-level request tracking, one row per
  `requestContent()` call.
- `content_pipeline_log` — append-only state-transition log.

Existing tables (`content_drafts`, `content_approvals`, `content_assets`,
`social_sync_posts`, `content_drafts.linked_*` cross-links) are
**untouched** — this is purely additive.

## Hook for Wave 21 (SerpAwareGenerator)

`requestContent()` dispatches via a single `enqueueContentRequest()`
worker entry point. Wave 21 will plug a SERP-aware enrichment step in
that entry point with no changes to RankFlow or SocialSync callsites.

## Hook for Wave 21+ (90-day batch UI)

`listPending({source, clientId, daterange})` is the API surface the
90-day batch UI will read. The page only needs to query `content_requests`
joined to `content_pipeline_log`; no new tables are required when that
UI lands.

## Backward compatibility

- Existing standalone ContentFlow customers: unaffected. The cron path
  through `contentflowGenerationWorker.ts` keeps running. Internally
  it now passes through `requestContent({source: "contentflow"})` so
  the admin pipeline dashboard sees every request, regardless of
  caller.
- Existing RankFlow customers: unaffected. The rankflow worker still
  calls `createDraftFromRankflowTask()` + `generateArticleBody()`,
  but both now log to `content_pipeline_log` with source=`rankflow`.
- Existing SocialSync customers: unaffected. The orchestrator still
  produces posts, but the LLM step is wrapped by the unified API and
  logged.

## What's stubbed for later waves

- **SerpAwareGenerator brain** (Wave 21) — hook present in
  `contentflow/api.ts::enqueueContentRequest()`, no implementation.
- **90-day batch UI** (Wave 21+) — only the data layer exists; no
  client-facing batch view is shipped in Wave 20.
- **Webhook callbacks** — the API documents the pattern but the
  initial implementation uses polling. Caller surfaces (rankflow,
  socialsync) call `getContent()` after dispatch, which is sufficient
  for the current synchronous-style code paths.
