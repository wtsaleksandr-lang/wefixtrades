# Onboarding → AI Config Mapper Registry (W-AZ-3)

## Why this exists

When a customer finishes onboarding for a product (TradeLine, QuoteQuick,
RankFlow, etc.), their answers used to either:

1. Get stored as raw JSON on `client_service.metadata.config` and never
   reach the AI prompt context — i.e. the AI behaved generically even
   though we already had useful customer setup data.
2. Be transformed by `mapOnboardingToTradeLineConfig` — but only for
   TradeLine. Every other product had to write the same pattern from
   scratch (and most didn't, so the AI prompts ignored onboarding).

The registry generalises that TradeLine-only pattern into a per-product
mapper so onboarding answers consistently flow into the AI prompt for
every product that has an AI surface.

## Layout

```
server/services/onboardingMappers/
  index.ts                       — registry, AIConfigPatch type, helpers
  tradelineMapper.ts             — TradeLine voice/chat patch
  quotequickMapper.ts            — QuoteQuick AI quote-builder patch
  rankflowMapper.ts              — RankFlow SEO strategy patch
  adflowMapper.ts                — AdFlow campaign-targeting patch
  contentflowMapper.ts           — ContentFlow voice/tone patch
  webfixMapper.ts                — WebFix issue backlog patch
  webcareMapper.ts               — WebCare ongoing-care patch
  sitelaunchMapper.ts            — SiteLaunch brand-guide patch
  mapguardMapper.ts              — MapGuard targeting patch
  reputationshieldMapper.ts      — ReputationShield reply-voice patch
  socialsyncMapper.ts            — SocialSync content cadence patch
  bookflowMapper.ts              — BookFlow hours + services patch
```

The shared `AIConfigPatch` shape:

```ts
interface AIConfigPatch {
  system_prompt_additions?: string;
  context_variables?: Record<string, unknown>;
  knowledge_base_entries?: Array<{ kind: string; title: string; content: string }>;
}
```

## How patches flow into AI context

1. Onboarding form submitted → `onboarding_submissions.status = "submitted"`.
2. A product's AI surface (voice assistant, chat, copywriter, etc.) calls
   `applyOnboardingToAIConfig(productFamily, submission)`.
3. The mapper returns an `AIConfigPatch | null`.
4. The prompt builder (or the product's route handler) calls
   `renderOnboardingPatch(patch)` from `server/services/promptBuilder.ts`
   to render the patch as a `=== CUSTOMER SETUP ===` block + a
   `=== CUSTOMER CONTEXT VARIABLES ===` block + a
   `=== CUSTOMER-SPECIFIC KNOWLEDGE ===` block, and appends it to the
   product's existing system prompt.

`applyOnboardingToAIConfig` is safe-fail: it returns `null` rather than
throwing, so a missing or malformed onboarding row never breaks an
active AI surface.

## Adding a new product mapper

1. Create `server/services/onboardingMappers/<product>Mapper.ts` exporting
   `mapOnboardingTo<Product>Config(submission) => Promise<AIConfigPatch | null>`.
2. Use `pullString(responses, key)` and `pullList(responses, key)` from
   `./index` — they handle both the raw-value and `{ value, completed_at }`
   onboarding response shapes.
3. Register the mapper in `MAPPERS` in `index.ts` keyed by the product
   family slug. The slug must match the prefix on `serviceCatalog.id`
   (e.g. `tradeline-call_backup` → key `tradeline`).
4. (Optional) Wire the patch into that product's AI prompt builder. See
   `server/services/promptBuilder.ts → buildTradeLinePrompt` and
   `server/routes/quotequickAiChatRoutes.ts → loadQuoteQuickOnboardingBlock`
   for two working examples.

## Per-product wiring status (initial commit)

| Product           | Mapper status | AI prompt wired in |
| ----------------- | ------------- | ------------------- |
| TradeLine         | full          | yes (vapi voice prompt via promptBuilder + vapiService) |
| QuoteQuick        | full          | yes (`/api/quotequick/ai/chat` system block) |
| RankFlow          | full          | mapper available; no dedicated chat surface yet |
| AdFlow            | full          | mapper available; no dedicated chat surface yet |
| ContentFlow       | full          | mapper available; consumed where ContentFlow generator runs |
| WebFix            | full          | mapper available; no dedicated chat surface yet |
| WebCare           | full          | mapper available; no dedicated chat surface yet |
| SiteLaunch        | full          | mapper available; SiteLaunch is mostly human-delivered |
| MapGuard          | full          | mapper available; no dedicated chat surface yet |
| ReputationShield  | full          | mapper available; can be consumed by reviewDraftService |
| SocialSync        | full          | mapper available; can be consumed by SocialSync generator |
| BookFlow          | full          | mapper available; no dedicated chat surface yet |

## Relationship with existing systems

* `mapOnboardingToTradeLineConfig` in `shared/schemas/adminCrm.ts` is
  **not replaced** by `tradelineMapper.ts`. It continues to be the
  authoritative path for writing the `TradelineConfig` row (phone
  routing, embed mode, booking, etc.) from `portalRoutes.ts`. The new
  TradeLine mapper produces the *AI prompt* projection of the same
  answers — both run independently.
* `server/services/onboardingAI.ts` (the Claude-based extractor) still
  runs for non-TradeLine products and populates `clients.metadata` +
  `client_service.metadata.config`. The mapper registry is additive: it
  projects onboarding answers into prompt context, but doesn't remove
  the Claude extraction pipeline.
