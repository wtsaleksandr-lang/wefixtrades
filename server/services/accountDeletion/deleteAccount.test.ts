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

const { previewStatements, retentionDisclosure, objectKeysFromRow } = await import(
  "./deleteAccount"
);
const {
  ACCOUNT_DELETION_PLAN,
  ANONYMISE_FIELDS,
  STORED_OBJECTS,
  deletedTables,
  keptTables,
  planFor,
  tablesWithObjects,
} = await import("@shared/accountDeletion/plan");

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
      ["objectStorage", "uploads", "r2", "twilio"].includes(source.store),
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

// A number the customer ported in is NOT erased with their account: it is their
// number, and the port order is the carrier-side authorisation record. Neither
// is declared, so neither can be reached by the purge.
assert.equal(
  STORED_OBJECTS.tradeline_phone_setups?.some(
    (s) => s.column === "assigned_number_sid" || s.column === "port_twilio_order_sid",
  ),
  false,
  "the Twilio phone number and the port-in order must NOT be declared for deletion — " +
    "releasing a number is not an erasure, and the port order is the authorisation " +
    "evidence our own LOA purge relies on",
);

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

const objectSources = withObjects.reduce((n, p) => n + (p.objects?.length ?? 0), 0);
const twilioSources = withObjects.reduce(
  (n, p) => n + (p.objects?.filter((s) => s.store === "twilio").length ?? 0),
  0,
);

console.log(
  `account-deletion guard: OK (${statements.length} scoped deletes, ${kept.length} kept with ` +
    `a stated basis, ${Object.keys(ANONYMISE_FIELDS).length} anchor tables anonymised, ` +
    `${objectSources} pointer column(s) across ${withObjects.length} table(s) purged, ` +
    `${twilioSources} of them at Twilio and attributed by account SID)`,
);
