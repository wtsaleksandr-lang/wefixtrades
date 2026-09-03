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
  | { by: "parent"; columns: string[]; parent: string; parentKey: string }
  /**
   * Reachable by more than one route, OR'd together. A row matched by ANY
   * branch is in scope.
   *
   * `sms_messages` is why this exists. It was scoped by `calculator_id` alone,
   * and two writers (`jobs/reviewFollowupWorker.ts`,
   * `services/reviewRequestService.ts`) store `calculator_id: payload?.calculator_id || null`
   * beside a non-null `lead_id` — so every review-request text sent through
   * those paths, holding the end customer's phone number and the message body,
   * survived the deletion outright. One nullable foreign key is not a scope;
   * a table has to be reachable by every route that can attribute it.
   *
   * A branch whose own scope resolves to nothing is dropped rather than
   * widened, exactly as elsewhere; if every branch drops, so does the table.
   */
  | { by: "anyOf"; scopes: Scope[] };

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
  | "twilio"
  /**
   * A Twilio phone number WE bought and rent to this customer —
   * `services/twilioNumberRelease.ts`, which already existed for the churn path.
   *
   * Deliberately a SEPARATE store from `twilio` rather than a fifth
   * `TwilioResource`. The property that makes the `twilio` deleter safe is that
   * it *structurally cannot* address an account-level resource: no key it
   * accepts can name a phone number, a Messaging Service or an A2P brand. That
   * guarantee is worth more than the code reuse, so releasing a number gets its
   * own store, its own key shape (`PN` + 32 hex, nothing else) and its own
   * deleter, and `deleteTwilioArtefact` stays unable to reach a number.
   *
   * ── Why release at all, when #2068 deliberately did not ──
   *
   * #2068 refused because in the PORT flow the number is the customer's OWN
   * property, moved to us from their previous carrier; relinquishing it on a
   * data-deletion request would destroy a phone number rather than erase
   * personal data. That reasoning is untouched, and the `when` condition on the
   * declaration below is what enforces it: `mode: "port"` is never released.
   *
   * The other two modes are a different thing entirely. In `new` and `forward`
   * we bought the number from Twilio ourselves (`incomingPhoneNumbers.create`
   * in `services/tradelineSetup/provisionNumber.ts`); it is our inventory,
   * rented to them, and was never theirs to keep. Leaving it is not
   * conservatism, it leaks in two directions:
   *   • It bills monthly, forever. The churn path that would release it runs
   *     off subscription state and is never triggered by a deletion — and the
   *     deletion DELETES `tradeline_phone_setups`, which holds the only copy of
   *     `assigned_number_sid`. The SID is therefore not merely un-actioned, it
   *     is destroyed: a recurring charge with nothing left pointing at it.
   *     Exactly the orphan #2067 exists to prevent.
   *   • It stays wired to the erased account. The number keeps the voice_url
   *     and messaging-service binding aimed at this customer's routing, so
   *     calls and texts meant for a business that asked to be erased keep
   *     arriving at our infrastructure.
   */
  | "twilioNumber";

/**
 * A row-level condition on an object declaration.
 *
 * Most pointers are unconditional — a bucket key is a bucket key. One is not:
 * whether `tradeline_phone_setups.assigned_number_sid` may be released depends
 * on `mode`, because the column holds a number we rented out in two of the three
 * wizard flows and is bound up with the customer's own number in the third.
 * Declared beside the pointer so the condition is reviewable in the same place
 * and provable by a fixture, rather than buried in the executor.
 *
 * Deliberately only ever NARROWS: a condition can stop an artefact being
 * collected, never cause one to be collected that the column did not name.
 */
export interface SourceCondition {
  /** Another column on the same row. */
  column: string;
  /**
   * Collect only when the row's value is NOT one of these. A NULL value equals
   * none of them, so it collects — which is the safe direction here: an
   * unforeseen mode falls through to "release a number we pay for", while the
   * one value that must never be released is named explicitly.
   */
  unless: string[];
}

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
  | { store: ObjectStore; column: string; read: "text"; when?: SourceCondition }
  /** JSONB array of objects; `field` names the property holding the pointer. */
  | { store: ObjectStore; column: string; read: "jsonField"; field: string; when?: SourceCondition }
  /** Arbitrary JSONB; collect every string value that belongs to `store`. */
  | { store: ObjectStore; column: string; read: "jsonScan"; when?: SourceCondition };

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
  /**
   * The verbatim request body of every public lead-form submission — the end
   * customer's name, email, phone and every answer they typed — plus their IP
   * address and user agent in typed columns beside it.
   *
   * It was in no plan. `account_id` is a bare integer with no foreign key, so
   * neither the owner-column pattern nor the foreign-key sweep in
   * check-account-deletion-coverage could see it, and the `leads` row this
   * duplicates was deleted while the raw copy of the same submission stayed.
   *
   * `account_id` is unambiguous: `routes/leadRoutes.ts` is the only caller that
   * sets it and it passes `calculator_id`. The other two writers
   * (`demoLeadRoutes`, `missedCallLeadRoutes`) leave it null — those are
   * WeFixTrades' own marketing-funnel leads, owned by no customer account, and
   * the null keeps them correctly out of scope.
   */
  ["intake_events", ["account_id"], "calculators", "id"],
  ["leads", ["calculator_id"], "calculators", "id"],
  ["mapguard_task_activity", ["task_id"], "mapguard_tasks", "id"],
  ["notification_queue", ["calculator_id"], "calculators", "id"],
  ["quote_snapshots", ["calculator_id"], "calculators", "id"],
  ["rankflow_qa_checks", ["task_id"], "rankflow_tasks", "id"],
  ["rankflow_rankings", ["keyword_id"], "rankflow_keywords", "id"],
  ["scheduled_appointments", ["calculator_id"], "calculators", "id"],
  ["ticket_events", ["ticket_id"], "support_tickets", "id"],
  ["ticket_messages", ["ticket_id"], "support_tickets", "id"],
  ["tradeline_call_log", ["client_service_id"], "client_services", "id"],
  ["tradeline_mode_log", ["client_service_id"], "client_services", "id"],
  ["tradeline_usage", ["client_service_id"], "client_services", "id"],
  ["video_scenes", ["project_id"], "video_projects", "id"],
  ["widget_deposits", ["calculator_id"], "calculators", "id"],
];

/* ──────────────────────────────────────────────────────────────────────────
 * Owned by the account's EMAIL ADDRESS, not by a foreign key.
 *
 * These are the pre-account funnels: somebody typed their email into the free
 * SEO audit or the marketing chat widget, and only later (sometimes) signed up.
 * The row was written before a `users.id` existed, so it never got one — which
 * is exactly why the coverage guard could not see any of these tables. They
 * carry an email address, a phone number, a name and, in two cases, the full
 * text of the marketing emails we sent to that address.
 *
 * Matched case-insensitively against `users.email`, which is the address the
 * account is keyed on. An account whose email was never used on a funnel form
 * matches nothing here, and a scope that resolves to no email is SKIPPED
 * rather than widened — the same rule everywhere else follows.
 *
 * `by: "email"` is a weaker attribution than a foreign key and it is worth
 * saying why it is strong enough HERE: `users.email` is UNIQUE, so at most one
 * live account can claim any address, and the funnel rows are the record of
 * somebody handing us that same address. There is no third party whose data
 * could be caught by it.
 * ──────────────────────────────────────────────────────────────────────── */
const DELETE_BY_EMAIL: Array<[table: string, column: string]> = [
  /**
   * The free SEO audit lead capture: email (NOT NULL), phone, name, business
   * name, and `report_json` — a full copy of the audit we generated for them.
   * The top of the funnel that feeds the two tables below.
   */
  ["audit_submissions", "email"],
  /**
   * The scheduled follow-up sequence. `payload` holds `{ subject, body }` — the
   * VERBATIM TEXT of every marketing email queued to this person, addressed by
   * name — beside their email address and business name in typed columns.
   * Rows survive long after the send (`status`, `processed_at`), so this is not
   * a queue that empties itself.
   */
  ["audit_followup_emails", "email"],
  /**
   * The "Chat with us" widget transcript. `messages_json` is the whole
   * conversation, both sides, verbatim; `lead_email` / `lead_name` /
   * `lead_phone` are captured opportunistically when the assistant asks and the
   * visitor answers, and `user_agent` sits beside them.
   *
   * Only the sessions where the visitor DID give an address are reachable — a
   * transcript with `lead_email IS NULL` is attributable to nobody (the
   * `session_id` is a uuid the browser minted, and we deliberately never tie it
   * to an auth session). Those are bounded by RETENTION_SWEEPS instead.
   */
  ["marketing_chat_sessions", "lead_email"],
];

/**
 * Deleted, but reachable by more than one route. Kept out of the lists above
 * because a single (table, column, parent) tuple cannot express them.
 */
const DELETE_ANY_OF: TablePlan[] = [
  {
    /**
     * The SMS conversation: both parties' phone numbers and the message bodies.
     *
     * Scoped by `calculator_id` alone until now, which quietly lost a whole
     * class of rows. `jobs/reviewFollowupWorker.ts` and
     * `services/reviewRequestService.ts` both write
     * `calculator_id: (payload?.calculator_id) || null` next to a `lead_id` they
     * have already checked is present — so a review-request text whose job
     * payload carried no calculator id was stored with the end customer's phone
     * number and the message body, and then survived the account deletion
     * outright. Nothing reported it, because a table the plan covers looks
     * covered.
     *
     * `leads.calculator_id` is NOT NULL, so the lead route always terminates in
     * a calculator this user owns; the two branches agree on who a row belongs
     * to and only differ in how they get there.
     *
     * ── The third branch, and the claim that was not true ──
     *
     * The inbound HELP handler (`routes/twilioRoutes.ts`) stored
     * `lead_id: null, calculator_id: null` on every keyword text, and this entry
     * used to explain that away: the rows were "attributable to no account at
     * all" and "governed by the retention sweep". Both halves were wrong.
     *
     * They were not all unattributable. The handler ALREADY resolves
     * `getClientIdByAssignedNumber(To)` a few lines earlier — it needs it to
     * answer HELP in the tenant's own brand — and then dropped it on the floor.
     * A homeowner texting HELP to a plumber's TradeLine number produced a row
     * holding that homeowner's phone number and the message body, attributable
     * to the plumber the whole time, and the plumber's deletion missed it. The
     * handler now persists what it already knew, as `scope_client_id` — the same
     * column name and the same meaning `sms_opt_outs` has carried since Wave 77.
     *
     * And nothing governed the rest: `jobs/retentionWorker.ts` covered exactly
     * `integration_error_logs` and `processed_stripe_events`. `sms_messages` was
     * in no sweep, so the "governed by" was a justification for a mechanism that
     * did not exist. The genuinely unattributable case — HELP on the SHARED
     * brand line, where the sender is a member of the public and no tenant is
     * involved — is now bounded by RETENTION_SWEEPS, which does exist.
     *
     * (The STOP branch above writes no `sms_messages` row at all; it records the
     * opt-out and replies. There is nothing there to reach.)
     */
    table: "sms_messages",
    action: "delete",
    scope: {
      by: "anyOf",
      scopes: [
        { by: "parent", columns: ["calculator_id"], parent: "calculators", parentKey: "id" },
        { by: "parent", columns: ["lead_id"], parent: "leads", parentKey: "id" },
        { by: "client", columns: ["scope_client_id"] },
      ],
    },
  },
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
    /* The Call record for the one-second outbound test call we placed to the
     * customer's own number to confirm forwarding. It names their personal
     * phone number, which this row is erased for holding, so it goes for the
     * same reason. Our own outbound call to them: no third party's data in it.
     *
     * The port-in ORDER on this table is deliberately not here — see
     * NO_TWILIO_ARTEFACTS in scripts/check-account-deletion-coverage.ts for
     * why, and the retention note above for what the deletion copy says about
     * it. The provisioned number is now handled, conditionally, below. */
    { store: "twilio", column: "forwarding_test_call_sid", read: "text" },

    /* The phone number we bought and rent to this customer — released back to
     * Twilio, but ONLY when it is ours to release.
     *
     * `mode` is the discriminator, and it is exact rather than a guess:
     *   • "new"     — `provisionNumber()` bought it (routes/tradelineSetupRoutes.ts
     *                 `/provision-new`). Ours.
     *   • "forward" — `provisionNumber()` bought a hidden WeFixTrades number for
     *                 the customer's own carrier to forward TO. Also ours; the
     *                 number that is theirs in this flow is `customer_number`,
     *                 which sits at their carrier and which we could not touch
     *                 if we wanted to.
     *   • "port"    — the customer's OWN number, moved to us from their previous
     *                 carrier. Never released. Relinquishing it would destroy a
     *                 phone number they may still want to move on to somebody
     *                 else, which is not an erasure of personal data, it is
     *                 taking something away.
     *
     * The port branch never populates this column in the first place — on
     * completion `jobs/portStatusPollWorker.ts` writes `assigned_number` and
     * pointedly not `assigned_number_sid` — so `mode` and the column already
     * agree. The condition is belt-and-braces for the one drift that is
     * plausible: a customer who starts in "new", is sold a number, then switches
     * to "port". That leaves a number we bought behind an un-releasable mode,
     * which costs us a monthly fee. The opposite error costs the customer their
     * phone number, so the condition errs in the direction that only costs
     * money. */
    {
      store: "twilioNumber",
      column: "assigned_number_sid",
      read: "text",
      when: { column: "mode", unless: ["port"] },
    },
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
 * 5. Redacted metadata — the rows we keep, and the personal data taken out of
 *    them.
 *
 * ── The hole this closes ──
 *
 * `audit_log` and `admin_activity_log` were in no plan at all, and neither is
 * reachable by the coverage guard: `audit_log` has no owner column (`actor_id`
 * and `entity_id` are free text) and `admin_activity_log`'s are plain
 * `integer`s named `actor_id` / `entity_id`, so neither matches OWNER_COLUMNS
 * and neither holds a foreign key. Two tables sat outside a mechanism built to
 * make it impossible for a table to sit outside it.
 *
 * What they hold is not incidental. `services/adminAgentTools.ts` writes the
 * recipient's phone number, the business name and the FULL SMS BODY into
 * `audit_log.metadata`; `services/adminTools.ts` writes the message body into
 * `admin_activity_log.metadata.args`. The inbound-SMS, voice-followup and
 * inbound-email concierges each write the third party's phone number or email
 * plus the reply text. `routes/adminImpersonateRoutes.ts` writes the account
 * holder's own email address — the very field `ANONYMISE_FIELDS` overwrites on
 * the `users` row, preserved verbatim in a row nothing touched.
 *
 * ── Redaction, not deletion, and why that is the honest answer ──
 *
 * Deleting these rows outright is the wrong instrument twice over:
 *
 *   1. It would destroy the record this deletion itself depends on. #2067
 *      writes the keys of any file it could not purge into `audit_log`,
 *      because none of our stores can be listed by prefix and we deliberately
 *      never list Twilio — without that row an orphan is unrecoverable
 *      forever. A deletion whose last act is to erase its own recovery trail
 *      would leave the customer's phone bill in a bucket AND remove the only
 *      evidence of where it is.
 *   2. It is a security audit trail. `impersonate.start` is the record that a
 *      member of staff opened this account. Erasing it on the account holder's
 *      own request removes the accountability that exists for their benefit,
 *      and an audit log that can be emptied by the party it audits is not one.
 *
 * So the row survives and the personal data inside it does not. What is kept is
 * the skeleton: who acted, what they did, to which entity, when, and the
 * opaque identifiers a support engineer needs to finish an interrupted purge.
 * What goes is the content: bodies, phone numbers, email addresses, names and
 * the actor's IP.
 *
 * Redacted fields are OVERWRITTEN with a tombstone, never dropped. A missing
 * key and an erased key look identical to a reader, and the difference matters:
 * an auditor has to be able to tell "this was erased on a deletion request"
 * from "this was never recorded". `REDACTION_TOMBSTONE` is what says so.
 *
 * ── The ordering trap, which is the whole reason this is subtle ──
 *
 * `audit_log.metadata.twilio_sid` is, for the admin-SMS paths, the ONLY pointer
 * in this database at a Twilio Message — neither `adminAgentTools` nor
 * `adminTools` writes an `sms_messages` row, they call `sendSMS` directly. That
 * Message holds the recipient's number and the body at Twilio. #2068's TWILIO
 * COVERAGE check scans column NAMES, so a SID buried inside a jsonb blob was
 * invisible to it and the Message was never erased.
 *
 * Which means the naive fix — scrub the metadata — is the #2067 defect all over
 * again: it would destroy the only pointer to data still sitting at Twilio, and
 * report a clean erasure. So `twilioColumns` is collected FIRST, inside the
 * transaction, and the artefacts go through the same purge as every other
 * Twilio artefact; only then is the blob scrubbed. `twilio_sid` itself is then
 * deliberately KEPT in the redacted row: once the Message is gone the SID is a
 * dead opaque token that identifies nobody, and if the purge FAILED it is the
 * one thing that makes a retry possible — the same argument, and the same
 * trade, that `objects_failed` rests on.
 * ──────────────────────────────────────────────────────────────────────── */

/** Written over a redacted value, so an erased field is legible as erased. */
export const REDACTION_TOMBSTONE = "[redacted — account deleted]";

/**
 * How a retained row is attributed to the account being erased.
 *
 * OR'd together: a row matched by any branch is redacted. Every branch is a
 * PRECISE attribution — the row names this user or one of their clients — not a
 * heuristic, because the same predicate also selects the Twilio artefacts that
 * are about to be deleted, and a loose match there would erase somebody else's
 * message.
 */
export type RedactionMatch =
  /** `column` holds `users.id`, as text or as an integer. */
  | { by: "user"; column: string; as: "text" | "int" }
  /** `column` -> JSON path holds a `clients.id` this user owns. */
  | { by: "clientJson"; column: string; path: string[] }
  /** `column` -> JSON path holds this account's `users.id`. */
  | { by: "userJson"; column: string; path: string[] }
  /**
   * `column` -> JSON path holds the primary key of a row in `parent`, and
   * `parent` is itself in the plan — so the account's own scope on that table
   * decides whether this row belongs to them:
   *   `<column> #>> <path> IN (SELECT <parentKey> FROM <parent> WHERE <parent scope>)`
   *
   * The JSON twin of `Scope`'s `parent` branch, and it exists for the same
   * reason: a blob can name a row by id without naming its owner.
   * `admin_ai_actions.detail.calculator_id` is the case — the bot detector
   * records a LEAD's email address beside the calculator it was submitted to,
   * and the calculator is the only thing on the row that says whose it is.
   *
   * Reads through `#>>`, so an id stored as a JSON number and one stored as a
   * JSON string both compare alike; the detectors are hand-written object
   * literals, not a schema, and both shapes occur.
   */
  | { by: "parentJson"; column: string; path: string[]; parent: string; parentKey: string }
  /** `typeColumn` = `entityType` AND `idColumn` is one of this account's ids. */
  | {
      by: "entity";
      typeColumn: string;
      idColumn: string;
      entityType: string;
      ids: "user" | "client";
      as: "text" | "int";
    };

export interface MetadataRedaction {
  table: string;
  /** Why the ROW is retained rather than deleted. Held to the same standard as `keep`. */
  reason: string;
  /** Attribution. OR'd; a table with none would redact nothing. */
  match: RedactionMatch[];
  /**
   * JSON columns scrubbed key-by-key at any depth: every key named in
   * `PII_METADATA_KEYS` is replaced by the tombstone, everything else is left
   * alone. Key-name matching rather than fixed paths, because the same field
   * appears at different depths across callers (`metadata.body` in one,
   * `metadata.args.message` in another) and a path list would silently stop
   * covering a caller that nested one level deeper.
   */
  jsonColumns: string[];
  /**
   * Plain columns overwritten wholesale. Free text cannot be scrubbed
   * selectively, so a column that interpolates personal data goes entirely.
   */
  textColumns: string[];
  /**
   * JSON columns scanned for Twilio identifiers BEFORE the scrub, so an
   * artefact whose only pointer lives in a blob is erased rather than orphaned.
   * Must be a subset of `jsonColumns` — a blob nothing scrubs cannot be hiding
   * a SID the scrub is about to destroy.
   */
  twilioColumns: string[];
}

/**
 * Key names treated as personal data wherever they appear inside a scrubbed
 * blob, at any depth.
 *
 * Derived from the actual call sites, not invented: every name here is one this
 * codebase really writes into an audit blob. `scripts/check-account-deletion-coverage.ts`
 * re-derives the set from source at CI time and fails when a new PII-shaped key
 * appears that is neither listed here nor exempted with a reason, so this list
 * cannot quietly fall behind the callers.
 */
export const PII_METADATA_KEYS: string[] = [
  // Message content — the most serious of these. The full text of an SMS, an
  // email or an AI-drafted reply, verbatim.
  "body",
  "sms_body",
  "message",
  "text",
  "content",
  "subject",
  "reply_text",
  "executor_message",
  "transcript",
  "summary",
  // Phone numbers — the recipient's, the caller's, the sender's.
  "phone",
  "phone_number",
  "resolved_phone",
  "sender_phone",
  "caller_phone",
  "recipient_phone",
  "to_number",
  "from_number",
  "number",
  // Email addresses, including the account holder's own (impersonation rows).
  "email",
  // `services/businessOperator/detectors/draftCalculators.ts` records the
  // account holder's OWN login address beside the calculator it is nagging
  // about — the very field ANONYMISE_FIELDS overwrites on the `users` row.
  "owner_email",
  "target_email",
  "sender_email",
  "caller_email",
  "recipient_email",
  "contact_email",
  "to_email",
  "from_email",
  // Names and addresses. `business_name` is here because anonymising
  // `clients.business_name` is pointless if an audit row keeps the original.
  "business_name",
  "contact_name",
  "customer_name",
  "full_name",
  "reviewer",
  "address",
  "street_address",
  "service_address",
  // Free-text the customer or their end customer typed.
  "note",
  "notes",
  "revision_notes",
  "answers",
  // The actor's own network identity when the actor is the account holder.
  "ip",
  "ip_address",
  "user_agent",
];

export const METADATA_REDACTIONS: MetadataRedaction[] = [
  {
    table: "audit_log",
    reason:
      "Append-only security and operations trail. It is also where a deletion " +
      "records the files and Twilio artefacts it could NOT purge — without those " +
      "keys an orphan is unrecoverable, because no store here can be listed by " +
      "prefix. The row is kept for that; everything in it that identifies a " +
      "person is overwritten.",
    match: [
      // The account holder's own actions. `actor_id` is text holding the
      // stringified users.id.
      { by: "user", column: "actor_id", as: "text" },
      // Rows about one of this user's businesses — the shape every admin/AI
      // tool and every concierge writes.
      { by: "clientJson", column: "metadata", path: ["client_id"] },
      // `impersonate.start` records the target user, not the client, and
      // carries their email address.
      {
        by: "entity",
        typeColumn: "entity_type",
        idColumn: "entity_id",
        entityType: "user",
        ids: "user",
        as: "text",
      },
    ],
    jsonColumns: ["metadata", "before", "after", "diff"],
    // `ip` and `user_agent` are the ACTOR's. On a row matched by `actor_id`
    // that actor is the account holder, and their IP is personal data in its
    // own right (GDPR Art. 4(1)); on a row matched any other way the actor is
    // staff and this erases a little of our own trail, which is the acceptable
    // side of the trade.
    textColumns: ["ip", "user_agent"],
    twilioColumns: ["metadata"],
  },
  {
    table: "admin_activity_log",
    reason:
      "Record of what staff and the AI copilot did to this account. Retained for " +
      "the same accountability reason as the impersonation log: an audit trail " +
      "the audited party can empty is not an audit trail. Personal data inside " +
      "it is overwritten.",
    match: [
      // entity_id is an integer here, and the client rows are what carry the
      // customer's data.
      {
        by: "entity",
        typeColumn: "entity_type",
        idColumn: "entity_id",
        entityType: "client",
        ids: "client",
        as: "int",
      },
      // `services/adminTools.ts` nests the tool arguments, and the client id
      // with them.
      { by: "clientJson", column: "metadata", path: ["args", "client_id"] },
      { by: "clientJson", column: "metadata", path: ["client_id"] },
    ],
    jsonColumns: ["metadata"],
    // `summary` is free text that interpolates the business name
    // (`AI sent a support SMS to ${client.business_name}`), so it cannot be
    // scrubbed selectively. `actor_name` is deliberately NOT here — that is the
    // staff member or agent who acted, which is the part being retained.
    textColumns: ["summary"],
    twilioColumns: ["metadata"],
  },
  {
    table: "system_alerts",
    reason:
      "Operational alerting trail, and the record of which operator acknowledged " +
      "an incident and when (`acknowledged_by` / `acknowledged_at`). Deleting the " +
      "row would erase an incident from our own reliability history on the say-so " +
      "of the customer it happened to; the incident is kept and everything in it " +
      "that identifies a person is overwritten.",
    match: [
      /* Both spellings, because there is no schema inside a jsonb column and the
       * callers disagree: `services/reputation/reputationAlerts.ts` writes
       * `clientId`, `services/sitelaunchPaidOrderNotify.ts` and
       * `services/socialSync/connectionLifecycle.ts` write `client_id`. Matching
       * only one of them would leave the other caller's alerts — which carry the
       * business name in `title` AND in `details` — untouched. */
      { by: "clientJson", column: "metadata", path: ["client_id"] },
      { by: "clientJson", column: "metadata", path: ["clientId"] },
      // `routes/stripeBillingRoutes.ts` forwards the CRM client id off the
      // Stripe Checkout session under its own name.
      { by: "clientJson", column: "metadata", path: ["crm_client_id"] },
    ],
    jsonColumns: ["metadata"],
    /* Both are free text that interpolates personal data, so neither can be
     * scrubbed selectively:
     *   • `title` — `Payment at risk: ${client.business_name}` (dunningService),
     *     `Ticket #12 — ${ticket.subject}` (adminAgentTools; the subject is what
     *     the customer typed).
     *   • `details` — `Client: ${businessName} (#${id})`, and
     *     `Contact: ${contact}` on a SiteLaunch order.
     * `title` is NOT NULL and the tombstone is a non-null string, so the
     * overwrite is legal. It costs the 1-hour `category::title` dedupe window
     * nothing: that window only ever compares alerts from the last hour, and a
     * scrubbed row belongs to an account that can raise no further alerts. */
    textColumns: ["title", "details"],
    /* No caller writes a Twilio SID into an alert today. Declared anyway so that
     * the first one to do so is PURGED rather than orphaned — the blob is
     * scrubbed, and a SID scrubbed out of the only row naming it is the #2067
     * defect rebuilt. Costs nothing on rows that hold none. */
    twilioColumns: ["metadata"],
  },
  {
    table: "admin_ai_actions",
    reason:
      "Record of what the autonomous Business Operator AI proposed about this " +
      "account, whether a human approved it, and which operator did. It is the " +
      "accountability trail for an agent that can act on customer data — the same " +
      "argument as the impersonation log, and an audit trail the audited party " +
      "can empty is not an audit trail. The reasoning survives; the personal data " +
      "it reasoned about does not.",
    match: [
      // `detectors/draftCalculators.ts` — the only detector that names the user
      // directly, and the one that records their own login address.
      { by: "userJson", column: "detail", path: ["user_id"] },
      // `detectors/stuckSubmissions.ts`, `pastDueSubscriptions.ts`,
      // `unassignedWebFix.ts` — all keyed on the business.
      { by: "clientJson", column: "detail", path: ["client_id"] },
      /* `detectors/botSubmissions.ts` (kind: "email_pattern") records a LEAD's
       * email address — a third party whose data the account holder collected —
       * and names no user or client. The calculator it was submitted to is the
       * only thing on the row that says whose lead it was, so the attribution
       * runs through `calculators`, whose own scope decides. */
      {
        by: "parentJson",
        column: "detail",
        path: ["calculator_id"],
        parent: "calculators",
        parentKey: "id",
      },
    ],
    /* `proposed_action` is Claude's own JSON (`{ type, ...args }`) built FROM
     * `detail`, so it restates whatever `detail` held. Scrubbing one and not the
     * other would leave the copy. */
    jsonColumns: ["detail", "proposed_action"],
    /* `summary` interpolates the address or the business name verbatim
     * (`Lead #9 flagged as bot — email pattern (dana@example.test).`) and
     * `ai_reasoning` is free text written ABOUT that summary, so it restates it.
     * `playbook`, `signal_id`, `status` and `severity` are opaque identifiers and
     * stay — they are the skeleton of what the agent did.
     *
     * `signal_id` is deliberately NOT scrubbed. On an attributable row it is an
     * opaque key (`submission_42`); the one shape that embeds personal data is
     * the bot detector's `ip_<address>_24h`, and those rows name no account at
     * all, so no redaction predicate reaches them. They are bounded by
     * RETENTION_SWEEPS instead — see the note there. */
    textColumns: ["summary", "ai_reasoning"],
    twilioColumns: ["detail"],
  },
];

/* ──────────────────────────────────────────────────────────────────────────
 * 5b. Bounded retention — the personal data no account deletion can reach.
 *
 * ── Why this section exists, and why it is not more plan entries ──
 *
 * The two sections above can only act on rows that name an account. Some of the
 * personal data this product holds genuinely names none, and the honest answer
 * is to say so and put a clock on it rather than invent an owner:
 *
 *   • A member of the public leaves a Google review on WEFIXTRADES' OWN
 *     listing. Their display name and the text they wrote land in
 *     `gbp_automation_log.payload`. They are not our customer, they have no
 *     account, and no customer's deletion request has any claim on their words.
 *   • Somebody texts HELP to the shared WeFixTrades brand line. Their phone
 *     number is theirs, not any tenant's.
 *   • The bot detector records the IP address behind a burst of lead
 *     submissions. It spans whatever calculators the burst hit; there is no
 *     single owner, and inventing one would be a guess written into a table.
 *
 * Attaching an owner column to any of these would be a lie, and deleting them
 * on an unrelated customer's request would destroy somebody else's data. What
 * was actually wrong was that they were kept FOREVER: unbounded retention of
 * personal data with no stated basis is its own defect, and it is the one this
 * fixes.
 *
 * A sweep is not a substitute for reachability. Anything that CAN be attributed
 * is attributed — that is why every entry below is either a table no account
 * can own, or is narrowed by `unattributedWhen` to exactly the rows the
 * deletion path provably cannot reach.
 *
 * Run weekly by `server/jobs/retentionWorker.ts`, which is where the two
 * pre-existing policies (integration_error_logs, processed_stripe_events)
 * already live.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * One probe for "this row names nobody". A row is swept only when EVERY probe
 * on its entry reads NULL — so a row that names an account by ANY route is left
 * for the deletion path, never aged out from under it.
 */
export type AttributionProbe =
  /** A plain column that would hold an owner id. */
  | { column: string }
  /** A JSON path inside a blob that would hold an owner id. */
  | { column: string; path: string[] };

export interface RetentionSweep {
  table: string;
  /** Timestamp column the row's age is measured from. */
  ageColumn: string;
  /** Rows older than this are removed. */
  days: number;
  /** Why this table cannot be reached by a deletion, and why this bound. */
  reason: string;
  /**
   * Narrows the sweep to rows that name no account. Omitted = no row in this
   * table can name one, so every aged row is swept.
   */
  unattributedWhen?: AttributionProbe[];
}

export const RETENTION_SWEEPS: RetentionSweep[] = [
  {
    table: "gbp_automation_log",
    ageColumn: "created_at",
    days: 90,
    reason:
      "Operational log for the crons that manage WEFIXTRADES' OWN Google " +
      "Business Profile — not a customer's. `payload` carries the display name " +
      "and up to 280 characters of the review text of members of the public who " +
      "reviewed us, and `message` interpolates the same name. They hold no " +
      "account, so no deletion request reaches them and attaching an owner " +
      "column would be false. The log's operational value is the last few " +
      "weeks of cron behaviour; 90 days is well past the point anyone reads it, " +
      "and the durable copy of a review is Google's, not ours.",
  },
  {
    table: "audit_reports",
    ageColumn: "created_at",
    days: 365,
    reason:
      "A snapshot of PUBLIC Google Places data about whichever business a " +
      "visitor typed into the free audit — competitors, keywords, opening " +
      "hours, and up to ~40 verbatim third-party review texts under " +
      "`audit_data.reviewIntel.reviewTexts`. It holds no contact details of the " +
      "person who requested it (those are in `audit_submissions`, which the plan " +
      "DELETES by email) and no column that names an account: reports are " +
      "generated for prospects and competitors as readily as for customers, so " +
      "attributing one to the requester's account would be a guess that " +
      "destroys reports about other businesses. It is also a shareable artefact " +
      "at a stable public URL that our own follow-up emails link to, which is " +
      "what sets the bound: one year outlives the longest follow-up sequence " +
      "and every reasonable revisit.",
  },
  {
    table: "marketing_chat_sessions",
    ageColumn: "last_active_at",
    days: 90,
    reason:
      "Anonymous transcripts from the website chat widget. A session where the " +
      "visitor DID give an address is deleted by email through the plan; this " +
      "sweep covers only the ones where they never did. Those name nobody — the " +
      "`session_id` is a uuid the browser minted and is deliberately never tied " +
      "to an auth session — so there is no request that could reach them, yet " +
      "`messages_json` is a verbatim conversation and `user_agent` sits beside " +
      "it. 90 days is past any sales follow-up window.",
    unattributedWhen: [{ column: "lead_email" }],
  },
  {
    table: "admin_ai_actions",
    ageColumn: "created_at",
    days: 180,
    reason:
      "The Business Operator AI's bot detector records `ip_address` — personal " +
      "data in its own right (GDPR Art. 4(1)) — for a burst of lead submissions " +
      "spanning whatever calculators it hit, and embeds it in `signal_id` too. " +
      "No single account owns it. Rows that DO name a user, a client or a " +
      "calculator are excluded here and scrubbed by METADATA_REDACTIONS " +
      "instead, so this never ages out a row the deletion path can reach. 180 " +
      "days keeps two quarters of agent-accountability history.",
    unattributedWhen: [
      { column: "detail", path: ["user_id"] },
      { column: "detail", path: ["client_id"] },
      { column: "detail", path: ["calculator_id"] },
    ],
  },
  {
    table: "sms_messages",
    ageColumn: "created_at",
    days: 365,
    reason:
      "Inbound HELP/INFO keywords that arrived on the SHARED WeFixTrades brand " +
      "line rather than a tenant's own number (`routes/twilioRoutes.ts`). The " +
      "sender is a member of the public and the number is theirs, not any " +
      "customer's, so no tenant deletion has a claim — a HELP that arrived on a " +
      "tenant's number now carries `scope_client_id` and IS deleted with that " +
      "account. What keeps these at all is the carrier obligation to evidence " +
      "that an A2P campaign answers HELP; a year covers any campaign audit, and " +
      "the opt-out evidence carriers actually ask for lives in `sms_opt_outs`, " +
      "which the plan retains outright on that basis.",
    unattributedWhen: [
      { column: "scope_client_id" },
      { column: "lead_id" },
      { column: "calculator_id" },
    ],
  },
];

/** The retention disclosure, for the privacy page and the coverage guard. */
export function retentionSweepFor(table: string): RetentionSweep | undefined {
  return RETENTION_SWEEPS.find((r) => r.table === table);
}

export function redactionFor(table: string): MetadataRedaction | undefined {
  return METADATA_REDACTIONS.find((r) => r.table === table);
}

/** The redaction disclosure, for the confirmation screen and the receipt. */
export function redactedTables(): { table: string; reason: string }[] {
  return METADATA_REDACTIONS.map((r) => ({ table: r.table, reason: r.reason }));
}

/* ──────────────────────────────────────────────────────────────────────────
 * 6. The assembled plan.
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
  ...DELETE_BY_EMAIL.map(
    ([table, column]): TablePlan => ({
      table,
      action: "delete",
      scope: { by: "email", columns: [column] },
    }),
  ),
  ...DELETE_ANY_OF,
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

/**
 * Every column a scope names, flattened through `anyOf`. The guard checks these
 * exist on the table and that a scope names at least one — an `anyOf` whose
 * branches were all empty would otherwise read as "scoped" while constraining
 * nothing.
 */
export function scopeColumns(scope: Scope): string[] {
  return scope.by === "anyOf" ? scope.scopes.flatMap(scopeColumns) : scope.columns;
}

/** Every `parent` branch a scope reaches, flattened through `anyOf`. */
export function scopeParents(
  scope: Scope,
): Array<{ parent: string; parentKey: string; columns: string[] }> {
  if (scope.by === "anyOf") return scope.scopes.flatMap(scopeParents);
  if (scope.by !== "parent") return [];
  return [{ parent: scope.parent, parentKey: scope.parentKey, columns: scope.columns }];
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
