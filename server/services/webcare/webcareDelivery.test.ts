/**
 * Regression guard: WebCare must not claim work it did not do.
 *
 * WHAT THIS PROTECTS
 * ------------------
 * WebCare is a $79–$129/mo recurring product. Its portal shipped five
 * "1-click actions" that were pure theatre: each wrote a reassuring row to
 * the customer's maintenance log and performed no work whatsoever.
 * "Backup now" logged *"Backup queued. The backup timeline will show a new
 * green dot when it completes"* — with no backup job anywhere in the
 * codebase, so the dot never came. "Clean malware" logged *"our team will
 * confirm and clean any findings within 4 hours"* with no scan and no team
 * process. "Harden security" logged *"Enabled recommended hardening: 2FA,
 * login throttling, file-edit lockdown"*. Each also wrote a fabricated
 * `technical_summary` naming a function that does not exist
 * (`queue_backup(on_demand=true)`).
 *
 * The central invariant, stated once:
 *
 *   A STATUS MAY NOT CLAIM "BACKED UP" WITHOUT AN ARTIFACT.
 *
 * It is enforced in three independent places, and this guard checks all
 * three so removing any one of them fails CI:
 *
 *   1. The database  — migration 0100's CHECK constraint makes
 *      status='success' illegal unless object_name + sha256 + size_bytes
 *      are all present.
 *   2. The capture path — backupService only writes 'success' after a
 *      verified upload, and re-checks the sha256 on the way back out.
 *   3. The read path — dashboardKpis derives the backup strip from the
 *      real table, never from a metadata key nothing writes.
 *
 * Source-level assertions (no DB), so it runs in the DB-less CI `gate` job
 * alongside the sibling dashboardKpis guard.
 *
 * Deliberate-failure fixture at the bottom: the guard is itself tested by
 * running its own logic against a mutated copy of each source file, so a
 * guard that has quietly stopped asserting anything is caught too.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..", "..", "..");

const read = (...p: string[]) => readFileSync(join(repo, ...p), "utf8");

const migration = read("migrations", "0100_webcare_backups_and_malware_scans.sql");
const backupService = read("server", "services", "webcare", "backupService.ts");
const scanner = read("server", "services", "webcare", "malwareScanner.ts");
const runners = read("server", "services", "webcare", "runners.ts");
const handler = read("server", "services", "aiActions", "handlers", "webcare.ts");
const registry = read("shared", "aiActions", "actionRegistry.ts");
const kpis = read("server", "routes", "portal", "webcare", "dashboardKpis.ts");
const pricing = read("shared", "pricing.ts");
const worker = read("server", "jobs", "webcareBackupWorker.ts");

let checks = 0;
const ok = (cond: boolean, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};

/**
 * Strip comment lines. Several of these assertions look for a phrase that
 * must not appear in shipping code — and the very files being checked
 * document those phrases in their headers as the defect they removed. Only
 * live code counts as a reintroduction.
 */
const codeOnly = (src: string) =>
  src
    .split("\n")
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .join("\n");

/* ─── 1. The DB refuses a success without an artifact ────────────────── */

ok(
  /CONSTRAINT\s+webcare_backups_success_needs_artifact\s+CHECK/i.test(migration),
  "REGRESSION: migration 0100 no longer defines the webcare_backups_success_needs_artifact CHECK. " +
    "Without it a row can claim status='success' with no stored archive — a site reported as backed up that is not.",
);
for (const col of ["object_name", "sha256", "size_bytes"]) {
  ok(
    new RegExp(`status\\s*<>\\s*'success'[\\s\\S]{0,240}${col}\\s+IS\\s+NOT\\s+NULL`, "i").test(migration),
    `REGRESSION: the webcare_backups CHECK no longer requires ${col} for status='success'. ` +
      "All three of object_name/sha256/size_bytes must be present or the 'backed up' claim is unbacked.",
  );
}

/* ─── 2. The capture path only reports success after a real upload ───── */

ok(
  /const\s+upload\s*=\s*await\s+uploadEncryptedBuffer\([\s\S]{0,400}?if\s*\(!upload\.ok\)\s*\{[\s\S]{0,200}?return\s+await\s+fail\(/.test(
    backupService,
  ),
  "REGRESSION: captureBackup no longer fails the row when the object-storage upload fails. " +
    "A failed upload must produce status='failed', never a success with no artifact behind it.",
);
ok(
  /createHash\("sha256"\)/.test(backupService) &&
    /actual\s*!==\s*row\.sha256/.test(backupService),
  "REGRESSION: fetchBackupArchive no longer verifies the stored sha256 before handing bytes to a restore. " +
    "A backup we cannot verify is not a backup.",
);
ok(
  /totalItems\s*===\s*0\s*&&\s*!site/.test(backupService),
  "REGRESSION: captureBackup will now store an archive that captured NOTHING and call it a success. " +
    "A capture where every collection failed must be recorded as failed.",
);

/* ─── 3. The read path uses the real table ───────────────────────────── */

ok(
  !kpis.includes("csMeta.webcare_backups"),
  "REGRESSION: dashboardKpis reads csMeta.webcare_backups again — nothing writes that metadata key. " +
    "The backup strip must come from the webcare_backups table.",
);
ok(
  /\.from\(webcareBackups\)/.test(kpis),
  "REGRESSION: dashboardKpis no longer queries the webcare_backups table for the 30-day strip.",
);

/* ─── 4. No canned 'we did it' strings for work nothing performs ─────── */

/**
 * The exact phrasings the removed facade shipped. Any of them reappearing
 * anywhere in the WebCare action path means the theatre is back.
 */
const FABRICATED = [
  "Backup queued",
  "queue_backup(",
  "queue_malware_scan_and_clean()",
  "apply_hardening_profile(",
  "queue_perf_optimize(",
  "queue_wp_cli_update_all(",
  "our team will confirm and clean",
  "Security grade re-checked within 15 minutes",
  "next Lighthouse score updates within an hour",
  "will show a new green dot when it completes",
];
for (const phrase of FABRICATED) {
  for (const [name, src] of [
    ["handlers/webcare.ts", handler],
    ["webcare/runners.ts", runners],
    ["actionRegistry.ts", registry],
  ] as const) {
    // The handler's header documents these strings as the removed defect.
    // Only non-comment lines count as a reintroduction.
    const offending = codeOnly(src).includes(phrase);
    ok(
      !offending,
      `REGRESSION: ${name} contains the fabricated status string ${JSON.stringify(phrase)} in live code. ` +
        "WebCare actions must report work that actually happened, in the past tense, after it happened.",
    );
  }
}

/* ─── 5. Undeliverable actions stay deleted ──────────────────────────── */

for (const dead of ["harden-security", "optimize-performance", "clean-malware"]) {
  ok(
    !new RegExp(`key:\\s*["']${dead}["']`).test(registry),
    `REGRESSION: the "${dead}" action is registered again. It reports work the product cannot perform ` +
      "(the WordPress REST API cannot install plugins or edit wp-config.php; no Lighthouse or image " +
      "pipeline exists; there is no 4-hour remediation process). Deliver it or leave it out.",
  );
}

/* ─── 6. Every remaining action routes to real work ──────────────────── */

for (const [action, runner] of [
  ["run-backup-now", "runBackupNow"],
  ["scan-malware", "runMalwareScanNow"],
  ["apply-all-pending-updates", "runApplyUpdatesNow"],
] as const) {
  ok(
    handler.includes(`"${action}"`) && handler.includes(runner),
    `REGRESSION: the "${action}" action no longer dispatches to ${runner}. ` +
      "Every WebCare action must invoke the real runner, not return a message on its own.",
  );
}
ok(
  /await\s+captureBackup\(/.test(runners) && /await\s+scanSite\(/.test(runners),
  "REGRESSION: the runners no longer call captureBackup/scanSite. The actions would report success without working.",
);

/* ─── 7. A failed scan is never stored as a clean pass ───────────────── */

ok(
  /if\s*\(!res\.ok\)[\s\S]{0,400}?status:\s*"failed"/.test(runners),
  "REGRESSION: runMalwareScanNow no longer records a failed scan as status='failed'. " +
    "A scan that could not run must never persist as a success with zero findings — that reads to the " +
    "customer as a clean bill of health for a check that never happened.",
);
const scannerCode = codeOnly(scanner);
ok(
  /No known malware signatures matched/.test(scannerCode) && !/your site is clean/i.test(scannerCode),
  "REGRESSION: the scanner summary now claims the site is clean. It checks a sample of URLs and core " +
    "files; 'no known signatures matched' is the claim it can support, and the scope must stay stated.",
);
ok(
  /Scanned \$\{scope\}/.test(scannerCode),
  "REGRESSION: summariseScan no longer states its own coverage. '0 findings' from 8 URLs is a much " +
    "narrower claim than a clean site, and the customer must be able to see which one they are being told.",
);

/* ─── 8. Marketing copy sells only what runs ─────────────────────────── */

ok(
  !/Monthly performance checks/.test(codeOnly(pricing)),
  "REGRESSION: the WebCare Pro tier sells 'Monthly performance checks' again. Nothing measures " +
    "performance — dashboardKpis returns a hardcoded null performanceScore — so the claim is unbacked.",
);
ok(
  /performanceScore\s*=\s*null/.test(kpis),
  "REGRESSION: performanceScore is no longer hardcoded null. If a real measurement was added, update " +
    "this guard and the pricing copy together; if not, it must stay null rather than render a number.",
);
ok(
  /Weekly content backups/.test(pricing) && /Weekly malware scan/.test(pricing),
  "REGRESSION: the WebCare copy no longer lists the backup/malware capabilities that now genuinely run.",
);
// Cadence must match the cron. The worker runs Sunday 02:00 UTC.
ok(
  !/nightly/i.test(read("shared", "notifications", "eventRegistry.ts").split("webcare")[1] ?? ""),
  "REGRESSION: WebCare notification copy says 'nightly' again. The backup worker runs WEEKLY.",
);
ok(
  /cron:?\s*.{0,40}|WEEKLY/i.test(worker) && /last_backup_week/.test(worker),
  "REGRESSION: the backup worker lost its per-week idempotency key.",
);

/* ─── 9. Deliberate-failure fixture ──────────────────────────────────── */

/**
 * Prove the guard actually catches the regression it describes, rather than
 * passing because its patterns no longer match anything. Each case mutates a
 * source string the way the defect would and asserts the corresponding check
 * flips to failing.
 */
function mustDetect(name: string, shouldFail: () => void) {
  let threw = false;
  try {
    shouldFail();
  } catch {
    threw = true;
  }
  assert.ok(
    threw,
    `GUARD IS BLIND: the "${name}" fixture reintroduced the defect and this guard did not notice. ` +
      "Fix the assertion — a guard that cannot fail protects nothing.",
  );
}

// 9a. CHECK constraint stripped from the migration.
mustDetect("dropped CHECK constraint", () => {
  const mutated = migration.replace(/CONSTRAINT\s+webcare_backups_success_needs_artifact\s+CHECK/i, "-- removed");
  assert.ok(
    /CONSTRAINT\s+webcare_backups_success_needs_artifact\s+CHECK/i.test(mutated),
    "detected",
  );
});

// 9b. Upload failure no longer fails the row → success with no artifact.
mustDetect("success without artifact", () => {
  const mutated = backupService.replace(
    /if\s*\(!upload\.ok\)\s*\{[\s\S]*?\}/,
    "if (!upload.ok) { /* swallowed */ }",
  );
  assert.ok(
    /const\s+upload\s*=\s*await\s+uploadEncryptedBuffer\([\s\S]{0,400}?if\s*\(!upload\.ok\)\s*\{[\s\S]{0,200}?return\s+await\s+fail\(/.test(
      mutated,
    ),
    "detected",
  );
});

// 9c. The canned "Backup queued" string returns to live handler code.
mustDetect("canned status string", () => {
  const mutated = handler.replace(
    "const outcome = await runner[action.key as RealAction]();",
    'const outcome = { ok: true, message: "Backup queued. The backup timeline will show a new green dot when it completes." };',
  );
  const offending = mutated
    .split("\n")
    .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
    .some((l) => l.includes("Backup queued"));
  assert.ok(!offending, "detected");
});

// 9d. A removed undeliverable action is re-registered.
mustDetect("undeliverable action re-added", () => {
  const mutated = registry.replace('key: "scan-malware"', 'key: "harden-security"');
  assert.ok(!/key:\s*["']harden-security["']/.test(mutated), "detected");
});

// 9e. KPI route goes back to the phantom metadata key.
mustDetect("phantom metadata key", () => {
  const mutated = kpis.replace(".from(webcareBackups)", ".from(csMeta.webcare_backups)");
  assert.ok(/\.from\(webcareBackups\)/.test(mutated), "detected");
});

// 9f. Pricing re-adds the unmeasured performance claim.
mustDetect("unbacked pricing claim", () => {
  const mutated = pricing.replace(
    "On-demand backups & malware scans, any time",
    "Monthly performance checks",
  );
  assert.ok(!/Monthly performance checks/.test(mutated), "detected");
});

// 9g. A failed scan is stored as a success.
mustDetect("failed scan stored as success", () => {
  const mutated = runners.replace(/status:\s*"failed"/g, 'status: "success"');
  assert.ok(/if\s*\(!res\.ok\)[\s\S]{0,400}?status:\s*"failed"/.test(mutated), "detected");
});

console.log(
  `✓ WebCare delivery honesty guard: ${checks} assertions + 7 deliberate-failure fixtures all passed`,
);
