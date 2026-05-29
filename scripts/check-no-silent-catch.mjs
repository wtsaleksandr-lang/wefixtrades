#!/usr/bin/env node
/**
 * Wave 117 — silent-catch guard.
 *
 * Walks every .ts / .mjs / .js file under server/ and scripts/, finds
 * bare empty catches that swallow errors without surfacing them, and
 * reports any that aren't in the baseline.
 *
 * Why: Wave 92 + 92.5 (waves 106, 108, 109, 111, 113, 114, 115)
 * retrofitted all 21 medium-risk `.catch(() => {})` swallow patterns
 * with `noisyCatch` from server/lib/silentFailureGuard.ts. This guard
 * exists so future contributors (human + agent) can't reintroduce the
 * pattern in NEW code paths — it would surface at PR-time instead of
 * audit-time.
 *
 * Patterns detected:
 *   .catch(() => {})              — empty arrow swallow
 *   .catch(() => undefined)       — explicit undefined, same effect
 *   .catch(() => null)            — explicit null, same effect
 *   .catch(() => void 0)          — same
 *   .catch(_ => {})               — common variant with unused param
 *   .catch((_) => {})             — same with parens
 *   .catch((err) => {})           — unused err param + empty body
 *   } catch {}                    — totally empty catch block
 *   } catch (e) {}                — same with unused exception
 *
 * Allowed even without baseline (clearly-non-silent patterns):
 *   .catch(() => ({}))            — body-parse fallback (returns a value)
 *   .catch(() => false)           — boolean-return guard pattern
 *   .catch(() => "")              — string-return guard pattern
 *   .catch(() => [])              — array-return guard pattern
 *
 * Baseline strategy:
 *   scripts/silent-catch-baseline.txt holds the snapshot of existing
 *   tech debt — entries there are tolerated. NEW violations introduced
 *   by future code changes fail. To clear an entry: refactor the line
 *   to use `noisyCatch(promise, { op: "<descriptive>" })` from
 *   server/lib/silentFailureGuard.ts, then remove the matching line
 *   from the baseline and re-run `npm run check:no-silent-catch`.
 *
 * Regenerate baseline:
 *   node scripts/check-no-silent-catch.mjs --write-baseline
 *
 * No new dependencies — Node stdlib only.
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["server", "scripts", "script"];
const BASELINE_FILE = "scripts/silent-catch-baseline.txt";
const WRITE_BASELINE = process.argv.includes("--write-baseline");

const toRel = (p) => relative(ROOT, p).replace(/\\/g, "/");

// ── File discovery ─────────────────────────────────────────────────────
function walk(dir, exts) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    const p = join(dir, entry);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...walk(p, exts));
    } else if (exts.some((e) => p.endsWith(e))) {
      out.push(p);
    }
  }
  return out;
}

// ── Patterns ──────────────────────────────────────────────────────────
// We scan per-line so file:line:col stays stable across edits.
//
// The .catch() patterns: match `.catch(` followed by either:
//   - an arrow with empty / no-op body: `() => {}`, `(_) => {}`,
//     `(err) => {}`, `() => undefined`, `() => null`, `() => void 0`
//   - an empty function expression: `function () {}` (rare but possible)
//
// Build the regex as a literal-string source so the captures stay
// readable. The trailing `\)` is required so we don't match the
// allow-listed `.catch(() => ({}))` pattern (which returns an object).
const SILENT_CATCH_PATTERNS = [
  // .catch(() => {})  — covers the bulk of the audit findings
  /\.catch\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/,
  // .catch(_ => {})  /  .catch((_) => {})  /  .catch((err) => {})
  /\.catch\s*\(\s*\(?\s*[a-zA-Z_$][\w$]*\s*\)?\s*=>\s*\{\s*\}\s*\)/,
  // .catch(() => undefined) / .catch(() => null) / .catch(() => void 0)
  /\.catch\s*\(\s*\(\s*\)\s*=>\s*(undefined|null|void\s+0)\s*\)/,
  // .catch(function () {})  — older style, rare
  /\.catch\s*\(\s*function\s*\(\s*\)\s*\{\s*\}\s*\)/,
];

// Empty `} catch {}` and `} catch (e) {}` blocks.
const EMPTY_CATCH_BLOCK_PATTERNS = [
  /\}\s*catch\s*\{\s*\}/,
  /\}\s*catch\s*\(\s*[a-zA-Z_$][\w$]*\s*\)\s*\{\s*\}/,
];

// Clearly-not-silent shapes that should NOT match the above. We've
// already excluded them in the regex above by requiring a literal
// `{}` body, but document the intent for the next reader.
//
//   .catch(() => ({}))            returns an object literal — allowed
//   .catch(() => false)           returns a boolean — allowed
//   .catch(() => "")              returns a string — allowed
//   .catch(() => [])              returns an array — allowed
//   .catch(err => log.warn(...))  has a real body — allowed

function scanFile(absPath) {
  const relPath = toRel(absPath);
  const src = readFileSync(absPath, "utf8");
  const lines = src.split(/\r?\n/);
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines so docs that mention `.catch(() => {})` as
    // an example don't trip the guard. Cheap heuristic — JS/TS only.
    const trimmed = line.trim();
    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("/*")
    ) {
      continue;
    }

    for (const pat of SILENT_CATCH_PATTERNS) {
      const m = line.match(pat);
      if (m) {
        violations.push({
          file: relPath,
          line: i + 1,
          col: (m.index ?? 0) + 1,
          snippet: m[0].replace(/\s+/g, " "),
          kind: "silent-catch",
        });
      }
    }

    for (const pat of EMPTY_CATCH_BLOCK_PATTERNS) {
      const m = line.match(pat);
      if (m) {
        violations.push({
          file: relPath,
          line: i + 1,
          col: (m.index ?? 0) + 1,
          snippet: m[0].replace(/\s+/g, " "),
          kind: "empty-catch-block",
        });
      }
    }
  }

  return violations;
}

// ── Run ──────────────────────────────────────────────────────────────
const all = [];
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs, [".ts", ".mjs", ".js"])) {
    // Skip declaration files and tests (tests legitimately use empty
    // catches to assert "this should not throw").
    if (file.endsWith(".d.ts")) continue;
    if (/[\\/](tests?|__tests__)[\\/]/.test(file)) continue;
    if (file.endsWith(".test.ts") || file.endsWith(".spec.ts")) continue;
    // Skip the guard primitive itself — it imports noisyCatch and
    // would self-reference.
    if (file.endsWith("silentFailureGuard.ts")) continue;
    // Skip THIS script — its error/help text literally types
    // `.catch(() => {})` as documentation so it can't be the subject
    // of its own scan.
    if (file.endsWith("check-no-silent-catch.mjs")) continue;
    all.push(...scanFile(file));
  }
}

// Stable, deterministic ordering for the baseline file.
all.sort((a, b) => {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  if (a.col !== b.col) return a.col - b.col;
  return a.snippet < b.snippet ? -1 : 1;
});

const fmt = (v) => `${v.file}:${v.line}:${v.col}\t${v.kind}\t${v.snippet}`;

if (WRITE_BASELINE) {
  const body =
    "# Wave 117 silent-catch baseline.\n" +
    "# Each entry is tolerated by check-no-silent-catch.mjs. To clear an entry:\n" +
    "# replace `.catch(() => {})` with `noisyCatch(promise, { op: \"...\" })`\n" +
    "# (server/lib/silentFailureGuard.ts), then delete the matching line here\n" +
    "# and re-run `node scripts/check-no-silent-catch.mjs` to confirm.\n" +
    "# Format: <file>:<line>:<col>\\t<kind>\\t<snippet>\n" +
    all.map(fmt).join("\n") +
    (all.length ? "\n" : "");
  writeFileSync(join(ROOT, BASELINE_FILE), body, "utf8");
  console.log(
    `Baseline written: ${BASELINE_FILE} (${all.length} entries)`,
  );
  process.exit(0);
}

// Load baseline.
const baselinePath = join(ROOT, BASELINE_FILE);
let baseline = new Set();
if (existsSync(baselinePath)) {
  const body = readFileSync(baselinePath, "utf8");
  for (const line of body.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    baseline.add(line);
  }
}

// Find new violations not in baseline.
const seen = new Set();
const newViolations = [];
for (const v of all) {
  const key = fmt(v);
  if (baseline.has(key)) continue;
  if (seen.has(key)) continue;
  seen.add(key);
  newViolations.push(v);
}

if (newViolations.length === 0) {
  console.log(
    `check:no-silent-catch — OK (${all.length} entries scanned, ${baseline.size} baselined, 0 new)`,
  );
  process.exit(0);
}

console.error(
  `check:no-silent-catch — FAIL: ${newViolations.length} new silent-catch violation(s):\n`,
);
for (const v of newViolations) {
  console.error(`  ${v.file}:${v.line}:${v.col}  ${v.snippet}`);
}
console.error(
  "\nReplace each .catch(() => {}) / empty catch block with " +
    "noisyCatch(promise, { op: '<descriptive>' }) from " +
    "server/lib/silentFailureGuard.ts. See Waves 106-115 for examples.\n" +
    "\nIf the silent catch is genuinely intentional (fs cleanup, " +
    "idempotency-after-success, body-parse fallback), refactor to a " +
    "clearly-not-silent shape:\n" +
    "  .catch(() => ({}))   — body-parse fallback\n" +
    "  .catch(() => false)  — boolean-return guard\n" +
    "Or, only as a last resort, regenerate the baseline:\n" +
    "  node scripts/check-no-silent-catch.mjs --write-baseline\n",
);
process.exit(1);
