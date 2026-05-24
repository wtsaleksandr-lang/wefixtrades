/**
 * CI guard — refuse any reference to GA4_MEASUREMENT_PROTOCOL_API_SECRET
 * (or its raw value) inside the client bundle.
 *
 * The GA4 Measurement Protocol API SECRET is server-only — it's the
 * shared secret that authenticates server-to-GA event posts. If it leaked
 * into the client bundle, anyone could spoof events into our analytics
 * property and corrupt funnel numbers.
 *
 * This script walks `client/**` (the only directory that gets bundled to
 * the browser) and fails the build if it sees:
 *
 *   - the literal env-var NAME `GA4_MEASUREMENT_PROTOCOL_API_SECRET`
 *     (any case)
 *   - any `process.env.GA4_MEASUREMENT_PROTOCOL_API_SECRET` access
 *   - any `import.meta.env.GA4_MEASUREMENT_PROTOCOL_API_SECRET` access
 *
 * The Measurement ID (G-XXXXXXX) is intentionally public and is NOT
 * checked here — gtag exposes it to every visitor by design.
 *
 * Wire in: `npm run check:no-mp-secret-in-client` and CI workflows.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CLIENT_DIR = join(ROOT, "client");

const FORBIDDEN_PATTERNS = [
  /GA4_MEASUREMENT_PROTOCOL_API_SECRET/i,
];

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  ".vite",
  ".turbo",
  ".next",
  "__snapshots__",
]);

const SCAN_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".html",
  ".css",
  ".json",
  ".md",
]);

/**
 * Recursively yield every file under `dir` matching SCAN_EXTENSIONS.
 */
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile()) {
      const dot = name.lastIndexOf(".");
      const ext = dot >= 0 ? name.slice(dot) : "";
      if (SCAN_EXTENSIONS.has(ext)) {
        yield full;
      }
    }
  }
}

const violations = [];

for (const file of walk(CLIENT_DIR)) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pat of FORBIDDEN_PATTERNS) {
    if (pat.test(text)) {
      const rel = relative(ROOT, file).split("\\").join("/");
      // Find line numbers for clearer reporting.
      const lines = text.split(/\r?\n/);
      const hits = [];
      for (let i = 0; i < lines.length; i++) {
        if (pat.test(lines[i])) hits.push(i + 1);
      }
      violations.push({ file: rel, pattern: pat.source, lines: hits });
    }
  }
}

if (violations.length > 0) {
  console.error(
    "\n[check:no-mp-secret-in-client] FAIL — GA4 Measurement Protocol secret reference found in client/**:\n",
  );
  for (const v of violations) {
    console.error(`  ${v.file}  (lines ${v.lines.join(", ")})  matched: /${v.pattern}/`);
  }
  console.error(
    "\nThe GA4 Measurement Protocol API SECRET is server-only. If a client file legitimately\n" +
      "needs to reference this name (e.g. a comment), exempt it explicitly here.\n",
  );
  process.exit(1);
}

console.log("[check:no-mp-secret-in-client] PASS — no MP secret references in client/**.");
