-- Wave AI-1 — autonomous "sharp-mind" Opus escalation.
--
-- Seeds the Opus-4-8 model into ai_model_pricing under a NEW "expert" tier so
-- aiBudgetRouter can select it ONLY when the escalation logic decides a task is
-- genuinely hard (error-resolution / retry-after-failure) AND the global
-- monthly Opus ceiling has not been hit.
--
-- Idempotent: `on conflict (model) do update` so re-running this (or a later
-- price correction) keeps the row authoritative without duplicating it. Rates
-- are USD cents per 1M tokens — input $5.00 / output $25.00 — matching the
-- substring "opus" rate in aiPricing.ts (input 5 / output 25 USD per 1M).
--
-- The legacy opus-4-7 'premium' row (migration 0031) is left untouched; the
-- expert tier is opt-in via escalation and does not change premium routing.

insert into ai_model_pricing (model, provider, input_per_million_cents, output_per_million_cents, tier, active) values
  ('claude-opus-4-8', 'anthropic', 500, 2500, 'expert', true)
on conflict (model) do update
  set provider                 = excluded.provider,
      input_per_million_cents  = excluded.input_per_million_cents,
      output_per_million_cents = excluded.output_per_million_cents,
      tier                     = excluded.tier,
      active                   = excluded.active,
      updated_at               = now();
