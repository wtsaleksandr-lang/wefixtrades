-- Wave W-BB-4 — per-calculator conversion analytics.
--
-- Two new tables underpin the customer-facing "Calculator Analytics" dashboard
-- (parity with Outgrow / Calconic). The raw events table is append-only and
-- written from the public widget (no-auth POST /api/calculator-analytics/event);
-- the daily rollup is computed by `calculator_analytics_rollup` cron (03:00 UTC)
-- and read by the portal at /api/portal/calculators/:id/analytics.
--
-- Notes
--  * `calculator_id` is INTEGER (matches calculators.id serial) — the original
--    spec used TEXT but the rest of the schema is integer FK so we follow suit.
--  * `value_meta` / `visitor_meta` are jsonb. visitor_meta NEVER stores raw IP
--    (only sha256(ip)) or PII (user_agent + UTM only).
--  * Indices match the two access patterns the rollup uses (per-calculator,
--    time-bounded) and per-session reconstruction.

create table if not exists calculator_analytics_events (
  id bigserial primary key,
  calculator_id integer not null references calculators(id) on delete cascade,
  session_id text not null,
  event_type text not null,
  field_id text,
  value_meta jsonb,
  visitor_meta jsonb,
  occurred_at timestamp not null default now()
);

create index if not exists calculator_analytics_calc_time_idx
  on calculator_analytics_events(calculator_id, occurred_at desc);
create index if not exists calculator_analytics_session_idx
  on calculator_analytics_events(session_id, occurred_at);

create table if not exists calculator_analytics_daily (
  calculator_id integer not null references calculators(id) on delete cascade,
  date date not null,
  views integer not null default 0,
  starts integer not null default 0,
  completions integer not null default 0,
  abandonments integer not null default 0,
  avg_completion_seconds integer,
  field_change_counts jsonb not null default '{}'::jsonb,
  primary key (calculator_id, date)
);

create index if not exists calculator_analytics_daily_date_idx
  on calculator_analytics_daily(date desc);
