-- Wave W-BA-2 (Phase 3b) — per-client AI cost ledger + model pricing.
--
-- Two new tables underpin the budget dial (§4) and the client-detail cost
-- & profit view (§5):
--
--   ai_model_pricing       — single source of truth for token → cost. Per-
--                            model rates and a "tier" used by aiBudgetRouter
--                            (cheap / standard / premium) to choose a model
--                            inside the current budget band.
--   client_variable_costs  — per-client cache of measured AI + SMS + voice
--                            spend and revenue for the current month plus
--                            lifetime totals. Updated incrementally by the
--                            usage / Twilio / Vapi / Stripe code paths so
--                            the admin view never has to recompute on read.
--
-- Both tables are additive — existing ai_usage_logs and serviceCostLogs
-- continue to feed the trailing-30-day ledger in clientCostLedger.ts.

create table if not exists ai_model_pricing (
  model text primary key,
  provider text not null,
  input_per_million_cents integer not null,
  output_per_million_cents integer not null,
  tier text not null,
  active boolean not null default true,
  updated_at timestamp not null default now()
);

-- Seed the 8 models the product actively calls. Prices are USD cents per 1M
-- tokens — keep in sync with provider list pricing.
insert into ai_model_pricing (model, provider, input_per_million_cents, output_per_million_cents, tier) values
  ('claude-haiku-4-5',  'anthropic', 80,   400,  'cheap'),
  ('claude-sonnet-4-6', 'anthropic', 300,  1500, 'standard'),
  ('claude-opus-4-7',   'anthropic', 1500, 7500, 'premium'),
  ('gpt-4o-mini',       'openai',    15,   60,   'cheap'),
  ('gpt-4o',            'openai',    250,  1000, 'standard'),
  ('gpt-image-1',       'openai',    1100, 0,    'standard'),
  ('gemini-2-5-flash',  'google',    30,   250,  'cheap'),
  ('gemini-2-5-pro',    'google',    125,  1000, 'standard')
on conflict (model) do nothing;

create table if not exists client_variable_costs (
  client_id integer primary key references clients(id) on delete cascade,
  current_month text not null,
  ai_cost_cents_month integer not null default 0,
  ai_cost_cents_lifetime integer not null default 0,
  sms_cost_cents_month integer not null default 0,
  sms_cost_cents_lifetime integer not null default 0,
  voice_cost_cents_month integer not null default 0,
  voice_cost_cents_lifetime integer not null default 0,
  revenue_cents_month integer not null default 0,
  revenue_cents_lifetime integer not null default 0,
  profit_cents_month integer generated always as (
    revenue_cents_month - ai_cost_cents_month - sms_cost_cents_month - voice_cost_cents_month
  ) stored,
  profit_cents_lifetime integer generated always as (
    revenue_cents_lifetime - ai_cost_cents_lifetime - sms_cost_cents_lifetime - voice_cost_cents_lifetime
  ) stored,
  default_budget_cents integer not null default 1000,
  updated_at timestamp not null default now()
);

create index if not exists client_variable_costs_month_idx
  on client_variable_costs(current_month);

-- Monthly time-series — one row per client per month. Written when the
-- per-client current_month rolls over so the client-detail view can render a
-- 6-month trend without scanning ai_usage_logs.
create table if not exists client_variable_costs_history (
  client_id integer not null references clients(id) on delete cascade,
  month text not null,
  ai_cost_cents integer not null default 0,
  sms_cost_cents integer not null default 0,
  voice_cost_cents integer not null default 0,
  revenue_cents integer not null default 0,
  created_at timestamp not null default now(),
  primary key (client_id, month)
);
