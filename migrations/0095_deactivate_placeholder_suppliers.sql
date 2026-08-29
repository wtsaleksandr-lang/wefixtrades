-- 0095_deactivate_placeholder_suppliers.sql
--
-- Deactivate supplier rows whose contact_email is a reserved placeholder
-- domain (RFC 2606 example.*, plus .invalid / .test / .local).
--
-- server/scripts/seed-suppliers.ts seeded a starter roster —
-- design@example.com, seo@example.com, content@example.com,
-- ads@example.com, adflow-agency@example.com — as
-- status='active', is_active=true, supplier_type='email'.
--
-- autoAssignSupplier() matches active suppliers on supported_services, so a
-- paid SiteLaunch order auto-assigned to "Website Design Agency" and
-- dispatchViaEmail() mailed a brief to design@example.com containing the
-- customer's business name, website and full onboarding answers. Nobody owns
-- example.com, so this was customer data being sent to an address we do not
-- control — not just a brief lost in the void. AdFlow briefs went the same
-- way via adflow-agency@example.com.
--
-- Fixing the seed script only affects future seeding; this deactivates rows
-- already present. A runtime guard in server/services/supplierPlaceholder.ts
-- blocks these addresses on both the assignment and the send path regardless.
--
-- Idempotent (re-running is a no-op once rows are already inactive) and
-- non-destructive: rows are kept so an admin can put a real address in and
-- re-activate. Runs on boot via server/lib/bootstrapMigrations.ts.

UPDATE suppliers
SET
  is_active = FALSE,
  status    = 'inactive',
  notes     = COALESCE(notes || E'\n', '')
              || 'Auto-deactivated by migration 0095: placeholder contact_email ('
              || COALESCE(contact_email, 'none')
              || '). Set a real vendor address before re-activating.'
WHERE is_active = TRUE
  AND contact_email IS NOT NULL
  AND (
       contact_email ILIKE '%@example.com'
    OR contact_email ILIKE '%.example.com'
    OR contact_email ILIKE '%@example.org'
    OR contact_email ILIKE '%@example.net'
    OR contact_email ILIKE '%@example.edu'
    OR contact_email ILIKE '%@localhost'
    OR contact_email ILIKE '%.invalid'
    OR contact_email ILIKE '%@invalid'
    OR contact_email ILIKE '%.test'
    OR contact_email ILIKE '%@test'
    OR contact_email ILIKE '%.local'
  );
