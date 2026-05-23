#!/usr/bin/env node
/**
 * CONTRAST-2 — hardcoded color guard.
 *
 * Walks every .tsx and .css file under client/src/ and shared/, scans for
 * raw #fff / #ffffff / white / #000 / #000000 / black uses as text or
 * background (CSS properties + JSX inline styles + Tailwind utility
 * classes), and reports VIOLATIONS that are NOT inside a [data-theme="..."]
 * scoped block or on an explicitly allowlisted file.
 *
 * Why: dark-mode / theme tokens already exist. Future contributors (humans
 * and agents) who hardcode bright-on-bright or dark-on-dark colors break
 * theme parity. This script makes that a CI failure.
 *
 * Baseline strategy:
 *   scripts/contrast-violations-baseline.txt holds the snapshot of existing
 *   tech debt — entries there are tolerated. NEW violations introduced by
 *   future code changes fail the build. To clear an entry: refactor the
 *   file to use theme tokens (or wrap in data-theme=...), then remove the
 *   matching lines from the baseline and re-run the script.
 *
 * Regenerate baseline (only on the first PR that introduces this script):
 *   node scripts/check-hardcoded-colors.mjs --write-baseline
 *
 * No new dependencies — Node built-ins only. Target runtime < 10s.
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["client/src", "shared"];
const BASELINE_FILE = "scripts/contrast-violations-baseline.txt";
const WRITE_BASELINE = process.argv.includes("--write-baseline");

// ── Allowlist ────────────────────────────────────────────────────────────
// Only add files here when you're SURE they don't need theme-aware colors.
// Brand assets, visual effects, contrast fallback library, and tests.
const ALLOWLIST = new Set([
  "client/src/components/marketing/AnimatedLogo.tsx",
  "client/src/components/quote-widget/PremiumAnimations.tsx",
  "client/src/lib/contrastGuard.ts",
]);
const ALLOWLIST_PREFIXES = ["tests/"];

const toRel = (p) => relative(ROOT, p).replace(/\\/g, "/");

function isAllowlisted(relPath) {
  if (ALLOWLIST.has(relPath)) return true;
  for (const prefix of ALLOWLIST_PREFIXES) {
    if (relPath.startsWith(prefix)) return true;
  }
  return false;
}

// ── File discovery ───────────────────────────────────────────────────────
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

// ── Patterns ─────────────────────────────────────────────────────────────
// Each pattern returns [{ line, col, snippet, value }] when matched against
// a single line of source. We run them per-line so reporting is precise.

// CSS / JSX-inline style color/background/border-color/outline-color = raw
// black/white. We match a leading property name then ':' then the value.
// JSX-style props use camelCase (backgroundColor, borderColor) so we cover
// both kebab and camel forms.
const COLOR_PROPS = [
  "color",
  "background",
  "background-color",
  "backgroundColor",
  "border-color",
  "borderColor",
  "outline-color",
  "outlineColor",
];
const RAW_VALUES = ["#fff", "#ffffff", "white", "#000", "#000000", "black"];
const RAW_VALUE_RE = new RegExp(
  "(?<![\\w-])(" +
    RAW_VALUES.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") +
    ")(?![\\w-])",
  "i",
);
const PROP_RE = new RegExp(
  "\\b(" + COLOR_PROPS.join("|") + ")\\s*:\\s*['\"]?" + RAW_VALUE_RE.source + "['\"]?",
  "gi",
);

// Tailwind utility classes. We deliberately match only the EXACT tokens
// (bg-white, text-black, etc.) — not bg-white/10 opacity variants, since
// those are intentional accents. If those show up later, tighten here.
const TAILWIND_CLASSES = [
  "bg-white",
  "bg-black",
  "text-white",
  "text-black",
  "border-white",
  "border-black",
];
const TAILWIND_RE = new RegExp(
  "(?<![\\w-])(" + TAILWIND_CLASSES.join("|") + ")(?![\\w-/:])",
  "g",
);

// ── data-theme scope detection ───────────────────────────────────────────
// For CSS: scan UP from the line, count brace depth. If the enclosing block
// header starts with [data-theme="dark"] or [data-theme="light"], allow.
// For TSX: scan UP for an open JSX tag with data-theme="dark"|"light" that
// has not been closed by a matching </Tag> before the violation line. This
// is approximate — we accept false negatives over false positives.

function isInsideCssThemeBlock(lines, idx, violationCol) {
  // Walk upward from the violation position, tracking brace depth. Each
  // time we find a "{" at depth==0 it opens an enclosing block — inspect
  // the text preceding it for a [data-theme="..."] selector. If found,
  // guarded=true. Otherwise keep walking outward (CSS supports nesting,
  // and some projects nest theme-scoped rules inside containers).
  //
  // On the first (violation) line we must only consider braces strictly
  // LEFT of the violation column, otherwise a closing brace later on the
  // same line spuriously cancels out the opening one (single-line rules
  // like `[data-theme="dark"] .x { color: white; }`).
  let depth = 0;
  for (let i = idx; i >= 0; i--) {
    const line = lines[i];
    const startCol = i === idx ? Math.min(violationCol, line.length) - 1 : line.length - 1;
    for (let c = startCol; c >= 0; c--) {
      const ch = line[c];
      if (ch === "}") depth++;
      else if (ch === "{") {
        if (depth === 0) {
          let selector = line.slice(0, c);
          for (let j = i - 1; j >= 0; j--) {
            if (/[{}]/.test(lines[j])) break;
            selector = lines[j] + " " + selector;
          }
          if (/\[data-theme=["'](?:dark|light)["']\]/.test(selector)) return true;
          // Not a theme block — but we may still be nested inside one.
          // Continue walking outward by "leaving" this block.
        } else {
          depth--;
        }
      }
    }
  }
  return false;
}

function isInsideJsxThemeScope(text, offset) {
  // Quick heuristic: is there an unclosed element above `offset` whose
  // opening tag carries data-theme="dark" or "light"? We look at the most
  // recent data-theme attribute occurrence; if it is in an opening tag and
  // not yet matched by a closing tag, treat as guarded.
  const before = text.slice(0, offset);
  const themeMatches = [...before.matchAll(/data-theme=["'](?:dark|light)["']/g)];
  if (themeMatches.length === 0) return false;
  // For simplicity assume any data-theme attribute defined earlier in the
  // SAME file guards the whole subtree below it. False negatives on closed
  // siblings are accepted — the prevailing pattern in this codebase puts
  // data-theme on a single top-level wrapper per file (see CONTRAST-1).
  return true;
}

// ── Scan ─────────────────────────────────────────────────────────────────
function scanFile(absPath) {
  const relPath = toRel(absPath);
  if (isAllowlisted(relPath)) return [];

  const src = readFileSync(absPath, "utf8");
  const lines = src.split(/\r?\n/);
  const isCss = absPath.endsWith(".css");
  const violations = [];
  // `lines` is produced via /\r?\n/ split, so the per-line content excludes
  // the line terminator. When reconstructing absolute character offsets into
  // `src` (for isInsideJsxThemeScope) we must add the actual terminator
  // length: 2 bytes on CRLF files, 1 on LF. Detecting once per file is fine
  // because mixed endings are rare and would only undershoot by ≤1 byte,
  // which the heuristic tolerates.
  const eolLen = src.includes("\r\n") ? 2 : 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment-only lines (CSS /* ... */ on one line, TSX // ...).
    const trimmed = line.trim();
    if (trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("/*") && trimmed.endsWith("*/")) continue;

    // Property : value matches.
    let m;
    PROP_RE.lastIndex = 0;
    while ((m = PROP_RE.exec(line)) !== null) {
      const matched = m[0];
      const value = m[2];
      const col = m.index;
      const guarded = isCss
        ? isInsideCssThemeBlock(lines, i, col + 1)
        : isInsideJsxThemeScope(
            src,
            lines.slice(0, i).reduce((a, l) => a + l.length + eolLen, 0) + col,
          );
      if (!guarded) {
        violations.push({
          file: relPath,
          line: i + 1,
          col: col + 1,
          value,
          snippet: matched.trim(),
          kind: "prop",
        });
      }
    }

    // Tailwind class matches (only meaningful in .tsx, but harmless in .css).
    if (!isCss) {
      TAILWIND_RE.lastIndex = 0;
      while ((m = TAILWIND_RE.exec(line)) !== null) {
        const cls = m[1];
        const col = m.index;
        // Restrict to lines that look like className context. Cheap test:
        // the surrounding 50 chars contain `className` OR `class=` OR
        // a `cn(`/`clsx(`/`cva(` call. This rules out comments + strings
        // that aren't classes.
        const ctxStart = Math.max(0, col - 80);
        const ctxEnd = Math.min(line.length, col + 80);
        const ctx = line.slice(ctxStart, ctxEnd);
        const looksLikeClass =
          /className|class=|\bcn\(|\bclsx\(|\bcva\(|\btw`|tw\s*\(/.test(ctx);
        if (!looksLikeClass) continue;
        const guarded = isInsideJsxThemeScope(
          src,
          lines.slice(0, i).reduce((a, l) => a + l.length + eolLen, 0) + col,
        );
        if (!guarded) {
          violations.push({
            file: relPath,
            line: i + 1,
            col: col + 1,
            value: cls,
            snippet: cls,
            kind: "tailwind",
          });
        }
      }
    }
  }

  return violations;
}

// ── Run ──────────────────────────────────────────────────────────────────
const all = [];
for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) continue;
  for (const file of walk(abs, [".tsx", ".css"])) {
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

// Serialize each violation as one line. Format must stay stable so the
// baseline diff is meaningful.
const fmt = (v) => `${v.file}:${v.line}:${v.col}\t${v.kind}\t${v.snippet}`;

if (WRITE_BASELINE) {
  const body =
    "# CONTRAST-2 baseline — existing hardcoded color violations.\n" +
    "# Each entry is tolerated by check-hardcoded-colors.mjs. To clear an\n" +
    "# entry: refactor the file to use a theme token (or wrap in a\n" +
    "# data-theme=... scope), then delete the matching line here and re-run\n" +
    "# `npm run check:hardcoded-colors` to confirm.\n" +
    "# Format: <file>:<line>:<col>\\t<kind>\\t<snippet>\n" +
    all.map(fmt).join("\n") +
    (all.length ? "\n" : "");
  writeFileSync(join(ROOT, BASELINE_FILE), body, "utf8");
  console.log(`Baseline written: ${BASELINE_FILE} (${all.length} entries)`);
  process.exit(0);
}

// Load baseline. Missing baseline = treat as empty (every violation fails).
const baselinePath = join(ROOT, BASELINE_FILE);
const baseline = new Set();
if (existsSync(baselinePath)) {
  for (const raw of readFileSync(baselinePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    baseline.add(line);
  }
}

const fresh = all.filter((v) => !baseline.has(fmt(v)));

if (fresh.length === 0) {
  const total = all.length;
  const baselineCount = baseline.size;
  console.log(
    `OK hardcoded-color guard: 0 new violations (${total} known, ${baselineCount} baselined).`,
  );
  // Detect stale baseline entries (in baseline but no longer present) and
  // warn — they signal completed cleanup that should be removed from the
  // baseline file. Non-fatal.
  const currentSet = new Set(all.map(fmt));
  const stale = [...baseline].filter((b) => !currentSet.has(b));
  if (stale.length) {
    console.log(
      `note: ${stale.length} baseline entr${stale.length === 1 ? "y is" : "ies are"} no longer present and can be deleted from ${BASELINE_FILE}:`,
    );
    for (const s of stale.slice(0, 20)) console.log(`  - ${s}`);
    if (stale.length > 20) console.log(`  ...and ${stale.length - 20} more`);
  }
  process.exit(0);
}

console.error(`✖ hardcoded-color guard: ${fresh.length} NEW violation${fresh.length === 1 ? "" : "s"}`);
console.error("");
for (const v of fresh) {
  console.error(`  ${v.file}:${v.line}:${v.col}  [${v.kind}]  ${v.snippet}`);
}
console.error("");
console.error("Fix: replace the raw color with a theme token (var(--*) /");
console.error("tailwind semantic class), or wrap the element/selector in a");
console.error('[data-theme="dark"] / [data-theme="light"] scope. Allowlist');
console.error("is for brand-locked assets only — see top of");
console.error("scripts/check-hardcoded-colors.mjs.");
process.exit(1);
