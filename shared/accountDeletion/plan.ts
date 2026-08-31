/**
 * Account-deletion plan — the single, reviewable source of truth for what
 * happens to every piece of data when a customer deletes their WeFixTrades
 * account.
 *
 * ── Why a declarative plan instead of a hand-written cascade ──
 *
 * The schema has 209 tables. 98 of them carry an owner column (`user_id`,
 * `client_id`, `customer_id`, …) and another 31 hang off one of those by a
 * foreign key. A hand-written `deleteAccount()` would drift out of date the
 * first time someone adds a table, and the drift would be *silent* — the
 * account would still appear deleted while personal data quietly survived.
 *
 * So: every account-linked table is classified here exactly once, and
 * `scripts/check-account-deletion-coverage.ts` (npm run check:account-deletion)
 * walks the live Drizzle metadata at CI time and fails the build if
 *   • a new account-linked table is not classified here, or
 *   • a table we KEEP has a blocking foreign key into a table we DELETE
 *     (which would make the deletion abort at runtime), or
 *   • a `keep` entry has no stated legal basis.
 *
 * ── Why we anonymise the anchor rows instead of deleting them ──
 *
 * `DELETE FROM users` cannot succeed on this schema:
 *   • `admin_impersonations.admin_user_id` / `.target_user_id` are
 *     ON DELETE RESTRICT — any user who was ever impersonated is undeletable.
 *   • 22 further foreign keys are ON DELETE NO ACTION.
 *   • 25 columns hold a user id with no FK at all, so they would silently
 *     orphan rather than error.
 * Erasing every personal field on the `users` and `clients` rows while
 * keeping the (meaningless) integer primary keys is irreversible
 * anonymisation under GDPR Art. 4(5)/Recital 26 — the row can no longer be
 * attributed to a person — and it keeps the retained financial records
 * referentially intact. That is the honest and the operable choice.
 *
 * ── Why immediately, and not a 30-day soft-delete window ──
 *
 * A soft-delete window means the personal data is still there. It would put
 * our compliance posture at the mercy of a purge cron that does not exist
 * today and that fails silently when it breaks. Deleting synchronously, in
 * one transaction, is verifiable the moment it returns. The privacy policy's
 * "within 30 days" is an outer bound; doing it now satisfies it with no
 * moving parts. The irreversibility is handled where it belongs — in the UI,
 * with password re-authentication plus type-to-confirm.
 */

/** How a table is reached from the account being deleted. */
export type Scope =
  /** `column` holds `users.id`. */
  | { by: "user"; columns: string[] }
  /** `column` holds `clients.id` of a client owned by this user. */
  | { by: "client"; columns: string[] }
  /** `column` equals the account's email address (case-insensitive). */
  | { by: "email"; columns: string[] }
  /**
   * Reached through a parent row that is itself in this plan:
   * `DELETE FROM t WHERE <column> IN (SELECT <parentKey> FROM <parent> WHERE <parent scope>)`.
   */
  | { by: "parent"; columns: string[]; parent: string; parentKey: string };

export type Action =
  /** Hard-delete every row in scope. */
  | "delete"
  /** Keep the row, overwrite its personal fields (see ANONYMISE_FIELDS). */
  | "anonymize"
  /** Keep the row untouched. Requires `reason`. */
  | "keep";

/* ──────────────────────────────────────────────────────────────────────────
 * Stored objects — the bytes a row points at.
 *
 * A row and the file it references are two different pieces of data in two
 * different systems. `DELETE FROM tradeline_phone_setups` removes the row and
 * with it the only pointer to an encrypted phone-bill PDF — a document holding
 * the customer's name, service address, carrier and account number — which then
 * sits in the bucket forever, unreachable by the 90-day retention sweep because
 * the sweep looks for rows. Deleting the pointer is not deleting the data; it
 * is deleting our ability to find the data.
 *
 * So every column that addresses a store outside Postgres is declared here, and
 * `scripts/check-account-deletion-coverage.ts` fails CI when a new one appears
 * without a declaration.
 * ──────────────────────────────────────────────────────────────────────── */

/** Which store a pointer addresses. Each has its own deleter in the executor. */
export type ObjectStore =
  /** Replit Object Storage — `server/lib/objectStorage.ts`. */
  | "objectStorage"
  /** The container-local upload directory served at `/uploads`. */
  | "uploads"
  /** Cloudflare R2 — `server/lib/r2Upload.ts`. Publicly readable bucket. */
  | "r2"
  /**
   * Twilio — `server/lib/twilioArtefacts.ts`. Not a byte store we run, but the
   * same shape of problem: a column holds a pointer, the data sits outside
   * Postgres, and deleting the row deletes only the pointer.
   *
   * `voicemails.recording_url` is the case that made this necessary. It holds
   * `https://api.twilio.com/…/Recordings/RE…` — the caller's *actual recorded
   * voice*, on Twilio's servers. It was left alone as "a third-party API, out
   * of scope"; that was wrong. We hold the account credentials, Twilio's REST
   * API deletes Recordings, and this codebase already calls it to release
   * numbers. A deletion that erases a voicemail row while the voice recording
   * plays on is exactly the defect the rest of this file removes.
   *
   * The deleter can only address per-customer resources (Recordings,
   * Transcriptions, Messages, Calls). Phone numbers, Messaging Services, A2P
   * brands and Push Credentials are WeFixTrades' own infrastructure, shared
   * across customers, and are deliberately unreachable from here.
   */
  | "twilio";

/**
 * How to read object pointers out of one column.
 *
 * Several of these columns are polymorphic: `clients.logo_url` holds our
 * `/uploads/…` path when the customer uploaded a file and an arbitrary external
 * URL when they pasted one; `content_assets.url` holds an R2 URL or a stock
 * photo link; `voicemails.recording_url` names a recording in OUR Twilio account
 * and a URL naming any other account is a different Twilio customer's. The
 * executor therefore filters every extracted value through a per-store
 * ownership test (`ownedKey`) and ignores anything that does not address the
 * named store — so a pasted URL is never mistaken for a file we own, another
 * account's recording is never deleted, and neither is counted as a failed
 * purge.
 *
 * `jsonScan` exists for free-form JSONB (`leads.answers`) where the pointer is
 * one value among arbitrary customer answers under keys we do not control.
 */
export type ObjectSource =
  /** The column's value IS the pointer. */
  | { store: ObjectStore; column: string; read: "text" }
  /** JSONB array of objects; `field` names the property holding the pointer. */
  | { store: ObjectStore; column: string; read: "jsonField"; field: string }
  /** Arbitrary JSONB; collect every string value that belongs to `store`. */
  | { store: ObjectStore; column: string; read: "jsonScan" };

export interface TablePlan {
  /** SQL table name, exactly as it appears in `pgTable("…")`. */
  table: string;
  action: Action;
  scope: Scope;
  /** REQUIRED for `keep` — the legal basis for retaining this data. */
  reason?: string;
  /**
   * Columns pointing at bytes held outside Postgres. Collected before the
   * transaction (the rows that name them are about to go) and purged after it
   * commits. Only meaningful on `delete` / `anonymize` entries — a kept row
   * keeps its files too, which the guard enforces.
   */
  objects?: ObjectSource[];
}

/* ──────────────────────────────────────────────────────────────────────────
 * 1. Anchor rows — anonymised in place.
 * ──────────────────────────────────────────────────────────────────────── */

const ANCHORS: TablePlan[] = [
  { table: "users", action: "anonymize", scope: { by: "user", columns: ["id"] } },
  { table: "clients", action: "anonymize", scope: { by: "client", columns: ["id"] } },
  {
    // Payout identity is erased; the row survives so already-accrued
    // commissions still reconcile against a (now anonymous) affiliate.
    table: "affiliates",
    action: "anonymize",
    scope: { by: "user", columns: ["owner_user_id"] },
  },
];

/**
 * Columns overwritten by `anonymize`, per table. Every value is a constant or
 * a deterministic function of the row id — never derived from the data being
 * erased, so the original cannot be recovered from what remains.
 *
 * `null` means "set NULL"; `"@id"` means "a synthetic value keyed by the row's
 * primary key" (used where a NOT NULL + UNIQUE constraint forbids NULL).
 */
export const ANONYMISE_FIELDS: Record<string, Record<string, null | "@id" | string>> = {
  users: {
    email: "@id", // NOT NULL UNIQUE → deleted-user-<id>@deleted.wefixtrades.invalid
    password_hash: "@id", // unusable, non-verifiable value: login is impossible
    name: null,
    totp_secret: null,
    totp_enabled: "false",
    totp_recovery_codes: null,
    google_sub: null,
    microsoft_sub: null,
    facebook_sub: null,
    apple_sub: null,
    ai_contact_phone: null,
    ai_contact_method: "dashboard",
    admin_2fa_grace_used_at: null,
    locked_until: null,
    failed_login_attempts: "0",
  },
  clients: {
    business_name: "Deleted account",
    contact_name: null,
    contact_email: null,
    contact_phone: null,
    website_url: null,
    logo_url: null,
    google_place_id: null,
    facebook_page_url: null,
    google_credentials: null, // live Google Business OAuth tokens
    widget_token: null,
    journey_summary: null,
    metadata: null,
    business_hours: null,
    special_hours: null,
    referral_code: null,
    stripe_customer_id: null,
    status: "churned",
  },
  affiliates: {
    email: "@id",
    name: null,
    payout_method: null,
    payout_details: null,
  },
};

/* ──────────────────────────────────────────────────────────────────────────
 * 2. Deleted — personal / operational data with no retention basis.
 * ──────────────────────────────────────────────────────────────────────── */

/** Owned directly by the authenticated user. */
const DELETE_BY_USER: Array<[table: string, column: string]> = [
  ["ai_conversation_archive", "user_id"],
  ["ai_spend_log", "user_id"],
  ["ai_usage_logs", "user_id"],
  ["api_keys", "user_id"],
  ["api_subscriptions", "user_id"],
  ["api_usage_logs", "user_id"],
  ["api_webhooks", "user_id"],
  ["assistant_threads", "user_id"],
  ["brand_kits", "user_id"],
  ["calculators", "user_id"],
  ["chat_memory", "user_id"],
  ["citation_builder_submissions", "customer_id"],
  ["citation_tracker_subscriptions", "customer_id"],
  ["contacts", "linked_user_id"],
  ["mobile_call_records", "user_id"],
  ["mobile_devices", "user_id"],
  ["mobile_refresh_tokens", "user_id"],
  ["password_reset_tokens", "user_id"],
  ["voicemails", "user_id"],
];

/** Owned by a `clients` row belonging to the authenticated user. */
const DELETE_BY_CLIENT: Array<[table: string, column: string]> = [
  ["adflow_reports", "client_id"],
  ["ai_action_audit_log", "client_id"],
  ["ai_insights_cache", "client_id"],
  ["ai_insights_dismissed_actions", "client_id"],
  ["ai_response_ratings", "client_id"],
  ["bookflow_appointments", "client_id"],
  ["bookflow_settings", "client_id"],
  ["calendar_connections", "client_id"],
  ["callback_requests", "client_id"],
  ["callback_widget_configs", "client_id"],
  ["client_email_identities", "client_id"],
  ["client_faq_items", "client_id"],
  ["client_trust_badges", "client_id"],
  ["client_variable_costs", "client_id"],
  ["client_variable_costs_history", "client_id"],
  ["content_assets", "client_id"],
  ["content_drafts", "client_id"],
  ["content_requests", "client_id"],
  ["customer_notification_preferences", "client_id"],
  ["customer_push_subscriptions", "client_id"],
  ["customers", "client_id"],
  ["fulfillment_tasks", "client_id"],
  ["google_business_locations", "client_id"],
  ["internal_notes", "client_id"],
  // NULL client_id rows are the shared built-in templates — the scope
  // predicate keeps them safe.
  ["invoice_templates", "client_id"],
  ["mapguard_alerts", "client_id"],
  ["mapguard_posts", "client_id"],
  ["mapguard_snapshots", "client_id"],
  ["mapguard_tasks", "client_id"],
  ["monitored_reviews", "client_id"],
  ["notification_log", "client_id"],
  ["onboarding_submissions", "client_id"],
  ["rankflow_keywords", "client_id"],
  ["rankflow_monthly_plans", "client_id"],
  ["rankflow_pages", "client_id"],
  ["rankflow_profiles", "client_id"],
  ["rankflow_progress", "client_id"],
  ["rankflow_signals", "client_id"],
  ["rankflow_tasks", "client_id"],
  ["referral_credits", "client_id"],
  ["reputation_competitor_snapshots", "client_id"],
  ["reputation_competitors", "client_id"],
  ["review_funnel_events", "client_id"],
  ["review_link_configs", "client_id"],
  ["review_reply_post_queue", "client_id"],
  ["review_requests", "client_id"],
  ["review_sync_logs", "client_id"],
  ["reviews", "client_id"],
  ["service_area_map_configs", "client_id"],
  ["service_cost_logs", "client_id"],
  ["sitelaunch_sites", "client_id"],
  ["sms_template_overrides", "client_id"],
  ["socialsync_activity_logs", "client_id"],
  ["socialsync_platform_connections", "client_id"], // encrypted Meta/Google tokens
  ["socialsync_posts", "client_id"],
  ["socialsync_profiles", "client_id"],
  ["socialsync_publish_queue", "client_id"],
  ["socialsync_topics", "client_id"],
  ["support_tickets", "client_id"],
  ["tradeline_assistant_settings", "client_id"],
  ["tradeline_chat_install_requests", "client_id"],
  ["tradeline_knowledge_base", "client_id"],
  ["tradeline_phone_setups", "client_id"],
  ["tradeline_widget_sites", "client_id"],
  ["video_projects", "client_id"],
  ["webcare_action_log", "client_id"],
  ["webcare_backups", "client_id"],
  ["webcare_malware_scans", "client_id"],
];

/**
 * Reached only through a parent row. Deleted first (see `deletionOrder`) so
 * the parent delete cannot trip a NO ACTION foreign key.
 */
const DELETE_VIA_PARENT: Array<
  [table: string, columns: string[], parent: string, parentKey: string]
> = [
  ["ai_conversations", ["calculator_id", "account_id"], "calculators", "id"],
  ["analytics_events", ["calculator_id"], "calculators", "id"],
  ["api_rate_limit_buckets", ["key_id"], "api_keys", "id"],
  ["api_webhook_deliveries", ["webhook_id"], "api_webhooks", "id"],
  ["assistant_messages", ["thread_id"], "assistant_threads", "id"],
  ["availability_rules", ["calculator_id"], "calculators", "id"],
  ["bookings", ["calculator_id"], "calculators", "id"],
  ["calculator_analytics_daily", ["calculator_id"], "calculators", "id"],
  ["calculator_analytics_events", ["calculator_id"], "calculators", "id"],
  ["calculator_analytics_summary", ["calculator_id"], "calculators", "id"],
  ["citation_builder_directory_tasks", ["submission_id"], "citation_builder_submissions", "id"],
  ["citation_tracker_alerts", ["subscription_id"], "citation_tracker_subscriptions", "id"],
  ["citation_tracker_listings", ["subscription_id"], "citation_tracker_subscriptions", "id"],
  ["content_approvals", ["draft_id"], "content_drafts", "id"],
  ["deployment_status", ["calculator_id"], "calculators", "id"],
  ["followup_jobs", ["calculator_id"], "calculators", "id"],
  ["leads", ["calculator_id"], "calculators", "id"],
  ["mapguard_task_activity", ["task_id"], "mapguard_tasks", "id"],
  ["notification_queue", ["calculator_id"], "calculators", "id"],
  ["quote_snapshots", ["calculator_id"], "calculators", "id"],
  ["rankflow_qa_checks", ["task_id"], "rankflow_tasks", "id"],
  ["rankflow_rankings", ["keyword_id"], "rankflow_keywords", "id"],
  ["scheduled_appointments", ["calculator_id"], "calculators", "id"],
  ["sms_messages", ["calculator_id"], "calculators", "id"],
  ["ticket_events", ["ticket_id"], "support_tickets", "id"],
  ["ticket_messages", ["ticket_id"], "support_tickets", "id"],
  ["tradeline_call_log", ["client_service_id"], "client_services", "id"],
  ["tradeline_mode_log", ["client_service_id"], "client_services", "id"],
  ["tradeline_usage", ["client_service_id"], "client_services", "id"],
  ["video_scenes", ["project_id"], "video_projects", "id"],
  ["widget_deposits", ["calculator_id"], "calculators", "id"],
];

/* ──────────────────────────────────────────────────────────────────────────
 * 3. Kept — every one of these needs a legal basis, and the UI and the
 *    privacy policy must say so. Nothing lands here for convenience.
 * ──────────────────────────────────────────────────────────────────────── */

const TAX_BASIS =
  "Financial record. Retained 7 years to meet tax and accounting obligations " +
  "(privacy policy §8). Linked only to the anonymised account row.";

const SUPPRESSION_BASIS =
  "Suppression list. Deleting it would let us contact someone who opted out — " +
  "a TCPA/CASL/CAN-SPAM violation. Retained on legal-obligation grounds.";

const KEEP: TablePlan[] = [
  {
    table: "client_payments",
    action: "keep",
    scope: { by: "client", columns: ["client_id"] },
    reason: TAX_BASIS,
  },
  {
    table: "orders",
    action: "keep",
    scope: { by: "client", columns: ["client_id"] },
    reason: TAX_BASIS,
  },
  {
    table: "order_items",
    action: "keep",
    scope: { by: "parent", columns: ["order_id"], parent: "orders", parentKey: "id" },
    reason: TAX_BASIS + " Line items of a retained invoice.",
  },
  {
    table: "client_services",
    action: "keep",
    scope: { by: "client", columns: ["client_id"] },
    reason:
      TAX_BASIS +
      " The subscription rows retained invoices and order line items point at; " +
      "holds service configuration, not personal data.",
  },
  {
    table: "bookflow_invoices",
    action: "keep",
    scope: { by: "client", columns: ["client_id"] },
    reason: TAX_BASIS,
  },
  {
    table: "billing_dunning_events",
    action: "keep",
    scope: { by: "client", columns: ["client_id"] },
    reason: TAX_BASIS + " Payment-failure history attached to retained invoices.",
  },
  {
    table: "affiliate_commissions",
    action: "keep",
    scope: { by: "client", columns: ["client_id"] },
    reason:
      TAX_BASIS + " Commission accounting; the affiliate identity is anonymised.",
  },
  {
    table: "referral_attributions",
    action: "keep",
    scope: { by: "client", columns: ["referred_client_id"] },
    reason:
      "Belongs to the OTHER party — the referrer whose credit this row justifies. " +
      "Deleting it would revoke a third party's earned credit. Carries no personal " +
      "data of the deleted account beyond an anonymised client id.",
  },
  {
    table: "sms_opt_outs",
    action: "keep",
    scope: { by: "client", columns: ["scope_client_id"] },
    reason: SUPPRESSION_BASIS,
  },
  {
    table: "review_request_suppression",
    action: "keep",
    scope: { by: "client", columns: ["client_id"] },
    reason: SUPPRESSION_BASIS + " Do-not-contact list for review requests.",
  },
  {
    table: "admin_impersonations",
    action: "keep",
    scope: { by: "user", columns: ["target_user_id", "admin_user_id"] },
    reason:
      "Security audit trail of staff access to this account, and ON DELETE " +
      "RESTRICT at the database level. Stores only integer user ids — after " +
      "anonymisation it identifies nobody.",
  },
];

/* ──────────────────────────────────────────────────────────────────────────
 * 4. Stored objects — table → the columns that address bytes outside Postgres.
 *
 * Kept as one block rather than sprinkled through the lists above so the whole
 * out-of-database surface is reviewable on one screen, and so the coverage
 * guard has a single place to check against the live schema.
 *
 * ── Retention exceptions: none apply to files ──
 *
 * Everything the plan retains on a legal basis (invoices, orders, order items,
 * subscription rows, dunning history, suppression lists) is row data. None of
 * those tables holds a pointer into any store — invoices are rendered from the
 * row on demand, never saved as a document — so the 7-year tax obligation and
 * the suppression-list obligation are both satisfied without keeping a single
 * file. Every file below is therefore purged outright.
 *
 * The one case that looks like an exception is the signed Letter of
 * Authorization: porting rules require the authorisation to be evidenced. It is
 * still purged here, because our copy is not that evidence — the LOA is
 * submitted to Twilio (`services/tradelineSetup/portSubmission.ts`), which
 * holds the carrier-side record, and `jobs/tradelineBillRetentionWorker.ts`
 * already destroys our copy 90 days after the port resolves. Keeping it past an
 * explicit deletion request would retain the customer's phone bill and home
 * address to duplicate a record somebody else is already required to hold.
 *
 * ── Retention exceptions at Twilio: exactly one, and it is narrow ──
 *
 * The Twilio-side port-in order (`tradeline_phone_setups.port_twilio_order_sid`)
 * is deliberately NOT deleted, and it is the record the paragraph above leans
 * on: it is the carrier-side evidence that this subscriber authorised the
 * transfer of their number. Destroying it would leave a completed port with no
 * authorisation behind it, and cancelling one still in flight would strand the
 * customer's number mid-transfer. It is retained narrowly — the order, not the
 * call recordings, not the messages — and the deletion copy says so rather than
 * claiming everything at Twilio is gone.
 *
 * Nothing else at Twilio is retained on our say-so. The Recordings, Calls and
 * Messages above are erased outright: no Twilio-documented obligation, and no
 * carrier one either, attaches to message bodies or call audio. The
 * carrier-audit obligation that does exist attaches to consent and opt-out
 * evidence, which lives in the `sms_opt_outs` row this plan already keeps.
 *
 * If an individual account genuinely must be preserved, that is what the
 * `retention_overrides` legal-hold registry is for: a live hold makes
 * `assertNoLegalHold` refuse the whole deletion and route it to a human, rather
 * than quietly keeping files the customer was told were gone.
 * ──────────────────────────────────────────────────────────────────────── */

export const STORED_OBJECTS: Record<string, ObjectSource[]> = {
  /**
   * Number-porting paperwork: the customer's phone bill (name, service
   * address, carrier, account number), the signature they drew, and the
   * generated Letter of Authorization carrying all of it. The most sensitive
   * documents the product holds, and the reason this whole mechanism exists.
   *
   * `port_loa_object_key` is a backward-compatible alias that points at the
   * signature PNG (see the sign-loa route); listed so the older rows written
   * before Wave 86 are purged too.
   */
  tradeline_phone_setups: [
    { store: "objectStorage", column: "port_bill_object_key", read: "text" },
    { store: "objectStorage", column: "port_loa_object_key", read: "text" },
    { store: "objectStorage", column: "port_loa_pdf_object_key", read: "text" },
    { store: "objectStorage", column: "port_signature_object_key", read: "text" },
  ],

  /**
   * Mirrored Vapi call recordings. The customer's and their callers' actual
   * voices — biometric-adjacent personal data, and the privacy policy's
   * deletion clause names call recordings explicitly.
   */
  tradeline_call_log: [
    { store: "objectStorage", column: "mirrored_object_key", read: "text" },
  ],

  /**
   * Encrypted WebCare site backups: the customer's site content and settings.
   */
  webcare_backups: [{ store: "objectStorage", column: "object_name", read: "text" }],

  /**
   * Images the customer sent the AI assistant from the mobile Ask tab. Shape
   * is `Array<{ assetId, mimeType, sizeBytes }>`; `assetId` is the object key.
   */
  assistant_messages: [
    { store: "objectStorage", column: "attachments", read: "jsonField", field: "assetId" },
  ],

  /**
   * Photos an end customer attached to a quote request — pictures of their own
   * home. Third-party personal data the account holder collected, stored as a
   * `/uploads/lead-photos/…` URL among arbitrary answers under field ids we do
   * not control, so the whole blob is scanned.
   */
  leads: [{ store: "uploads", column: "answers", read: "jsonScan" }],

  /**
   * Files our staff delivered to this customer: `{ kind, url, label, … }`.
   * `kind: "link"` entries carry an external URL, which the uploads membership
   * test skips.
   */
  fulfillment_tasks: [
    { store: "uploads", column: "deliverables", read: "jsonField", field: "url" },
  ],

  /**
   * The uploaded business logo. `clients` is anonymised rather than deleted, and
   * ANONYMISE_FIELDS nulls `logo_url` — without this the file outlives the
   * pointer. A pasted external URL is not in this store and is skipped.
   */
  clients: [{ store: "uploads", column: "logo_url", read: "text" }],

  /**
   * ContentFlow renders. R2 is a PUBLIC bucket: anyone holding the URL can read
   * these until the object is gone, so the pointer disappearing is worth
   * nothing on its own.
   */
  video_projects: [{ store: "r2", column: "video_url", read: "text" }],
  video_scenes: [{ store: "r2", column: "video_url", read: "text" }],
  content_assets: [
    { store: "r2", column: "url", read: "text" },
    { store: "r2", column: "public_url", read: "text" },
  ],
  /**
   * Generated post imagery lives under `metadata.media_plan` at keys that have
   * moved between waves, so the blob is scanned rather than path-walked. When
   * R2 is unconfigured the same field holds an inline base64 data URI, which is
   * not in any store and is skipped.
   */
  content_drafts: [{ store: "r2", column: "metadata", read: "jsonScan" }],

  /* ── Held by Twilio ──────────────────────────────────────────────────────
   *
   * Attribution: these SIDs are only ever read out of rows already scoped to
   * the account being erased, and a value naming a Twilio account other than
   * ours is discarded rather than deleted. We never list Twilio and never
   * infer ownership from anything but our own scoped rows — see the header of
   * `server/lib/twilioArtefacts.ts`. That is what stops this from reaching
   * another customer's recording, which would be far worse than the bug it
   * fixes. */

  /**
   * The voicemail somebody left on the customer's business line: their actual
   * recorded voice, held by Twilio, plus the Call record naming both parties'
   * phone numbers. Our own Whisper transcript and Claude summary live in
   * `transcript` / `summary` on this row and go with it.
   *
   * `recording_url` is listed first so the audio is erased before the Call
   * record that indexes it. Twilio does not cascade either way — each is
   * deleted on its own key — but a failure part-way through should leave the
   * more sensitive artefact already gone.
   */
  voicemails: [
    { store: "twilio", column: "recording_url", read: "text" },
    { store: "twilio", column: "call_sid", read: "text" },
  ],

  /**
   * Softphone call records. The Twilio Call resource holds who called whom and
   * when — the same personal data as the row's own `from_number`/`to_number`,
   * which we delete. Not recorded: no TwiML in this product sets `record`, so
   * these calls have no Recording to chase.
   */
  mobile_call_records: [{ store: "twilio", column: "call_sid", read: "text" }],

  /**
   * The SMS conversation between the customer's business and their leads —
   * both parties' numbers and the message bodies, held by Twilio for 13 months
   * by default. Deleting the Message removes the media stored with it too.
   *
   * Safe against the opt-out obligation: Twilio keeps opt-out state on the
   * Messaging Service's block list, not on the Message resource, and it has no
   * REST delete at all — so erasing message history cannot resurrect a number
   * somebody STOPped. Our own evidence of the opt-out is the `sms_opt_outs`
   * row, which this plan retains on exactly that basis.
   */
  sms_messages: [{ store: "twilio", column: "twilio_sid", read: "text" }],
};

/* ──────────────────────────────────────────────────────────────────────────
 * 5. The assembled plan.
 * ──────────────────────────────────────────────────────────────────────── */

const ASSEMBLED: TablePlan[] = [
  ...ANCHORS,
  ...DELETE_BY_USER.map(
    ([table, column]): TablePlan => ({
      table,
      action: "delete",
      scope: { by: "user", columns: [column] },
    }),
  ),
  ...DELETE_BY_CLIENT.map(
    ([table, column]): TablePlan => ({
      table,
      action: "delete",
      scope: { by: "client", columns: [column] },
    }),
  ),
  ...DELETE_VIA_PARENT.map(
    ([table, columns, parent, parentKey]): TablePlan => ({
      table,
      action: "delete",
      scope: { by: "parent", columns, parent, parentKey },
    }),
  ),
  ...KEEP,
];

/**
 * Object declarations are merged in here rather than written inline above, so a
 * table can never carry a declaration the assembled plan drops on the floor.
 */
export const ACCOUNT_DELETION_PLAN: TablePlan[] = ASSEMBLED.map((entry) =>
  STORED_OBJECTS[entry.table] ? { ...entry, objects: STORED_OBJECTS[entry.table] } : entry,
);

/** Plan entries that address bytes outside Postgres. */
export function tablesWithObjects(): TablePlan[] {
  return ACCOUNT_DELETION_PLAN.filter((p) => (p.objects?.length ?? 0) > 0);
}

/**
 * `session` is handled outside the plan: connect-pg-simple owns the table, it
 * has no user column at all, and the user id lives inside the `sess` JSON
 * blob. The executor deletes it with an explicit JSON-path predicate.
 */
export const SESSION_DELETE_NOTE =
  "session rows are removed by JSON path (sess->'passport'->>'user'), not by the plan.";

export function planFor(table: string): TablePlan | undefined {
  return ACCOUNT_DELETION_PLAN.find((p) => p.table === table);
}

/** Tables whose rows are hard-deleted. */
export function deletedTables(): TablePlan[] {
  return ACCOUNT_DELETION_PLAN.filter((p) => p.action === "delete");
}

/** Tables kept, each with its stated legal basis. */
export function keptTables(): TablePlan[] {
  return ACCOUNT_DELETION_PLAN.filter((p) => p.action === "keep");
}

/**
 * Order the `delete` entries so a table always comes before anything it
 * depends on: children (parent-scoped) first, then their parents, then the
 * rest. `edges` maps a table to the tables it holds foreign keys into; the
 * caller supplies it from live Drizzle metadata so the ordering reflects the
 * real schema rather than a second hand-maintained list.
 *
 * Pure and side-effect free so the guard can assert the ordering offline.
 */
export function deletionOrder(edges: Map<string, string[]>): string[] {
  const targets = new Set(deletedTables().map((p) => p.table));
  const visited = new Set<string>();
  const inProgress = new Set<string>();
  const out: string[] = [];

  // Depth-first over "who points at me": emit dependents before their parent.
  const dependents = new Map<string, string[]>();
  for (const t of targets) dependents.set(t, []);
  for (const [from, tos] of edges) {
    if (!targets.has(from)) continue;
    for (const to of tos) {
      if (to !== from && targets.has(to)) dependents.get(to)!.push(from);
    }
  }

  function visit(table: string): void {
    if (visited.has(table)) return;
    // A foreign-key cycle would otherwise recurse forever. Emitting the table
    // anyway keeps the order deterministic; the guard reports the cycle.
    if (inProgress.has(table)) return;
    inProgress.add(table);
    for (const dep of (dependents.get(table) ?? []).slice().sort()) visit(dep);
    inProgress.delete(table);
    visited.add(table);
    out.push(table);
  }

  for (const t of [...targets].sort()) visit(t);
  return out;
}
