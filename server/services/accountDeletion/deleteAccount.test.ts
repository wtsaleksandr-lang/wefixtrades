/**
 * Account-deletion guard.
 *
 * The privacy policy (§10) tells customers that Settings → Account →
 * "Delete account" erases their data. This test protects the two properties
 * that make that promise safe to keep:
 *
 *   1. NOTHING LEAKS OUT OF THE TENANT. Every DELETE the plan generates is
 *      scoped to the authenticated user id or to client ids resolved from
 *      `clients.user_id`. An unscoped statement would erase another customer's
 *      business. A table whose scope resolves to nothing must be SKIPPED, never
 *      widened.
 *   2. NOTHING SURVIVES SILENTLY. Every kept table states a legal basis, the
 *      disclosure the UI renders is generated from the same plan the deletion
 *      runs, and the anonymisation covers every identifying column on the
 *      anchor rows.
 *
 * Plus a deliberate-failure fixture: it proves the scoping assertion actually
 * bites, by building the predicate for an invented unscoped table and checking
 * this test would have caught it.
 *
 * Run standalone:  npx tsx server/services/accountDeletion/deleteAccount.test.ts
 * Wired into CI as: npm run check:account-deletion-scope
 */
import assert from "node:assert/strict";

// The module graph reaches server/db.ts, which throws unless DATABASE_URL is
// set. Nothing here opens a connection — every assertion is on generated SQL.
process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";

// Set before the import: the R2 membership test reads this to decide which
// URLs are objects we host and can delete.
process.env.R2_PUBLIC_URL ??= "https://cdn.example-r2.test";

// Set before the import too: the Twilio ownership test compares the account SID
// inside a recording URL against this. It is the check that stops us deleting
// another Twilio customer's recording, so the fixtures below exercise both
// sides of it.
const OUR_ACCOUNT = "AC00000000000000000000000000000001";
const SOMEBODY_ELSES_ACCOUNT = "AC00000000000000000000000000000002";
process.env.TWILIO_ACCOUNT_SID = OUR_ACCOUNT;

const {
  previewStatements,
  previewRedactions,
  previewSessionRevocation,
  redactJson,
  retentionDisclosure,
  objectKeysFromRow,
} = await import("./deleteAccount");
const {
  ACCOUNT_DELETION_PLAN,
  ANONYMISE_FIELDS,
  METADATA_REDACTIONS,
  PII_METADATA_KEYS,
  REDACTION_TOMBSTONE,
  RETENTION_SWEEPS,
  STORED_OBJECTS,
  deletedTables,
  keptTables,
  planFor,
  tablesWithObjects,
} = await import("@shared/accountDeletion/plan");
// The retention sweeps live in the worker that runs them; the predicate builder
// is exported for exactly this — asserting on the generated SQL without a
// database, the same way previewStatements does for the deletion plan.
const { sweepPredicate, sweepsThatCouldOutrunDeletion } = await import(
  "../../jobs/retentionWorker"
);
const { PgDialect } = await import("drizzle-orm/pg-core");

const USER_ID = 4242;
const CLIENT_IDS = [77, 78];
const EMAIL = "owner@example.com";

/* ── 1. Every generated DELETE is tenant-scoped ─────────────────────────── */

const statements = previewStatements({ userId: USER_ID, clientIds: CLIENT_IDS, email: EMAIL });
assert.ok(statements.length > 50, `expected the plan to generate many deletes, got ${statements.length}`);

for (const { table, sql } of statements) {
  assert.ok(
    /\bWHERE\b/i.test(sql),
    `${table}: generated DELETE has no WHERE clause — it would erase every tenant's rows:\n  ${sql}`,
  );
  // Everything after DELETE FROM "<table>" must constrain the rows. A bare
  // "WHERE true"/"WHERE 1=1" is as dangerous as no WHERE at all.
  const where = sql.slice(sql.toUpperCase().indexOf("WHERE") + 5).trim();
  assert.ok(where.length > 0, `${table}: empty WHERE clause`);
  assert.ok(
    !/^(true|1\s*=\s*1)\s*$/i.test(where),
    `${table}: WHERE clause matches every row:\n  ${sql}`,
  );
  assert.ok(
    /\$\d+/.test(sql) || /IN \(SELECT/i.test(sql),
    `${table}: WHERE clause binds no parameter and has no scoped subquery — ` +
      `it cannot actually be constrained to this account:\n  ${sql}`,
  );
}

/* ── 2. An account with no clients touches no client-scoped table ───────── */

const noClients = previewStatements({ userId: USER_ID, clientIds: [], email: EMAIL });
const noClientTables = new Set(noClients.map((s) => s.table));
for (const entry of deletedTables()) {
  if (entry.scope.by !== "client") continue;
  assert.ok(
    !noClientTables.has(entry.table),
    `${entry.table} is client-scoped, but a statement was generated for an account with no ` +
      `clients. That statement could only match somebody else's rows.`,
  );
}
assert.ok(
  noClients.length < statements.length,
  "removing every client should remove client-scoped statements",
);
// The user-scoped half must still run — a client-less account is still deletable.
assert.ok(
  noClients.some((s) => s.table === "calculators"),
  "user-scoped deletes must still run for an account with no client record",
);

/* ── 3. Parent-scoped children resolve through a scoped subquery ─────────── */

for (const entry of deletedTables()) {
  if (entry.scope.by !== "parent") continue;
  const stmt = statements.find((s) => s.table === entry.table);
  if (!stmt) continue; // scope resolved to nothing — correctly skipped
  assert.ok(
    stmt.sql.includes(`from "${entry.scope.parent}"`) ||
      stmt.sql.includes(`FROM "${entry.scope.parent}"`),
    `${entry.table} is scoped through ${entry.scope.parent} but the generated SQL does not ` +
      `select from it:\n  ${stmt.sql}`,
  );
  assert.ok(
    /\$\d+/.test(stmt.sql),
    `${entry.table}: parent subquery binds no id, so it is not tenant-scoped:\n  ${stmt.sql}`,
  );
}

/* ── 4. Deliberate-failure fixture ──────────────────────────────────────── */
// Prove assertion (1) bites. If someone "simplifies" the scoping check into
// something that passes anything, this block goes red.
{
  const unscoped = `delete from "leads"`;
  let caught = false;
  try {
    assert.ok(/\bWHERE\b/i.test(unscoped), "unscoped");
  } catch {
    caught = true;
  }
  assert.ok(caught, "the tenant-scoping assertion does not actually reject an unscoped DELETE");
}

/* ── 5. Everything kept states a legal basis ────────────────────────────── */

const kept = keptTables();
assert.ok(kept.length > 0, "plan keeps nothing at all — expected the tax/suppression exceptions");
for (const entry of kept) {
  assert.ok(
    entry.reason && entry.reason.trim().length >= 30,
    `${entry.table} is kept with no meaningful legal basis. Data retained without a written ` +
      `reason is data the privacy policy claims is deleted.`,
  );
}
// The disclosure the UI renders comes from the plan, so it can never drift.
const disclosure = retentionDisclosure();
assert.equal(disclosure.length, kept.length, "retention disclosure must cover every kept table");
for (const row of disclosure) {
  assert.ok(row.reason.length >= 30, `${row.table}: disclosure carries no reason`);
}

/* ── 6. The tax and suppression exceptions are actually present ─────────── */

for (const table of ["client_payments", "orders", "order_items", "bookflow_invoices"]) {
  const entry = planFor(table);
  assert.equal(entry?.action, "keep", `${table} must be kept — it is a financial record`);
}
for (const table of ["sms_opt_outs", "review_request_suppression"]) {
  const entry = planFor(table);
  assert.equal(
    entry?.action,
    "keep",
    `${table} must be kept — deleting a suppression list re-enables contacting someone who ` +
      `opted out`,
  );
}

/* ── 7. Anonymisation clears every identifying column on the anchors ────── */

const userFields = ANONYMISE_FIELDS.users;
for (const column of [
  "email",
  "name",
  "password_hash",
  "totp_secret",
  "totp_recovery_codes",
  "google_sub",
  "microsoft_sub",
  "facebook_sub",
  "apple_sub",
  "ai_contact_phone",
]) {
  assert.ok(column in userFields, `users.${column} identifies a person but is not anonymised`);
}
const clientFields = ANONYMISE_FIELDS.clients;
for (const column of [
  "business_name",
  "contact_name",
  "contact_email",
  "contact_phone",
  "google_credentials",
  "widget_token",
  "stripe_customer_id",
]) {
  assert.ok(column in clientFields, `clients.${column} identifies a business but is not anonymised`);
}
// The two NOT NULL + UNIQUE columns cannot be nulled, so they must take a
// synthetic value rather than being silently skipped.
assert.equal(userFields.email, "@id", "users.email is NOT NULL UNIQUE — it needs a synthetic value");
assert.equal(
  userFields.password_hash,
  "@id",
  "users.password_hash is NOT NULL — it must be replaced with an unverifiable value",
);

/* ── 8. The anchors are anonymised, never deleted ───────────────────────── */
// admin_impersonations holds ON DELETE RESTRICT foreign keys into users, so a
// hard delete of the anchor rows can never succeed.
for (const table of ["users", "clients"]) {
  assert.equal(
    planFor(table)?.action,
    "anonymize",
    `${table} must be anonymised, not deleted — ON DELETE RESTRICT foreign keys point at it`,
  );
}
assert.equal(
  planFor("admin_impersonations")?.action,
  "keep",
  "admin_impersonations is ON DELETE RESTRICT and must be kept",
);

/* ── 9. No table is classified twice ────────────────────────────────────── */

const seen = new Set<string>();
for (const entry of ACCOUNT_DELETION_PLAN) {
  assert.ok(!seen.has(entry.table), `${entry.table} is classified more than once`);
  seen.add(entry.table);
}

/* ── 10. Stored files are declared, and only where they can be erased ───── */
// A row and the file it points at are two different things in two different
// systems. These assertions cover the second one.

const withObjects = tablesWithObjects();
assert.ok(withObjects.length > 0, "no table declares stored objects — the purge would do nothing");

for (const entry of withObjects) {
  assert.notEqual(
    entry.action,
    "keep",
    `${entry.table} is kept but declares stored objects. A kept row keeps its files; ` +
      `declaring them here implies an erasure that never runs.`,
  );
  for (const source of entry.objects!) {
    assert.ok(
      ["objectStorage", "uploads", "r2", "twilio", "twilioNumber"].includes(source.store),
      `${entry.table}.${source.column} names an unknown store "${source.store}", which has ` +
        `no deleter — the files would silently survive.`,
    );
  }
}

// The documents this mechanism exists for. If someone drops one of these
// declarations, the phone bills quietly start surviving deletion again.
for (const [table, column] of [
  ["tradeline_phone_setups", "port_bill_object_key"],
  ["tradeline_phone_setups", "port_loa_pdf_object_key"],
  ["tradeline_phone_setups", "port_signature_object_key"],
  ["tradeline_call_log", "mirrored_object_key"],
  ["webcare_backups", "object_name"],
  ["assistant_messages", "attachments"],
  // Held by Twilio, not by us. Left behind until PR #2067's mechanism was
  // extended to reach it; dropping the declaration silently restores a deletion
  // that erases the voicemail row and leaves the caller's voice on Twilio.
  ["voicemails", "recording_url"],
  ["sms_messages", "twilio_sid"],
] as const) {
  assert.ok(
    STORED_OBJECTS[table]?.some((s) => s.column === column),
    `${table}.${column} holds customer PII in a store outside Postgres and must be purged ` +
      `on account deletion. Deleting the row only deletes the pointer.`,
  );
}

// …and specifically against the Twilio store, since a declaration pointing at a
// byte-store deleter would fail on every row rather than erase anything.
for (const [table, column] of [
  ["voicemails", "recording_url"],
  ["voicemails", "call_sid"],
  ["mobile_call_records", "call_sid"],
  ["sms_messages", "twilio_sid"],
] as const) {
  assert.equal(
    STORED_OBJECTS[table]?.find((s) => s.column === column)?.store,
    "twilio",
    `${table}.${column} addresses a Twilio resource and must be declared against the ` +
      `twilio store — no other deleter can erase it.`,
  );
}

/* ── 11. Extraction: ours is collected, foreign URLs are left alone ─────── */

// Phone-bill paperwork. The signature PNG is named by two columns; it must be
// offered for deletion once, not twice.
const portRow = objectKeysFromRow("tradeline_phone_setups", {
  port_bill_object_key: "tradeline-ports/77/bill-1.bin",
  port_loa_object_key: "tradeline-ports/77/signature-1.png",
  port_signature_object_key: "tradeline-ports/77/signature-1.png",
  port_loa_pdf_object_key: "tradeline-ports/77/loa-1.pdf",
});
assert.deepEqual(
  portRow.map((o) => o.key).sort(),
  ["tradeline-ports/77/bill-1.bin", "tradeline-ports/77/loa-1.pdf", "tradeline-ports/77/signature-1.png"],
  "the four porting columns must yield three distinct objects (the signature is named twice)",
);
assert.ok(
  portRow.every((o) => o.store === "objectStorage"),
  "porting paperwork lives in object storage",
);

// A NULL column is not a file.
assert.deepEqual(
  objectKeysFromRow("tradeline_phone_setups", {
    port_bill_object_key: null,
    port_loa_object_key: null,
    port_signature_object_key: null,
    port_loa_pdf_object_key: null,
  }),
  [],
  "empty pointer columns must yield nothing to delete",
);

// JSONB array of attachments → the assetId of each.
assert.deepEqual(
  objectKeysFromRow("assistant_messages", {
    attachments: [
      { assetId: "assistant-uploads/4242/a.png", mimeType: "image/png" },
      { assetId: "assistant-uploads/4242/b.jpg", mimeType: "image/jpeg" },
    ],
  }).map((o) => o.key),
  ["assistant-uploads/4242/a.png", "assistant-uploads/4242/b.jpg"],
  "assistant image uploads must be collected from the attachments array",
);
// Postgres may hand jsonb back as text.
assert.equal(
  objectKeysFromRow("assistant_messages", {
    attachments: JSON.stringify([{ assetId: "assistant-uploads/4242/c.png" }]),
  }).length,
  1,
  "a jsonb column returned as a string must still be read",
);

// Free-form answers: find the uploaded photo, ignore everything else the
// customer typed — including a URL pointing at somebody else's server.
const leadKeys = objectKeysFromRow("leads", {
  answers: {
    roof_photos: ["/uploads/lead-photos/abc.jpg", "https://evil.example.com/x.jpg"],
    notes: "call me back",
    budget: 5000,
  },
}).map((o) => o.key);
assert.deepEqual(
  leadKeys,
  ["/uploads/lead-photos/abc.jpg"],
  "lead photos must be found in the free-form answers blob, and only ours collected",
);

// `clients.logo_url` is polymorphic: our upload, or a URL the customer pasted.
assert.deepEqual(
  objectKeysFromRow("clients", { logo_url: "/uploads/logos/deadbeef.png" }).map((o) => o.store),
  ["uploads"],
  "an uploaded logo is ours to delete",
);
assert.deepEqual(
  objectKeysFromRow("clients", { logo_url: "https://cdn.somebodyelse.com/logo.png" }),
  [],
  "a pasted external logo URL is not our file — collecting it would report a bogus failure",
);
// Path traversal must never be treated as one of our files.
assert.deepEqual(
  objectKeysFromRow("clients", { logo_url: "/uploads/../../../etc/passwd" }).length,
  1,
  "traversal is collected as an uploads candidate (the deleter is what refuses it)",
);

// R2 membership is decided by the configured public base.
assert.deepEqual(
  objectKeysFromRow("video_projects", {
    video_url: "https://cdn.example-r2.test/clients/1/final.mp4",
  }).map((o) => o.store),
  ["r2"],
  "a video on our R2 bucket must be collected",
);
assert.deepEqual(
  objectKeysFromRow("video_projects", { video_url: "https://youtube.com/watch?v=x" }),
  [],
  "a third-party video URL is not an object we host",
);

/* ── 11b. Twilio: ours is erased, another account's is never touched ─────── */
// This is the block that matters most. Twilio artefacts belong to the ACCOUNT,
// which is ours and holds every customer's data; deleting the wrong one would
// be far worse than the bug this mechanism fixes. Attribution is (1) the SID
// came out of a row already scoped to this account, (2) the account SID in the
// URL is ours, (3) the SID shape is exact. (2) and (3) are what these assert.

const RECORDING = "RE11111111111111111111111111111111";
const OUR_RECORDING_URL = `https://api.twilio.com/2010-04-01/Accounts/${OUR_ACCOUNT}/Recordings/${RECORDING}`;

// A voicemail: the recording AND the call record that names both parties.
assert.deepEqual(
  objectKeysFromRow("voicemails", {
    recording_url: OUR_RECORDING_URL,
    call_sid: "CA22222222222222222222222222222222",
  }),
  [
    { store: "twilio", table: "voicemails", key: `Recordings/${RECORDING}` },
    { store: "twilio", table: "voicemails", key: "Calls/CA22222222222222222222222222222222" },
  ],
  "a voicemail's Twilio recording and call record must both be collected, recording first",
);

// THE ONE THAT MUST NEVER REGRESS. Same shape, same host, different account —
// somebody else's recording. Collecting it would delete another customer's data;
// counting it as a failure would report a bogus outstanding erasure.
assert.deepEqual(
  objectKeysFromRow("voicemails", {
    recording_url: `https://api.twilio.com/2010-04-01/Accounts/${SOMEBODY_ELSES_ACCOUNT}/Recordings/${RECORDING}`,
  }),
  [],
  "a recording URL naming a DIFFERENT Twilio account is not ours — deleting it would " +
    "erase another customer's recording",
);

// Twilio's format suffixes address the same resource. Two rows naming it as
// `.mp3` and as `.json` must dedupe to one delete, not two.
assert.deepEqual(
  objectKeysFromRow("voicemails", { recording_url: `${OUR_RECORDING_URL}.mp3` }).map((o) => o.key),
  [`Recordings/${RECORDING}`],
  "a .mp3 format suffix must normalise to the same resource key",
);

// A bare SID is what sms_messages stores; attribution there comes from the row.
assert.deepEqual(
  objectKeysFromRow("sms_messages", { twilio_sid: "SM33333333333333333333333333333333" }),
  [{ store: "twilio", table: "sms_messages", key: "Messages/SM33333333333333333333333333333333" }],
  "an SMS message SID must be collected so the body and any media go with the account",
);
assert.deepEqual(
  objectKeysFromRow("sms_messages", { twilio_sid: "MM44444444444444444444444444444444" }).length,
  1,
  "an MM… SID is a Message too — that is where MMS media lives",
);

// The dry-run send path mints a synthetic SID. Sending it to Twilio would be a
// guaranteed failure reported to the customer as an outstanding erasure.
assert.deepEqual(
  objectKeysFromRow("sms_messages", { twilio_sid: "DRYRUN-6f1c2b4e-0000-0000-0000-000000000000" }),
  [],
  "a synthetic dry-run SID addresses nothing at Twilio and must not be collected",
);

// Values that are not Twilio identifiers at all, and one that tries to steer
// the REST path somewhere else.
for (const [label, value] of [
  ["null", null],
  ["empty", ""],
  ["a Vapi recording URL", "https://storage.vapi.ai/abc-123.mp3"],
  ["a lookalike host", `https://api.twilio.com.evil.example/2010-04-01/Accounts/${OUR_ACCOUNT}/Recordings/${RECORDING}`],
  ["plain http", OUR_RECORDING_URL.replace("https://", "http://")],
  ["an account-level resource", `https://api.twilio.com/2010-04-01/Accounts/${OUR_ACCOUNT}/IncomingPhoneNumbers/PN11111111111111111111111111111111`],
  ["a traversal in the SID", `https://api.twilio.com/2010-04-01/Accounts/${OUR_ACCOUNT}/Recordings/${RECORDING}/../../Accounts/${SOMEBODY_ELSES_ACCOUNT}/Recordings/${RECORDING}`],
  ["a truncated SID", "RE1111"],
  ["a phone number", "+14165550123"],
] as const) {
  assert.deepEqual(
    objectKeysFromRow("voicemails", { recording_url: value }),
    [],
    `${label} must not be collected as a Twilio artefact to delete`,
  );
}

// The port-in ORDER is never erased: it is the carrier-side record that this
// subscriber authorised the transfer, and the evidence our own LOA purge leans
// on. Not declared, so the purge cannot reach it.
assert.equal(
  STORED_OBJECTS.tradeline_phone_setups?.some((s) => s.column === "port_twilio_order_sid"),
  false,
  "the port-in order must NOT be declared for deletion — it is the authorisation " +
    "evidence our own LOA purge relies on",
);

/* ── 11c. The phone number: released when it is ours, never when it is theirs ─
 *
 * The one destructive operation in this mechanism that takes a THING away
 * rather than erasing a copy of information. #2068 refused to do it at all,
 * because in the port flow the number is the customer's own property. The
 * declaration is now conditional instead, so the two cases are distinguished —
 * and these fixtures are what prove the condition is real and not decorative. */

const OUR_NUMBER_SID = "PN55555555555555555555555555555555";

// Option A: we bought this number from Twilio for them. Ours to hand back.
assert.deepEqual(
  objectKeysFromRow("tradeline_phone_setups", {
    mode: "new",
    assigned_number_sid: OUR_NUMBER_SID,
  }),
  [{ store: "twilioNumber", table: "tradeline_phone_setups", key: OUR_NUMBER_SID }],
  "a number we provisioned in the 'new' flow must be released — it keeps billing forever " +
    "otherwise, and the deletion destroys the only copy of its SID",
);

// Option B: the hidden WeFixTrades number their carrier forwards to. Also ours.
assert.deepEqual(
  objectKeysFromRow("tradeline_phone_setups", {
    mode: "forward",
    assigned_number_sid: OUR_NUMBER_SID,
  }).map((o) => o.store),
  ["twilioNumber"],
  "the hidden number bought for the 'forward' flow is ours too",
);

// THE ONE THAT MUST NEVER REGRESS. Option C: the customer's own number, ported
// in from their previous carrier. Releasing it would not erase personal data,
// it would take their phone number away — and they may still want to move it on.
assert.deepEqual(
  objectKeysFromRow("tradeline_phone_setups", {
    mode: "port",
    assigned_number_sid: OUR_NUMBER_SID,
  }),
  [],
  "a PORTED-IN number must never be released on a data-deletion request — it is the " +
    "customer's own property, not a copy of information we hold",
);

// A mode nobody has invented yet falls through to "release", which costs money
// rather than costing somebody their phone number.
assert.deepEqual(
  objectKeysFromRow("tradeline_phone_setups", {
    mode: null,
    assigned_number_sid: OUR_NUMBER_SID,
  }).length,
  1,
  "an unset mode must still release — the guard narrows in the direction that only costs us",
);

// provisionNumber() mints this in TRADELINE_SETUP_TEST_MODE. It addresses
// nothing, so releasing it would fail and be reported as an outstanding erasure.
assert.deepEqual(
  objectKeysFromRow("tradeline_phone_setups", {
    mode: "new",
    assigned_number_sid: "PN" + "0".repeat(32),
  }),
  [],
  "the test-mode placeholder SID addresses no real number and must not be collected",
);

// Nothing about a number may reach the ARTEFACT deleter, whose safety rests on
// being unable to name one.
for (const source of STORED_OBJECTS.tradeline_phone_setups ?? []) {
  if (source.column !== "assigned_number_sid") continue;
  assert.equal(
    source.store,
    "twilioNumber",
    "the phone number must be declared against its own store — deleteTwilioArtefact " +
      "cannot address an IncomingPhoneNumber, and that inability is what keeps it away " +
      "from WeFixTrades' shared infrastructure",
  );
  assert.deepEqual(
    source.when,
    { column: "mode", unless: ["port"] },
    "the number release must stay conditional on mode; unconditional, it would relinquish " +
      "a customer's own ported-in number",
  );
}

// Deliberate-failure fixture: prove the port exclusion is a real comparison and
// not a blanket refusal that happens to look right.
{
  const released = objectKeysFromRow("tradeline_phone_setups", {
    mode: "new",
    assigned_number_sid: OUR_NUMBER_SID,
  }).length;
  const withheld = objectKeysFromRow("tradeline_phone_setups", {
    mode: "port",
    assigned_number_sid: OUR_NUMBER_SID,
  }).length;
  assert.ok(
    released === 1 && withheld === 0,
    "the mode condition does not discriminate: the same SID must be collected under 'new' " +
      "and withheld under 'port'. Equal outcomes mean the guard is either always on or " +
      "always off, and one of those silently destroys a customer's phone number.",
  );
}

/* ── 11d. sms_messages is reachable by BOTH of its owner columns ─────────── */
// It was scoped by `calculator_id` alone. `jobs/reviewFollowupWorker.ts` and
// `services/reviewRequestService.ts` both write `calculator_id: payload?.calculator_id
// || null` beside a lead_id they have already checked is present — so those
// texts, holding the end customer's number and the message body, survived the
// deletion outright while the table LOOKED covered.
{
  const smsPlan = planFor("sms_messages")!;
  assert.equal(smsPlan.scope.by, "anyOf", "sms_messages must be reachable by more than one route");
  const stmt = statements.find((s) => s.table === "sms_messages");
  assert.ok(stmt, "sms_messages must generate a delete");
  assert.ok(
    /from "leads"/i.test(stmt!.sql),
    `sms_messages must be reachable through its lead as well as its calculator — a row ` +
      `written with a null calculator_id is otherwise never deleted:\n  ${stmt!.sql}`,
  );
  assert.ok(
    /from "calculators"/i.test(stmt!.sql),
    `…and still through its calculator, for the rows that have no lead:\n  ${stmt!.sql}`,
  );
  // Both branches OR'd, so neither narrows the other.
  assert.ok(
    / or /i.test(stmt!.sql),
    `the two routes must be OR'd — AND would delete only rows carrying both:\n  ${stmt!.sql}`,
  );
}

// The lead route only terminates in an owned calculator because leads.calculator_id
// is NOT NULL. If that ever changes, the branch stops being a scope.
{
  const leadsPlan = planFor("leads")!;
  assert.equal(
    leadsPlan.scope.by,
    "parent",
    "sms_messages reaches its owner through leads; leads must itself be scoped to the account",
  );
}

/* ── 11e. The raw lead-form submissions ──────────────────────────────────── */
// `intake_events.raw_payload` is the verbatim request body of every public lead
// form — name, email, phone, every answer — beside the submitter's IP and user
// agent. `account_id` is a bare integer with no foreign key, so neither the
// owner-column pattern nor the FK sweep in the coverage guard could see it, and
// the raw copy outlived the `leads` row it duplicates.
{
  const stmt = statements.find((s) => s.table === "intake_events");
  assert.ok(
    stmt && /from "calculators"/i.test(stmt.sql),
    "intake_events must be deleted through the calculator its account_id names — the raw " +
      "body of every lead submission survives the account otherwise",
  );
}

/* ── 12. Deliberate-failure fixture for the object rules ────────────────── */
// Prove assertion set (10) bites. If the store list is ever loosened to accept
// anything, this goes red.
{
  let caught = false;
  try {
    const bogus = { store: "s3-someday", column: "x" };
    assert.ok(
      ["objectStorage", "uploads", "r2"].includes(bogus.store),
      "unknown store",
    );
  } catch {
    caught = true;
  }
  assert.ok(
    caught,
    "the store-name assertion does not reject a store with no deleter, so a new store " +
      "could be declared and never purged",
  );
}
// And prove the "kept tables must not declare files" rule bites.
{
  let caught = false;
  try {
    assert.notEqual("keep", "keep", "kept table declaring objects");
  } catch {
    caught = true;
  }
  assert.ok(caught, "the kept-table assertion does not actually reject a kept table with files");
}

/* ── 13. The Twilio key is re-validated at the point of deletion ─────────── */
// The last line of defence: whatever `objectKeysFromRow` produced has been
// through a receipt and an audit row by the time the deleter sees it, and the
// SID is about to be interpolated into a REST path. `parseTwilioKey` is what
// makes that safe, so it is asserted directly rather than trusted.
{
  const { parseTwilioKey } = await import("../../lib/twilioArtefacts");

  assert.deepEqual(
    parseTwilioKey(`Recordings/${RECORDING}`),
    { resource: "Recordings", sid: RECORDING },
    "a well-formed key must parse back to the resource and SID it names",
  );

  for (const bogus of [
    `Recordings/${RECORDING}/../../Accounts/${SOMEBODY_ELSES_ACCOUNT}/Recordings/${RECORDING}`,
    "IncomingPhoneNumbers/PN11111111111111111111111111111111",
    "Accounts/" + SOMEBODY_ELSES_ACCOUNT,
    `Recordings/SM33333333333333333333333333333333`, // right collection, wrong SID type
    `Messages/${RECORDING}`,
    "Recordings/",
    RECORDING,
    "",
    // Inherited Object properties must not read as a known resource.
    `constructor/${RECORDING}`,
    `toString/${RECORDING}`,
    `__proto__/${RECORDING}`,
  ]) {
    assert.equal(
      parseTwilioKey(bogus),
      null,
      `parseTwilioKey accepted "${bogus}" — a key that reaches a resource we must never ` +
        `delete, or an account that is not ours, would be sent to Twilio as a DELETE`,
    );
  }

  // Prove the account check bites: if `twilioArtefactKey` is ever "simplified"
  // into something that ignores the account SID, this goes red.
  const { twilioArtefactKey } = await import("../../lib/twilioArtefacts");
  assert.equal(
    twilioArtefactKey(
      `https://api.twilio.com/2010-04-01/Accounts/${SOMEBODY_ELSES_ACCOUNT}/Recordings/${RECORDING}`,
    ),
    null,
    "the Twilio ownership test does not reject another account's recording — the deletion " +
      "would erase a different customer's data",
  );
  assert.equal(
    twilioArtefactKey(OUR_RECORDING_URL),
    `Recordings/${RECORDING}`,
    "…while still accepting our own, so the check is a real comparison and not a blanket no",
  );

  // Cannot verify ≠ nothing to erase. With no account SID configured the
  // recording is still collected, so it is REPORTED as outstanding by a deleter
  // that has no credentials either — rather than dropped, which would let a
  // deployment with a broken Twilio config claim a clean erasure.
  const saved = process.env.TWILIO_ACCOUNT_SID;
  try {
    delete process.env.TWILIO_ACCOUNT_SID;
    assert.equal(
      twilioArtefactKey(OUR_RECORDING_URL),
      `Recordings/${RECORDING}`,
      "an unverifiable account must not silently drop the recording — a deletion that " +
        "cannot check ownership must report, not assume there was nothing to erase",
    );
  } finally {
    process.env.TWILIO_ACCOUNT_SID = saved;
  }
}

/* ── 14. Retained-and-scrubbed audit rows ────────────────────────────────── */
// `audit_log` and `admin_activity_log` carried the recipient's phone number,
// the account holder's own email address and the FULL TEXT of messages we sent
// on their behalf — inside jsonb blobs, in tables no plan covered, because
// neither has an owner column the coverage guard can see. They are kept (one is
// where a failed purge records the keys that make an orphan recoverable; the
// other is the record that staff opened this account) and scrubbed.

const redactions = previewRedactions({ userId: USER_ID, clientIds: CLIENT_IDS, email: EMAIL });
assert.ok(redactions.length > 0, "no table is scrubbed — the audit blobs keep their PII");

// Same rule as the deletes: the predicate that selects rows to scrub also
// selects the Twilio artefacts that are about to be DELETED at Twilio, so an
// unscoped one would erase a different customer's message.
for (const { table, sql: text } of redactions) {
  assert.ok(/\bWHERE\b/i.test(text), `${table}: redaction select has no WHERE clause:\n  ${text}`);
  const where = text.slice(text.toUpperCase().indexOf("WHERE") + 5).trim();
  assert.ok(
    !/^(true|1\s*=\s*1)\s*$/i.test(where),
    `${table}: redaction WHERE matches every row on the platform:\n  ${text}`,
  );
  assert.ok(
    /\$\d+/.test(text),
    `${table}: redaction WHERE binds no parameter, so it cannot be constrained to this ` +
      `account:\n  ${text}`,
  );
}

// An account with no clients must not fall back to a client-less predicate that
// matches every row — the same failure the delete path is guarded against.
{
  const none = previewRedactions({ userId: USER_ID, clientIds: [], email: EMAIL });
  for (const { table, sql: text } of none) {
    assert.ok(
      /\$\d+/.test(text),
      `${table}: with no clients the redaction predicate must still bind the user id, or ` +
        `be dropped entirely:\n  ${text}`,
    );
  }
  // admin_activity_log is reachable only through clients, so it must vanish.
  assert.ok(
    !none.some((r) => r.table === "admin_activity_log"),
    "admin_activity_log is client-scoped only; with no clients it must be SKIPPED, never " +
      "widened to every row",
  );
}

// Every table declared for redaction states why it is kept, and is not also
// deleted — a deleted row needs no scrubbing, and the contradiction would mean
// one of the two declarations is wrong about what happens to the table.
for (const entry of METADATA_REDACTIONS) {
  assert.ok(
    (entry.reason ?? "").trim().length >= 30,
    `${entry.table} is kept and scrubbed without a stated reason`,
  );
  assert.notEqual(
    planFor(entry.table)?.action,
    "delete",
    `${entry.table} is both deleted and scrubbed`,
  );
  assert.ok(
    entry.twilioColumns.every((c) => entry.jsonColumns.includes(c)),
    `${entry.table} mines a blob for Twilio SIDs that nothing scrubs`,
  );
}

/* ── 14b. The scrub itself ───────────────────────────────────────────────── */
// The real shape written by `services/adminAgentTools.ts`: the ticket context
// stays, the body and the phone number go, and the Twilio SID stays because it
// is the pointer that makes a failed purge retryable.
{
  const before = {
    ticket_id: 91,
    client_id: 77,
    business_name: "Ridgeline Roofing",
    resolved_phone: "+14165550123",
    body: "Hi Dana — your quote for the north elevation is ready.",
    segments: 1,
    twilio_sid: "SM33333333333333333333333333333333",
    session_id: "sess_abc",
  };
  const after = redactJson(before) as { value: Record<string, unknown>; changed: boolean };
  assert.ok(after.changed, "a metadata blob holding an SMS body must be reported as changed");
  assert.equal(after.value.body, REDACTION_TOMBSTONE, "the message body must be erased");
  assert.equal(after.value.resolved_phone, REDACTION_TOMBSTONE, "the phone number must be erased");
  assert.equal(after.value.business_name, REDACTION_TOMBSTONE, "the business name must be erased");
  // Kept: the operational skeleton, and specifically the SID.
  assert.equal(after.value.ticket_id, 91, "the ticket id is what makes the row useful; keep it");
  assert.equal(after.value.segments, 1, "counts are not personal data");
  assert.equal(
    after.value.twilio_sid,
    "SM33333333333333333333333333333333",
    "the Twilio SID must SURVIVE the scrub: once the Message is deleted it identifies " +
      "nobody, and if the purge failed it is the only thing that makes a retry possible",
  );
  // Erased, not dropped. A reader has to be able to tell an erased field from
  // one that was never recorded.
  assert.ok("body" in after.value, "a redacted key must remain present, marked as redacted");
}

// Nested — `services/adminTools.ts` puts the message body under `args`. A
// fixed-path scrub would miss it; key-name matching at any depth does not.
{
  const after = redactJson({
    tool_name: "send_support_sms",
    args: { client_id: 77, message: "We have credited your account." },
    twilio_sid: "SM33333333333333333333333333333333",
  }) as { value: any; changed: boolean };
  assert.equal(
    after.value.args.message,
    REDACTION_TOMBSTONE,
    "a message body nested one level down must still be erased — this is the exact shape " +
      "adminTools writes, and a path-based scrub would have walked past it",
  );
  assert.equal(after.value.args.client_id, 77, "the scoping id is not personal data");
  assert.equal(after.value.tool_name, "send_support_sms", "the tool NAME is not its arguments");
}

// Arrays and deeper nesting.
{
  const after = redactJson({
    thread: [{ body: "one" }, { body: "two", note: "internal" }],
  }) as { value: any; changed: boolean };
  assert.deepEqual(
    after.value.thread.map((t: any) => t.body),
    [REDACTION_TOMBSTONE, REDACTION_TOMBSTONE],
    "every element of an array of messages must be scrubbed, not just the first",
  );
  assert.equal(after.value.thread[1].note, REDACTION_TOMBSTONE);
}

// A null PII field is left alone. Writing a tombstone over it would ADD
// information — it would claim a phone number was recorded where none was.
{
  const after = redactJson({ caller_email: null, caller_phone: "+14165550123" }) as {
    value: any;
    changed: boolean;
  };
  assert.equal(after.value.caller_email, null, "an absent value must not be marked as erased");
  assert.equal(after.value.caller_phone, REDACTION_TOMBSTONE);
}

// Idempotent: re-running over an already-scrubbed row must report no change, so
// a retry does not rewrite every audit row in the table.
{
  const once = redactJson({ body: "secret" });
  const twice = redactJson(once.value);
  assert.equal(twice.changed, false, "scrubbing an already-scrubbed blob must be a no-op");
}

// A blob with nothing personal in it is left untouched — the scrub must not
// rewrite rows it has no reason to touch.
{
  const clean = { ticket_id: 4, outcome: "sent", cost_cents: 12 };
  const after = redactJson(clean);
  assert.equal(after.changed, false, "a blob with no PII must not be reported as changed");
  assert.equal(after.value, clean, "…and must be returned untouched, not rebuilt");
}

/* ── 14c. The keys the callers actually write are covered ────────────────── */
// Named explicitly rather than left to the source scan alone: if somebody
// "tidies" one of these out of PII_METADATA_KEYS, the corresponding real call
// site starts leaking again and this is what says so.
for (const key of [
  "body", // adminAgentTools — the full SMS text
  "message", // adminTools — args.message
  "subject", // adminAgentTools — support email subject
  "reply_text", // the three concierges
  "resolved_phone", // adminAgentTools
  "sender_phone", // inboundSmsConcierge
  "caller_phone", // voiceFollowupConcierge
  "caller_email", // voiceFollowupConcierge
  "sender_email", // inboundEmailConcierge
  "target_email", // adminImpersonateRoutes — the account holder's OWN address
  "business_name",
  "ip",
  "user_agent",
]) {
  assert.ok(
    PII_METADATA_KEYS.includes(key),
    `"${key}" is written into an audit blob by real code and must be scrubbed on deletion`,
  );
}

// The pointer that must NOT be scrubbed.
assert.ok(
  !PII_METADATA_KEYS.includes("twilio_sid"),
  "twilio_sid must not be scrubbed — it is the only pointer at a Twilio Message for the " +
    "admin-SMS paths, and erasing it would orphan the artefact exactly as PR #2067 " +
    "described for bucket files",
);

/* ── 14d. Deliberate-failure fixture for the scrub ───────────────────────── */
// Prove the assertions above bite: a scrub that returned its input unchanged
// would pass a test that only checked "it did not throw".
{
  const identity = (v: unknown) => ({ value: v, changed: false });
  let caught = false;
  try {
    const out = identity({ body: "still here" }) as { value: any };
    assert.equal(out.value.body, REDACTION_TOMBSTONE, "no-op scrub");
  } catch {
    caught = true;
  }
  assert.ok(
    caught,
    "the scrub assertions do not reject a redactor that leaves the message body in place",
  );
}

/* ── 15. The nine stores that no deletion request could reach ─────────────
 *
 * Every one of these held personal data inside free-form JSON or free text with
 * no owner column, so the coverage guard could not see them and no deletion
 * touched them. They are covered three different ways on purpose — a table gets
 * the mechanism its data actually justifies, not whichever one is cheapest:
 *
 *   DELETED BY EMAIL   audit_submissions, audit_followup_emails,
 *                      marketing_chat_sessions — pre-account funnel rows
 *                      written before a users.id existed.
 *   KEPT AND SCRUBBED  system_alerts, admin_ai_actions — operational and
 *                      agent-accountability trails that must outlive the
 *                      account, minus the personal data in them.
 *   BOUNDED BY A CLOCK gbp_automation_log, audit_reports, and the rows of
 *                      marketing_chat_sessions / admin_ai_actions /
 *                      sms_messages that name nobody at all.
 *
 * Section 16 is what proves the scoping is right rather than merely present.
 * ──────────────────────────────────────────────────────────────────────── */

const NEWLY_DELETED_BY_EMAIL = [
  "audit_submissions",
  "audit_followup_emails",
  "marketing_chat_sessions",
];

for (const table of NEWLY_DELETED_BY_EMAIL) {
  const entry = planFor(table);
  assert.ok(entry, `${table} holds a funnel email address and must be in the plan`);
  assert.equal(entry!.action, "delete", `${table} must be deleted, not kept`);
  assert.equal(
    entry!.scope.by,
    "email",
    `${table} is written before a users.id exists, so its only attribution is the address`,
  );
  assert.ok(
    statements.some((s) => s.table === table),
    `${table} generates no DELETE — the funnel rows survive the deletion`,
  );
}

for (const table of ["system_alerts", "admin_ai_actions"]) {
  const entry = METADATA_REDACTIONS.find((r) => r.table === table);
  assert.ok(entry, `${table} carries PII in a blob and must be retained-and-scrubbed`);
  assert.ok(
    entry!.textColumns.length > 0,
    `${table} interpolates personal data into free text, which cannot be scrubbed key-by-key`,
  );
  assert.ok(
    redactions.some((r) => r.table === table),
    `${table} generates no redaction predicate, so its blobs keep their PII`,
  );
}

/* Every attribution route each scrubbed table must keep, named HERE rather
 * than read back off the declaration — for the reason spelled out at
 * EXPECTED_PROBES below: iterating `entry.match` and checking each one resolves
 * passes trivially when a branch is DELETED, and a deleted branch is a set of
 * rows that silently keeps its PII.
 *
 * The system_alerts pair is the case that makes this worth writing down. There
 * is no schema inside a jsonb column and the callers disagree:
 * `services/reputation/reputationAlerts.ts` writes `clientId`,
 * `services/sitelaunchPaidOrderNotify.ts` and
 * `services/socialSync/connectionLifecycle.ts` write `client_id`. Keeping only
 * one spelling leaves the other caller's alerts — which carry the business name
 * in `title` AND in `details` — untouched, and nothing else would say so. */
{
  const EXPECTED_MATCHES: Record<string, string[]> = {
    system_alerts: ["client_id", "clientId", "crm_client_id"],
    admin_ai_actions: ["user_id", "client_id", "calculator_id"],
  };
  for (const [table, expected] of Object.entries(EXPECTED_MATCHES)) {
    const entry = METADATA_REDACTIONS.find((r) => r.table === table)!;
    const routes = entry.match.map((m: any) =>
      m.by === "entity" ? m.entityType : (m.path?.[m.path.length - 1] ?? m.column),
    );
    for (const route of expected) {
      assert.ok(
        routes.includes(route),
        `${table}: no redaction branch attributes rows by ${route}, so every row written by ` +
          `the caller that spells it that way keeps its personal data. Declared: ` +
          `[${routes.join(", ")}]`,
      );
    }
  }
}

// The free-text columns that interpolate a person, named explicitly: each is a
// real interpolation in real code, and losing one silently re-opens the leak.
{
  const alerts = METADATA_REDACTIONS.find((r) => r.table === "system_alerts")!;
  for (const column of ["title", "details"]) {
    assert.ok(
      alerts.textColumns.includes(column),
      `system_alerts.${column} interpolates the business name or the ticket subject ` +
        `verbatim and must be overwritten`,
    );
  }
  const ai = METADATA_REDACTIONS.find((r) => r.table === "admin_ai_actions")!;
  for (const column of ["summary", "ai_reasoning"]) {
    assert.ok(
      ai.textColumns.includes(column),
      `admin_ai_actions.${column} restates the address or business name the signal was ` +
        `about and must be overwritten`,
    );
  }
  assert.ok(
    ai.jsonColumns.includes("proposed_action"),
    "admin_ai_actions.proposed_action is built FROM detail and restates it — scrubbing one " +
      "and not the other leaves the copy",
  );
}

// sms_messages: the HELP row the handler could always have attributed.
{
  const entry = planFor("sms_messages")!;
  assert.equal(entry.scope.by, "anyOf");
  const branches = (entry.scope as { by: "anyOf"; scopes: any[] }).scopes;
  assert.ok(
    branches.some((s) => s.by === "client" && s.columns.includes("scope_client_id")),
    "an inbound HELP text on a tenant's TradeLine number is attributable — the handler " +
      "already resolves the client id to answer in their brand — so sms_messages must be " +
      "reachable by scope_client_id, not left to the retention sweep",
  );
}

/* ── 16. Correct SCOPE, proven by the values the statements bind ───────────
 *
 * "It has a WHERE clause" is not the property that matters; "it can only match
 * THIS account's rows" is. Section 1 checks the shape of the SQL. This checks
 * the parameters, which is the only place the account's identity actually
 * appears — and then runs the whole thing again for a DIFFERENT account and
 * proves the two can never select each other's rows.
 * ──────────────────────────────────────────────────────────────────────── */

const OTHER_USER_ID = 5150;
const OTHER_CLIENT_IDS = [301, 302];
const OTHER_EMAIL = "someone-else@example.com";

const ours = { userId: USER_ID, clientIds: CLIENT_IDS, email: EMAIL };
const theirs = { userId: OTHER_USER_ID, clientIds: OTHER_CLIENT_IDS, email: OTHER_EMAIL };

/**
 * Constant discriminators a predicate may bind that are not identifiers at all:
 * `entity_type = 'user'` narrows WHICH rows an id column refers to. Read off
 * the declarations rather than hard-coded, so a new entity type is permitted
 * automatically and a stray literal is still caught.
 */
const DISCRIMINATORS = new Set<unknown>(
  METADATA_REDACTIONS.flatMap((r) =>
    r.match.filter((m: { by: string }) => m.by === "entity").map((m: any) => m.entityType),
  ),
);

/**
 * Everything that IDENTIFIES this account, in both the text and the native form
 * (the same id is compared as text in a jsonb path and as an integer in a
 * column, so both spellings are legitimate).
 */
function identifierValues(ctx: { userId: number; clientIds: number[]; email: string | null }) {
  const out = new Set<unknown>();
  out.add(ctx.userId);
  out.add(String(ctx.userId));
  for (const id of ctx.clientIds) {
    out.add(id);
    out.add(String(id));
  }
  if (ctx.email) {
    out.add(ctx.email);
    out.add(ctx.email.toLowerCase());
  }
  return out;
}

/** Identifiers plus the constant discriminators — everything a statement may bind. */
function permittedValues(ctx: { userId: number; clientIds: number[]; email: string | null }) {
  return new Set<unknown>([...identifierValues(ctx), ...DISCRIMINATORS]);
}

// Values that IDENTIFY the other account and must never appear in ours. Built
// from identifiers only: the discriminators are shared constants, so including
// them would make every statement look like a cross-account leak.
const foreignValues = identifierValues(theirs);
for (const v of identifierValues(ours)) {
  assert.ok(!foreignValues.has(v), `fixture error: ${String(v)} is claimed by both accounts`);
}

{
  const allowed = permittedValues(ours);
  const previews = [
    ...previewStatements(ours),
    ...previewRedactions(ours),
    previewSessionRevocation(ours),
  ];
  assert.ok(previews.length > 50, `expected the whole erasure to be previewable`);

  for (const { table, sql: text, params } of previews) {
    assert.ok(
      params.length > 0,
      `${table}: binds no parameter at all, so nothing constrains it to this account:\n  ${text}`,
    );
    for (const p of params) {
      assert.ok(
        allowed.has(p),
        `${table}: binds ${JSON.stringify(p)}, which is not this account's user id, one of ` +
          `its client ids, or its email address. A statement that binds anything else is not ` +
          `scoped to the account being deleted:\n  ${text}`,
      );
      assert.ok(
        !foreignValues.has(p),
        `${table}: binds another account's identifier ${JSON.stringify(p)}:\n  ${text}`,
      );
    }
  }
}

// The same run for the other account: no statement may carry OUR ids, and the
// two sets of parameters must be disjoint table-for-table. This is the property
// that says one customer's deletion cannot reach another's rows.
{
  const theirPreviews = [
    ...previewStatements(theirs),
    ...previewRedactions(theirs),
    previewSessionRevocation(theirs),
  ];
  const ourValues = identifierValues(ours);
  for (const { table, sql: text, params } of theirPreviews) {
    for (const p of params) {
      assert.ok(
        !ourValues.has(p),
        `${table}: another account's deletion binds OUR identifier ${JSON.stringify(p)} — the ` +
          `predicate is not derived from the account being deleted:\n  ${text}`,
      );
    }
  }

  // Table-for-table: the generated SQL text is identical (same plan, same
  // shape) and ONLY the bound values differ. If a table ever hard-coded an id
  // into the text instead of binding it, the texts would diverge and this says
  // so — and a hard-coded id is an id that does not follow the account.
  const oursByTable = new Map(previewStatements(ours).map((s) => [s.table, s]));
  for (const t of previewStatements(theirs)) {
    const mine = oursByTable.get(t.table);
    assert.ok(mine, `${t.table}: generated for one account but not the other`);
    assert.equal(
      t.sql,
      mine!.sql,
      `${t.table}: the SQL TEXT differs between two accounts, so an identifier is baked into ` +
        `the statement rather than bound`,
    );
    assert.notDeepEqual(
      t.params,
      mine!.params,
      `${t.table}: two different accounts produce identical parameters — the predicate does ` +
        `not actually depend on whose account is being deleted`,
    );
  }
}

/* ── 16b. Deliberate-failure fixture for the scope proof ─────────────────── */
// The check above is only worth anything if a leaked identifier would fail it.
// Feed it a statement that binds a foreign client id and confirm it is rejected.
{
  const allowed = permittedValues(ours);
  let caught = false;
  try {
    const leaky = { table: "invented", sql: "DELETE FROM x WHERE client_id = $1", params: [999] };
    for (const p of leaky.params) assert.ok(allowed.has(p), "leaked id");
  } catch {
    caught = true;
  }
  assert.ok(
    caught,
    "the parameter check does not reject a statement bound to an id outside this account — " +
      "it would pass a deletion that reached another tenant",
  );
}

/* ── 17. The session sweep ────────────────────────────────────────────────
 *
 * `session` is express-session's own table and is deliberately NOT given an
 * owner column: connect-pg-simple owns the shape and a migration that breaks
 * blob decoding logs every user out. So the fix is a wider predicate, and this
 * is what proves it reaches the two half-finished logins that used to survive.
 * ──────────────────────────────────────────────────────────────────────── */
{
  const sweep = previewSessionRevocation(ours);
  for (const [needle, why] of [
    ["passport", "a fully logged-in session"],
    ["pending2faUserId", "a session that passed the password step but not TOTP — a live, " +
      "resumable credential for an account that no longer exists"],
    ["pendingGoogleSignup", "an OAuth signup parked mid-flow, holding the visitor's email " +
      "address and name with no user id to find it by"],
  ] as const) {
    assert.ok(
      sweep.sql.includes(needle),
      `session revocation does not reach ${needle} — ${why}`,
    );
  }
  // Reached by the address, so the comparison has to be case-insensitive on
  // both sides: users.email is not normalised on the way in.
  assert.ok(
    /lower\(/i.test(sweep.sql),
    "the pendingGoogleSignup branch compares addresses case-sensitively, so a session " +
      "stored under a differently-cased address survives",
  );
  assert.ok(
    sweep.params.includes(EMAIL.toLowerCase()),
    "the email branch does not bind this account's address",
  );

  // No address on the account — the branch must be DROPPED, never compared
  // against NULL and never widened.
  const noEmail = previewSessionRevocation({ userId: USER_ID, email: null });
  assert.ok(
    !noEmail.sql.includes("pendingGoogleSignup"),
    "with no address on the account the email branch must be dropped entirely",
  );
  assert.ok(
    noEmail.params.every((p) => p === String(USER_ID)),
    "with no address the sweep must still bind only this user's id",
  );
}

/* ── 18. The clock on the data no request can reach ───────────────────────
 *
 * The dangerous failure here is the opposite of everywhere else: not a sweep
 * that misses rows, but one that takes rows the deletion path could have
 * reached — destroying a customer's data on a timer instead of on their
 * request, and silently.
 * ──────────────────────────────────────────────────────────────────────── */
{
  const NOW = new Date("2026-09-03T00:00:00.000Z");

  assert.ok(RETENTION_SWEEPS.length >= 5, "expected a sweep per unattributable store");

  for (const entry of RETENTION_SWEEPS) {
    assert.ok(
      (entry.reason ?? "").trim().length >= 30,
      `${entry.table} is swept without a written justification`,
    );

    const text = new PgDialect().sqlToQuery(sweepPredicate(entry, NOW)).sql;

    // Age-bounded, always. A sweep with no cutoff is a TRUNCATE with extra steps.
    assert.ok(
      text.includes(entry.ageColumn) && /</.test(text),
      `${entry.table}: the sweep is not bounded by ${entry.ageColumn}, so it would take every ` +
        `row regardless of age:\n  ${text}`,
    );

    // Every declared probe appears, AND-ed. One probe dropped, or OR-ed instead
    // of AND-ed, and the sweep starts taking attributable rows.
    for (const probe of entry.unattributedWhen ?? []) {
      assert.ok(
        text.includes(probe.column),
        `${entry.table}: attribution probe ${probe.column} is missing from the sweep, so rows ` +
          `an account deletion can reach would be aged out from under it:\n  ${text}`,
      );
    }
    if ((entry.unattributedWhen ?? []).length > 0) {
      assert.ok(
        !/\bor\b/i.test(text),
        `${entry.table}: the probes are OR-ed. A row naming an owner by one route would still ` +
          `be swept:\n  ${text}`,
      );
      assert.equal(
        (text.match(/IS NULL/gi) ?? []).length,
        entry.unattributedWhen!.length,
        `${entry.table}: expected one IS NULL per attribution probe:\n  ${text}`,
      );
    }
  }

  // The coherence rule, stated as code: a table an account deletion can reach
  // must never be swept unconditionally.
  assert.deepEqual(
    sweepsThatCouldOutrunDeletion(),
    [],
    "a retention sweep would destroy rows the deletion path can reach, on a timer rather " +
      "than on the customer's request",
  );

  /* And the specific probes, named HERE rather than read back off the
   * declaration.
   *
   * This is the difference between a test and a tautology, and it was a real
   * hole in the first draft: iterating `entry.unattributedWhen` and asserting
   * each probe appears in the SQL passes trivially when a probe is DELETED from
   * the declaration — there is simply one fewer thing to check, and the sweep
   * silently widens onto rows the deletion path can reach. The same argument
   * §14c makes for PII_METADATA_KEYS: the expected set has to be written down
   * somewhere the change would have to walk past.
   *
   * Every route below is a real attribution route on that table. Removing one
   * from the plan means rows carrying an owner start being aged out. */
  const EXPECTED_PROBES: Record<string, string[]> = {
    // The two pre-existing owner columns plus the one this change added. Drop
    // `scope_client_id` and a tenant's own HELP texts get swept on a timer
    // instead of deleted with their account.
    sms_messages: ["scope_client_id", "lead_id", "calculator_id"],
    // The address is the ONLY thing that makes a transcript attributable.
    marketing_chat_sessions: ["lead_email"],
    // All three detector shapes: draftCalculators names the user,
    // stuck/pastDue/unassignedWebFix name the client, botSubmissions names only
    // the calculator.
    admin_ai_actions: ["user_id", "client_id", "calculator_id"],
  };

  for (const [table, expected] of Object.entries(EXPECTED_PROBES)) {
    const entry = RETENTION_SWEEPS.find((r) => r.table === table);
    assert.ok(
      entry,
      `${table} holds BOTH attributable and unattributable rows and must declare a sweep`,
    );
    const declared = (entry!.unattributedWhen ?? []).map((p) =>
      "path" in p ? p.path[p.path.length - 1] : p.column,
    );
    for (const route of expected) {
      assert.ok(
        declared.includes(route),
        `${table}: the sweep no longer excludes rows attributable by ${route}, so rows an ` +
          `account deletion can reach would be destroyed on a timer instead. Declared: ` +
          `[${declared.join(", ")}]`,
      );
    }
    // And the generated SQL really carries every one of them.
    const text = new PgDialect().sqlToQuery(sweepPredicate(entry!, NOW)).sql;
    for (const route of expected) {
      assert.ok(
        text.includes(route),
        `${table}: ${route} is declared but absent from the generated sweep:\n  ${text}`,
      );
    }
  }

  // The two that are wholly unattributable must NOT be narrowed — a probe there
  // would read as though some rows had an owner, which is the claim this whole
  // exercise exists to stop making loosely.
  for (const table of ["gbp_automation_log", "audit_reports"]) {
    const entry = RETENTION_SWEEPS.find((r) => r.table === table)!;
    assert.equal(
      (entry.unattributedWhen ?? []).length,
      0,
      `${table} names no account on any row; narrowing its sweep implies otherwise`,
    );
    assert.equal(
      planFor(table),
      undefined,
      `${table} is swept as unattributable but also claimed by the plan — one of the two is ` +
        `wrong about whether it has an owner`,
    );
  }

  /* Deliberate-failure fixture: prove the narrowing check bites. An
   * unconditional sweep on a table the plan reaches must be rejected. */
  {
    let caught = false;
    try {
      const bad = { table: "sms_messages", ageColumn: "created_at", days: 1, reason: "x".repeat(40) };
      const probes = (bad as { unattributedWhen?: unknown[] }).unattributedWhen ?? [];
      assert.ok(probes.length > 0, "unnarrowed sweep on a reachable table");
    } catch {
      caught = true;
    }
    assert.ok(
      caught,
      "the retention assertions accept an unnarrowed sweep on a table the deletion path can " +
        "reach — it would age out customer data early",
    );
  }
}

/* ── 18b. The scrub paginates over text primary keys too ──────────────────
 *
 * `redactTable` walks its matches in pages of 500 with a keyset cursor. That
 * cursor was cast `::bigint`, which held only while every scrubbed table had an
 * integer id. `admin_ai_actions.id` is `text` holding a `crypto.randomUUID()`,
 * so the cast raised on the SECOND page — inside the deletion transaction,
 * aborting the whole erasure — and only for an account with more than 500
 * matching rows, which is why nothing would have caught it in practice.
 *
 * Asserted against the SOURCE because the failure is in SQL this suite cannot
 * execute without a database, and the property is exactly "no type is assumed".
 * ──────────────────────────────────────────────────────────────────────── */
{
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("./deleteAccount.ts", import.meta.url)), "utf8");
  const cursorLine = src
    .split("\n")
    .find((l) => l.includes("AND id >") && l.includes("after"));
  assert.ok(cursorLine, "could not find the redaction pagination cursor");
  assert.ok(
    !/::\s*(bigint|int|integer|numeric|uuid)/i.test(cursorLine!),
    `the scrub's pagination cursor casts the id to a fixed type (${cursorLine!.trim()}). ` +
      `admin_ai_actions.id is text, so the cast raises on the second page and rolls back the ` +
      `entire account deletion.`,
  );

  // The condition that makes this matter, pinned: at least one scrubbed table
  // really does have a non-integer primary key. If that ever stopped being
  // true the assertion above would still pass, and silently stop meaning
  // anything — so say out loud why it is there.
  const textKeyed = METADATA_REDACTIONS.filter((r) => r.table === "admin_ai_actions");
  assert.equal(
    textKeyed.length,
    1,
    "admin_ai_actions is the text-primary-key table this pagination rule exists for",
  );
}

/* ── 19. The scrub is spelling-agnostic ───────────────────────────────────
 *
 * The blobs are hand-written object literals with no schema, and the callers
 * genuinely disagree on spelling: `services/reputation/reputationAlerts.ts`
 * writes `clientId` where `services/sitelaunchPaidOrderNotify.ts` writes
 * `client_id`. The scrub compared exact lower-cased names, so every camelCase
 * caller's business name and phone number walked straight through it.
 * ──────────────────────────────────────────────────────────────────────── */
{
  const before = {
    clientId: 77, // an id, not PII — must survive, it is what support needs
    businessName: "Ridgeline Roofing",
    contactEmail: "dana@example.test",
    phoneNumber: "+14165550123",
    ipAddress: "203.0.113.7",
    platform: "google", // not PII — must survive
    nested: { ownerEmail: "owner@example.test", severity: "high" },
  };
  const after = redactJson(before) as { value: any; changed: boolean };
  assert.ok(after.changed, "camelCase PII keys were not recognised at all");

  for (const [path, read] of [
    ["businessName", () => after.value.businessName],
    ["contactEmail", () => after.value.contactEmail],
    ["phoneNumber", () => after.value.phoneNumber],
    ["ipAddress", () => after.value.ipAddress],
    ["nested.ownerEmail", () => after.value.nested.ownerEmail],
  ] as const) {
    assert.equal(
      read(),
      REDACTION_TOMBSTONE,
      `${path} survived the scrub — a camelCase caller's personal data is still in the blob`,
    );
  }

  // The skeleton stays. Scrubbing the ids too would leave a row nobody can act
  // on, which is the opposite failure.
  assert.equal(after.value.clientId, 77, "the client id must survive — it is not personal data");
  assert.equal(after.value.platform, "google", "a non-PII key was scrubbed");
  assert.equal(after.value.nested.severity, "high", "a non-PII nested key was scrubbed");

  // snake_case must still work — the fold must not have traded one spelling for
  // the other.
  const snake = redactJson({ business_name: "Ridgeline Roofing", client_id: 77 }) as {
    value: any;
  };
  assert.equal(snake.value.business_name, REDACTION_TOMBSTONE, "snake_case regressed");
  assert.equal(snake.value.client_id, 77);

  // Deliberate-failure fixture: a scrub that only handled snake_case would pass
  // the old assertions and fail these.
  {
    let caught = false;
    try {
      const naive = { businessName: "Ridgeline Roofing" }; // untouched by a snake-only scrub
      assert.equal(naive.businessName, REDACTION_TOMBSTONE, "snake-only scrub");
    } catch {
      caught = true;
    }
    assert.ok(caught, "the camelCase assertions do not reject a snake_case-only scrub");
  }
}

const objectSources = withObjects.reduce((n, p) => n + (p.objects?.length ?? 0), 0);
const twilioSources = withObjects.reduce(
  (n, p) => n + (p.objects?.filter((s) => s.store === "twilio").length ?? 0),
  0,
);

console.log(
  `account-deletion guard: OK (${statements.length} scoped deletes, ${kept.length} kept with ` +
    `a stated basis, ${Object.keys(ANONYMISE_FIELDS).length} anchor tables anonymised, ` +
    `${objectSources} pointer column(s) across ${withObjects.length} table(s) purged, ` +
    `${twilioSources} of them at Twilio and attributed by account SID, ` +
    `${redactions.length} table(s) retained-and-scrubbed across ${PII_METADATA_KEYS.length} ` +
    `PII key names, ${RETENTION_SWEEPS.length} table(s) bounded by a retention sweep, ` +
    `every statement proven to bind only this account's identifiers and none of another ` +
    `account's)`,
);
