-- Migration 0015 — Widget scheduling picker (Wave R-1)
--
-- Adds a Calendly-style scheduling step to QuoteQuick widgets.
-- - availability_rules: one row per calculator. Working days/hours/timezone
--   + slot duration + buffer minutes. Used by the server to compute open
--   slots for the next 14 days.
-- - scheduled_appointments: customer bookings created from the widget.
--   Linked to a calculator (and optionally a lead). One row per booking.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS availability_rules (
  id SERIAL PRIMARY KEY,
  calculator_id INTEGER NOT NULL REFERENCES calculators(id),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]'::jsonb,  -- 0=Sun..6=Sat
  working_hours_start TEXT NOT NULL DEFAULT '09:00',
  working_hours_end TEXT NOT NULL DEFAULT '17:00',
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_availability_rules_calc
  ON availability_rules (calculator_id);

CREATE TABLE IF NOT EXISTS scheduled_appointments (
  id SERIAL PRIMARY KEY,
  calculator_id INTEGER NOT NULL REFERENCES calculators(id),
  lead_id INTEGER REFERENCES leads(id),
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  scheduled_for TIMESTAMP NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_appointments_calc_time
  ON scheduled_appointments (calculator_id, scheduled_for);
