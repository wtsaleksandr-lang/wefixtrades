#!/usr/bin/env node
/**
 * LAYOUT-2 — layout rules guard.
 *
 * Walks every .tsx and .css file under client/src/ and shared/, and reports
 * VIOLATIONS of three rules designed to prevent the common visual failures
 * that show up as "crumpled" or "overlapping" UI in customer-facing screens.
 *
 *   Rule A — Excessive spacing inside input clusters.
 *     Inside an element marked [data-input-cluster] / class .qq-input-cluster,
 *     stacked inputs must sit at most 2-4px apart. Tailwind space-y-3+ /
 *     gap-3+ tokens are too loose. Inline marginTop/marginBottom > 8 on a
 *     direct child of an input cluster is also flagged.
 *     Inside [data-section] / .qq-section, max 16px (gap-4 / space-y-4) is
 *     OK; gap-6/space-y-6 and above are flagged.
 *
 *   Rule B — Multiple help cues in the same parent block.
 *     More than one of <InfoCue>, <FieldHelpCue>, <HelpCue>, <HelpTip> in
 *     the same JSX block (between matched <div>...</div>) creates cue
 *     density. Escape hatch: parent attribute data-cue-allowed-multiple.
 *
 *   Rule C — Raw icon size literals outside the semantic ladder.
 *     <svg width={N} height={N}>, Lucide `size={N}`, and Tailwind w-N/h-N
 *     utilities must use one of {12,14,16,20,24,32}. Brand logo files are
 *     allowlisted (see ALLOWLIST_PREFIXES).
 *
 * Baseline strategy mirrors CONTRAST-2: scripts/layout-violations-baseline.txt
 * holds the snapshot of existing tech debt; entries there are tolerated; NEW
 * violations fail the build.
 *
 * Regenerate baseline (only on the PR that introduces this script):
 *   node scripts/check-layout-rules.mjs --write-baseline
 *
 * No new dependencies — Node built-ins only. Target runtime < 10s.
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["client/src", "shared"];
const BASELINE_FILE = "scripts/layout-violations-baseline.txt";
const WRITE_BASELINE = process.argv.includes("--write-baseline");

// ── Allowlist ────────────────────────────────────────────────────────────
// Only add files here when they GENUINELY need raw sizes — typically full
// brand lockups, third-party icons, or animation/effect components where
// the size is intrinsic to the visual design.
const ALLOWLIST = new Set([
  "client/src/components/marketing/AnimatedLogo.tsx",
  "client/src/components/primitives/Logo.tsx",
  "client/src/components/quote-widget/PremiumAnimations.tsx",
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

// ── Rule A — spacing inside input clusters / sections ────────────────────
//
// Tailwind tokens we treat as "loose" inside an input cluster. The escape
// hatch is to remove the data-input-cluster marker, or tighten the gap.
const CLUSTER_LOOSE_CLASSES = [
  "space-y-3",
  "space-y-4",
  "space-y-5",
  "space-y-6",
  "space-y-8",
  "space-y-10",
  "gap-3",
  "gap-4",
  "gap-5",
  "gap-6",
  "gap-8",
];
// Inside [data-section] / .qq-section we permit up to gap-4 / space-y-4.
const SECTION_LOOSE_CLASSES = [
  "space-y-6",
  "space-y-8",
  "space-y-10",
  "gap-6",
  "gap-8",
];

const CLUSTER_RE = new RegExp(
  "(?<![\\w-])(" + CLUSTER_LOOSE_CLASSES.join("|") + ")(?![\\w-/:])",
  "g",
);
const SECTION_RE = new RegExp(
  "(?<![\\w-])(" + SECTION_LOOSE_CLASSES.join("|") + ")(?![\\w-/:])",
  "g",
);

const CLUSTER_OPEN_RE = /data-input-cluster|className=["'`][^"'`]*\bqq-input-cluster\b/;
const SECTION_OPEN_RE = /data-section|className=["'`][^"'`]*\bqq-section\b/;
const CLOSE_DIV_RE = /<\/(div|section|form|fieldset)>/;

// Detect whether the given line index sits inside an [data-input-cluster] or
// .qq-input-cluster element. Approximation: scan upward, count opening vs
// closing <div>-family tags. If the most recent unclosed open tag carries
// the marker, return "cluster". Same logic for [data-section] / .qq-section
// returns "section". Otherwise null. False negatives are acceptable; false
// positives are not (we err on the side of letting things through).
function detectContainerKind(lines, idx) {
  let depth = 0;
  let mode = null;
  for (let i = idx - 1; i >= 0; i--) {
    const line = lines[i];
    // Count tag openings/closings to skip already-closed siblings above.
    // We count each opening <div|section|form|fieldset (without leading /)
    // as +1 and each </…> as -1; when depth goes negative we found an
    // ancestor open tag.
    const opens = (line.match(/<(div|section|form|fieldset)\b/g) || []).length;
    const closes = (line.match(/<\/(div|section|form|fieldset)>/g) || []).length;
    depth += closes - opens;
    if (depth < 0) {
      // We just walked into an ancestor open tag on this line.
      if (CLUSTER_OPEN_RE.test(line)) return "cluster";
      if (SECTION_OPEN_RE.test(line)) return "section";
      // Ancestor open tag without a relevant marker — keep walking outward.
      depth = 0;
    }
  }
  return mode;
}

function scanRuleA(lines, relPath) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/space-y-|gap-/.test(line)) continue;
    const kind = detectContainerKind(lines, i);
    if (!kind) continue;
    const re = kind === "cluster" ? CLUSTER_RE : SECTION_RE;
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      // Cheap classname-context guard, same idea as CONTRAST-2.
      const ctxStart = Math.max(0, m.index - 80);
      const ctxEnd = Math.min(line.length, m.index + 80);
      const ctx = line.slice(ctxStart, ctxEnd);
      if (!/className|class=|\bcn\(|\bclsx\(|\bcva\(/.test(ctx)) continue;
      out.push({
        file: relPath,
        line: i + 1,
        col: m.index + 1,
        kind: "rule-a",
        snippet: `${kind}: ${m[1]}`,
      });
    }
  }
  return out;
}

// ── Rule B — multiple help cues in the same JSX block ────────────────────
//
// We work per <div>...</div> (or section/form/fieldset) block. The block
// boundary is found by counting tag depth. Inside each block at depth 1
// relative to the block root, count cue components. >1 = violation, unless
// the block's opening tag carries data-cue-allowed-multiple.
const CUE_TAGS = ["InfoCue", "FieldHelpCue", "HelpCue", "HelpTip"];
const CUE_RE = new RegExp(
  "<(?:" + CUE_TAGS.join("|") + ")\\b",
  "g",
);

function scanRuleB(lines, relPath) {
  const out = [];
  // For each line containing a parent open tag (div|section|form|fieldset),
  // scan forward until the matching close. Within that range, count cues.
  // We only flag the OUTERMOST violating block to avoid double-reporting.
  const text = lines.join("\n");
  const openRe = /<(div|section|form|fieldset)\b([^>]*)>/g;
  const consumed = new Set();
  let openMatch;
  while ((openMatch = openRe.exec(text)) !== null) {
    const startOffset = openMatch.index;
    if (consumed.has(startOffset)) continue;
    const tag = openMatch[1];
    const attrs = openMatch[2];
    if (/data-cue-allowed-multiple/.test(attrs)) continue;

    // Walk forward, tracking depth on this tag family, until depth returns
    // to 0 — that's the matching close. We deliberately limit to ~10000
    // chars after the open to keep this O(n) per block in practice.
    const slice = text.slice(openMatch.index + openMatch[0].length);
    const tagOpenRe = new RegExp(`<${tag}\\b`, "g");
    const tagCloseRe = new RegExp(`</${tag}>`, "g");
    let depth = 1;
    let cursor = 0;
    const max = Math.min(slice.length, 200000);
    while (cursor < max && depth > 0) {
      tagOpenRe.lastIndex = cursor;
      tagCloseRe.lastIndex = cursor;
      const nextOpen = tagOpenRe.exec(slice);
      const nextClose = tagCloseRe.exec(slice);
      if (!nextClose) break;
      if (nextOpen && nextOpen.index < nextClose.index) {
        depth++;
        cursor = nextOpen.index + nextOpen[0].length;
      } else {
        depth--;
        cursor = nextClose.index + nextClose[0].length;
        if (depth === 0) break;
      }
    }
    const blockEnd = openMatch.index + openMatch[0].length + cursor;
    const block = text.slice(openMatch.index + openMatch[0].length, blockEnd);

    // Count cues at depth-1 only. Approximation: count ALL cues in the
    // block — child blocks with their own data-cue-allowed-multiple are
    // re-checked when openRe reaches them; non-allowed nested blocks would
    // also flag separately when we reach them, which is correct.
    //
    // To stop the OUTER block from double-counting cues that belong to a
    // smaller INNER allowed block, subtract cues inside any nested
    // data-cue-allowed-multiple tag.
    const cueMatches = [...block.matchAll(CUE_RE)];
    if (cueMatches.length <= 1) continue;

    // Subtract cues inside nested allowed blocks.
    const allowedNestedRe = /<(div|section|form|fieldset)\b[^>]*data-cue-allowed-multiple[^>]*>/g;
    let allowedCount = 0;
    let am;
    while ((am = allowedNestedRe.exec(block)) !== null) {
      const innerTag = am[1];
      const innerSlice = block.slice(am.index + am[0].length);
      const iOpenRe = new RegExp(`<${innerTag}\\b`, "g");
      const iCloseRe = new RegExp(`</${innerTag}>`, "g");
      let iDepth = 1;
      let iCursor = 0;
      while (iCursor < innerSlice.length && iDepth > 0) {
        iOpenRe.lastIndex = iCursor;
        iCloseRe.lastIndex = iCursor;
        const no = iOpenRe.exec(innerSlice);
        const nc = iCloseRe.exec(innerSlice);
        if (!nc) break;
        if (no && no.index < nc.index) {
          iDepth++;
          iCursor = no.index + no[0].length;
        } else {
          iDepth--;
          iCursor = nc.index + nc[0].length;
          if (iDepth === 0) break;
        }
      }
      const inner = innerSlice.slice(0, iCursor);
      allowedCount += (inner.match(CUE_RE) || []).length;
    }
    const effective = cueMatches.length - allowedCount;
    if (effective <= 1) continue;

    // Convert openMatch.index to line/col.
    const before = text.slice(0, openMatch.index);
    const lineNo = before.split(/\n/).length;
    const lastNl = before.lastIndexOf("\n");
    const col = lastNl === -1 ? openMatch.index + 1 : openMatch.index - lastNl;
    out.push({
      file: relPath,
      line: lineNo,
      col,
      kind: "rule-b",
      snippet: `<${tag}> contains ${effective} cues`,
    });
    // Mark inner opens consumed so we don't double-report them.
    let inner;
    const innerOpenRe = new RegExp(`<(?:div|section|form|fieldset)\\b`, "g");
    innerOpenRe.lastIndex = openMatch.index + openMatch[0].length;
    while ((inner = innerOpenRe.exec(text)) !== null) {
      if (inner.index >= blockEnd) break;
      consumed.add(inner.index);
    }
  }
  return out;
}

// ── Rule C — raw icon size literals ──────────────────────────────────────
const ALLOWED_ICON_SIZES = new Set([12, 14, 16, 20, 24, 32]);

// <svg width={N} height={N}> with N a literal integer.
const SVG_WH_RE = /<svg\b[^>]*\bwidth=\{(\d+)\}[^>]*\bheight=\{(\d+)\}/g;
// <svg style={{ width: N, height: N }}> — also accept reversed order.
const SVG_STYLE_RE = /<svg\b[^>]*\bstyle=\{\{[^}]*\b(?:width|height)\s*:\s*(\d+)[^}]*\}\}/g;
// Lucide-style: size={N} on a JSX element.
const LUCIDE_SIZE_RE = /\bsize=\{(\d+)\}/g;
// Tailwind w-N / h-N detection runs per-className-string inline in scanRuleC
// (we require w-N and h-N to be square and on the same className to count
// as an icon-size violation).

function scanRuleC(lines, relPath) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let m;
    SVG_WH_RE.lastIndex = 0;
    while ((m = SVG_WH_RE.exec(line)) !== null) {
      const w = Number(m[1]);
      const h = Number(m[2]);
      if (!ALLOWED_ICON_SIZES.has(w) || !ALLOWED_ICON_SIZES.has(h)) {
        out.push({
          file: relPath,
          line: i + 1,
          col: m.index + 1,
          kind: "rule-c",
          snippet: `<svg width={${w}} height={${h}}>`,
        });
      }
    }

    SVG_STYLE_RE.lastIndex = 0;
    while ((m = SVG_STYLE_RE.exec(line)) !== null) {
      const v = Number(m[1]);
      if (!ALLOWED_ICON_SIZES.has(v)) {
        out.push({
          file: relPath,
          line: i + 1,
          col: m.index + 1,
          kind: "rule-c",
          snippet: `<svg style width/height ${v}`,
        });
      }
    }

    LUCIDE_SIZE_RE.lastIndex = 0;
    while ((m = LUCIDE_SIZE_RE.exec(line)) !== null) {
      const v = Number(m[1]);
      if (!ALLOWED_ICON_SIZES.has(v)) {
        // Cheap heuristic: only treat as Lucide-style size if context looks
        // JSX-ish. Skip strings inside non-JSX values.
        const before = line.slice(Math.max(0, m.index - 60), m.index);
        if (!/<[A-Z][\w]*\s|<[a-z]+\s/.test(before)) continue;
        out.push({
          file: relPath,
          line: i + 1,
          col: m.index + 1,
          kind: "rule-c",
          snippet: `size={${v}}`,
        });
      }
    }

    // Tailwind w-N/h-N: only flag when BOTH w-N and h-N appear on the SAME
    // className string AND match each other (square = icon-shape). This is
    // the only reliable signal that the author meant "icon size" rather
    // than a button height or layout dimension. Steps outside the allowed
    // ladder {3, 3.5, 4, 5, 6, 8} are violations.
    const ICON_STEPS_OK = new Set(["3", "3.5", "4", "5", "6", "8"]);
    const CLASSNAME_STRING_RE = /className=\{?["'`]([^"'`]+)["'`]\}?|className=\{cn\(([^)]+)\)\}/g;
    CLASSNAME_STRING_RE.lastIndex = 0;
    while ((m = CLASSNAME_STRING_RE.exec(line)) !== null) {
      const classText = (m[1] || m[2] || "").toString();
      const wMatch = classText.match(/(?<![\w-])w-(\d+(?:\.\d+)?)(?![\w/.])/);
      const hMatch = classText.match(/(?<![\w-])h-(\d+(?:\.\d+)?)(?![\w/.])/);
      if (!wMatch || !hMatch) continue;
      const w = wMatch[1];
      const h = hMatch[1];
      if (w !== h) continue; // non-square = layout, not an icon
      if (ICON_STEPS_OK.has(w)) continue;
      out.push({
        file: relPath,
        line: i + 1,
        col: m.index + 1,
        kind: "rule-c",
        snippet: `square w-${w} h-${h}`,
      });
    }
  }
  return out;
}

// ── Scan ─────────────────────────────────────────────────────────────────
function scanFile(absPath) {
  const relPath = toRel(absPath);
  if (isAllowlisted(relPath)) return [];

  const src = readFileSync(absPath, "utf8");
  const lines = src.split(/\r?\n/);
  const isCss = absPath.endsWith(".css");

  const out = [];
  if (!isCss) {
    out.push(...scanRuleA(lines, relPath));
    out.push(...scanRuleB(lines, relPath));
    out.push(...scanRuleC(lines, relPath));
  }
  // CSS files: we only run rule A's pattern is largely Tailwind-only, and
  // rules B/C are JSX-only. Future expansion could add a CSS-side check for
  // raw width: 18px on svg selectors.
  return out;
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

all.sort((a, b) => {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  if (a.col !== b.col) return a.col - b.col;
  return a.snippet < b.snippet ? -1 : 1;
});

const fmt = (v) => `${v.file}:${v.line}:${v.col}\t${v.kind}\t${v.snippet}`;

if (WRITE_BASELINE) {
  const body =
    "# LAYOUT-2 baseline — existing layout-rule violations.\n" +
    "# Each entry is tolerated by check-layout-rules.mjs. To clear an entry:\n" +
    "# refactor the file so the rule passes, then delete the matching line\n" +
    "# here and re-run `npm run check:layout-rules` to confirm.\n" +
    "# Format: <file>:<line>:<col>\\t<kind>\\t<snippet>\n" +
    all.map(fmt).join("\n") +
    (all.length ? "\n" : "");
  writeFileSync(join(ROOT, BASELINE_FILE), body, "utf8");
  const byKind = all.reduce((acc, v) => {
    acc[v.kind] = (acc[v.kind] || 0) + 1;
    return acc;
  }, {});
  console.log(
    `Baseline written: ${BASELINE_FILE} (${all.length} entries — A:${byKind["rule-a"] || 0} B:${byKind["rule-b"] || 0} C:${byKind["rule-c"] || 0})`,
  );
  process.exit(0);
}

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
    `OK layout-rules guard: 0 new violations (${total} known, ${baselineCount} baselined).`,
  );
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

console.error(`✖ layout-rules guard: ${fresh.length} NEW violation${fresh.length === 1 ? "" : "s"}`);
console.error("");
for (const v of fresh) {
  console.error(`  ${v.file}:${v.line}:${v.col}  [${v.kind}]  ${v.snippet}`);
}
console.error("");
console.error("Fix:");
console.error("  rule-a  tighten input-cluster spacing (use space-y-1/space-y-2 or gap-1/gap-2).");
console.error("  rule-b  collapse multiple cues into one, or mark the parent");
console.error("          with data-cue-allowed-multiple (use sparingly).");
console.error("  rule-c  use a semantic icon size from {12,14,16,20,24,32}");
console.error("          (or, for w-N/h-N, one of w-3/3.5/4/5/6/8).");
console.error("Allowlist is for brand lockups and animation effects only —");
console.error("see top of scripts/check-layout-rules.mjs.");
process.exit(1);
