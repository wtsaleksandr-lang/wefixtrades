-- 0073_port_automation_columns.sql
--
-- Wave 86 — Fully-automated AI-assisted porting flow.
--
-- Adds the columns the new layers (bill OCR, LOA PDF, Twilio porting API,
-- status poller, rejection translator, customer/admin panels) need on
-- tradeline_phone_setups. All additive + IF NOT EXISTS for re-run safety.
--
-- Status-enum extensions are application-layer only (portStatusSchema in
-- shared/schemas/tradelinePhoneSetups.ts) — no DB CHECK constraint exists
-- on port_status, so we don't need to ALTER any constraint here.
--
-- New columns:
--
--   port_extraction_json       — raw output of the Claude vision bill OCR
--                                pass. JSON blob with structured fields +
--                                per-field confidence scores. NOT user-edited
--                                values; those live in the wizard state and
--                                end up in port_request_id metadata via Twilio.
--   port_extraction_at         — when the OCR ran (drives "re-run extraction"
--                                cooldown + analytics).
--
--   port_loa_pdf_object_key    — encrypted object key for the GENERATED LOA
--                                PDF (separate from port_loa_object_key which
--                                stored the signature PNG in earlier waves).
--                                The signature PNG key is preserved as
--                                port_signature_object_key for the audit
--                                trail (which canvas-bytes were embedded).
--   port_signature_object_key  — raw signature PNG (audit-only).
--   port_signature_method      — 'web_canvas' for v1; future: 'docusign' etc.
--   port_signature_ip_hash     — SHA256 of signer IP (TCPA audit trail).
--   port_signature_user_agent  — signer UA string (truncated to 240 chars).
--
--   port_twilio_order_sid      — Twilio porting API order SID returned on
--                                successful create (separate from
--                                port_request_id which doubled as the
--                                application-side identifier).
--   port_twilio_target_date    — `lossOfNumberAt` requested at submission.
--   port_estimated_completion  — best-guess completion date used in customer
--                                comms ("Day 5 of typical 14").
--   port_last_polled_at        — when the status poller last touched this row.
--   port_rejection_code        — Twilio rejection code (e.g.
--                                'PORT_DENIED_BALANCE_DUE'); the user-facing
--                                translation lives in
--                                server/services/tradelineSetup/portRejectionTranslator.ts.
--   port_canceled_at           — set when the customer cancels via the
--                                portal page or admin force-cancels.
--   port_canceled_by           — 'customer' | 'admin' | 'twilio_rejection'.
--
-- The 90-day retention worker already keys off port_resolved_at — the new
-- PDF + signature object keys MUST be cleared in the same sweep. That
-- patch lives in server/jobs/tradelineBillRetentionWorker.ts (Wave 86).

ALTER TABLE tradeline_phone_setups
  ADD COLUMN IF NOT EXISTS port_extraction_json      jsonb,
  ADD COLUMN IF NOT EXISTS port_extraction_at        timestamptz,
  ADD COLUMN IF NOT EXISTS port_loa_pdf_object_key   text,
  ADD COLUMN IF NOT EXISTS port_signature_object_key text,
  ADD COLUMN IF NOT EXISTS port_signature_method     varchar(40),
  ADD COLUMN IF NOT EXISTS port_signature_ip_hash    varchar(64),
  ADD COLUMN IF NOT EXISTS port_signature_user_agent varchar(255),
  ADD COLUMN IF NOT EXISTS port_twilio_order_sid     varchar(64),
  ADD COLUMN IF NOT EXISTS port_twilio_target_date   timestamptz,
  ADD COLUMN IF NOT EXISTS port_estimated_completion timestamptz,
  ADD COLUMN IF NOT EXISTS port_last_polled_at       timestamptz,
  ADD COLUMN IF NOT EXISTS port_rejection_code       varchar(64),
  ADD COLUMN IF NOT EXISTS port_canceled_at          timestamptz,
  ADD COLUMN IF NOT EXISTS port_canceled_by          varchar(24);

-- Composite index for the status-polling worker: it sweeps every 4h for
-- rows in transit. Filters on port_status IN (...transit set...) plus
-- port_last_polled_at older than the cadence cut.
CREATE INDEX IF NOT EXISTS idx_tps_port_polling
  ON tradeline_phone_setups (port_status, port_last_polled_at);

-- Twilio order SID lookups (webhook handler — when we wire one — needs a
-- fast point lookup from the SID back to the row).
CREATE INDEX IF NOT EXISTS idx_tps_port_twilio_order_sid
  ON tradeline_phone_setups (port_twilio_order_sid);
