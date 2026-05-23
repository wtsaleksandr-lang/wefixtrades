-- COMMS-FEATURES wave — admin Communications page additions.
--
-- Adds a `contacts` table so the admin can save phone numbers as named
-- entries (display_name + phone_e164) and optionally link each contact
-- to an existing user (clients) and/or supplier. The Communications
-- page joins on phone_e164 at query time, so we do NOT mutate the
-- existing Twilio-driven conversation flow — Twilio is still the
-- source of truth for messages and calls; we just enrich them with a
-- contact-name swap and a "linked to" chip.
--
-- Schema notes:
--   • UUID PK (gen_random_uuid) — keeps contact IDs opaque + stable
--     while everything else admin-side is serial INTEGER. The link
--     columns reference users.id / suppliers.id (both serial INTEGER).
--   • phone_e164 is UNIQUE so each number maps to at most one contact.
--   • ON DELETE SET NULL on linked_* — deleting a user/supplier must
--     NOT cascade and remove the contact row.

CREATE TABLE IF NOT EXISTS contacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name        TEXT NOT NULL,
  phone_e164          TEXT NOT NULL UNIQUE,
  email               TEXT,
  notes               TEXT,
  linked_user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  linked_supplier_id  INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contacts_phone_idx          ON contacts(phone_e164);
CREATE INDEX IF NOT EXISTS contacts_linked_user_idx    ON contacts(linked_user_id);
CREATE INDEX IF NOT EXISTS contacts_linked_supplier_idx ON contacts(linked_supplier_id);
