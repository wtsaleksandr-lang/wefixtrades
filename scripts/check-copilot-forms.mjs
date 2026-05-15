/**
 * Phase 1d — copilot form-fill CI guard.
 *
 * Every page under client/src/pages/{portal,admin} must EITHER:
 *   - call useCopilotForm() — so the AI copilot can fill its form, OR
 *   - be listed in scripts/copilot-form-exempt.txt — because it has no
 *     fillable form (a dashboard, list, read-only view) or is deliberately
 *     excluded (e.g. a password form).
 *
 * This forces a conscious decision on every NEW page. Run in CI after tsc.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PAGE_DIRS = ["client/src/pages/portal", "client/src/pages/admin"];
const EXEMPT_FILE = "scripts/copilot-form-exempt.txt";

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const toRel = (p) => relative(ROOT, p).replace(/\\/g, "/");

// ── Load the exemption list ──
const exemptPath = join(ROOT, EXEMPT_FILE);
if (!existsSync(exemptPath)) {
  console.error(`✖ Missing ${EXEMPT_FILE}`);
  process.exit(1);
}
const exempt = new Set(
  readFileSync(exemptPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#")),
);

// ── Scan the page files ──
let wiredCount = 0;
const offenders = [];   // unwired + unexempt — hard fail
const staleWired = [];  // exempt AND wired — exempt entry should be removed
const seenExempt = new Set();

for (const dir of PAGE_DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const rel = toRel(file);
    const src = readFileSync(file, "utf8");
    const wired = src.includes("useCopilotForm");
    const isExempt = exempt.has(rel);
    if (isExempt) seenExempt.add(rel);
    if (wired) wiredCount++;
    if (!wired && !isExempt) offenders.push(rel);
    if (wired && isExempt) staleWired.push(rel);
  }
}

// Exempt entries that no longer point at a real file.
const staleMissing = [...exempt].filter((e) => !seenExempt.has(e) && !offenders.includes(e));

let failed = false;

if (offenders.length > 0) {
  failed = true;
  console.error("\n✖ Copilot form-fill guard failed.\n");
  console.error("These page files call neither useCopilotForm() nor are exempt:");
  offenders.forEach((f) => console.error("  - " + f));
  console.error("\nFix one of:");
  console.error("  • If the page has an editable form — call useCopilotForm({...}) in it");
  console.error("    so the AI copilot can fill it (see CopilotFormContext.tsx).");
  console.error(`  • If the page has no fillable form — add its path to ${EXEMPT_FILE}`);
  console.error("    with a one-line reason.\n");
}

if (staleWired.length > 0) {
  failed = true;
  console.error("✖ These files are exempt but now call useCopilotForm() — remove them");
  console.error(`  from ${EXEMPT_FILE}:`);
  staleWired.forEach((f) => console.error("  - " + f));
  console.error("");
}

if (staleMissing.length > 0) {
  failed = true;
  console.error(`✖ These ${EXEMPT_FILE} entries point at files that no longer exist:`);
  staleMissing.forEach((f) => console.error("  - " + f));
  console.error("");
}

if (failed) process.exit(1);

console.log(
  `✓ Copilot form-fill guard passed — ${wiredCount} wired, ${seenExempt.size} exempt.`,
);
