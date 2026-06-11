/**
 * Build-identity reader — healthz version stamp.
 *
 * `script/build.ts` writes `dist/build-info.json` at build time:
 *   { git_sha: "<short sha>", git_branch: "<branch>", built_at: "<ISO>" }
 *
 * This module reads it lazily (first call) and caches the result for the
 * process lifetime — the file can't change without a redeploy, and a redeploy
 * restarts the process.
 *
 * Path resolution mirrors server/static.ts: the production server is a CJS
 * bundle at dist/index.cjs, so `__dirname` IS the dist/ directory and
 * `path.resolve(__dirname, "build-info.json")` finds the stamp regardless of
 * the process cwd. In dev (tsx, ESM) the file simply doesn't exist next to
 * this module → version "dev". `typeof __dirname` guards the ESM case where
 * the identifier isn't defined at all.
 *
 * HARD CONTRACT: never throws. A missing, malformed, or wrong-shaped file
 * degrades to { version: "dev", built_at: null } — the healthz endpoint must
 * never 500 because of a bad stamp.
 */

import fs from "fs";
import path from "path";

export interface BuildInfo {
  /** Short git sha of the deployed build, or "dev" when unstamped. */
  version: string;
  /** ISO timestamp of when the build ran, or null when unstamped. */
  built_at: string | null;
  /** Branch the build was cut from (informational; absent when unknown). */
  git_branch?: string;
}

const UNSTAMPED: BuildInfo = { version: "dev", built_at: null };

let cached: BuildInfo | null = null;

/** Lazy + cached. Safe to call on every request — the fs read happens once. */
export function getBuildInfo(): BuildInfo {
  if (cached) return cached;
  cached = readBuildInfoFrom(defaultBuildInfoPath());
  return cached;
}

/**
 * Where the stamp lives next to the running bundle. Returns null when the
 * module-dir can't be determined (pure-ESM dev context without a __dirname
 * shim) — callers treat that as "unstamped".
 */
function defaultBuildInfoPath(): string | null {
  // typeof never throws on an undeclared identifier, unlike a bare reference.
  if (typeof __dirname !== "string") return null;
  return path.resolve(__dirname, "build-info.json");
}

/**
 * Parse one candidate stamp file. Exported so the standalone test
 * (tests/healthz-version.test.ts) can exercise present / absent / malformed
 * fixtures against temp paths without booting the server.
 */
export function readBuildInfoFrom(filePath: string | null): BuildInfo {
  if (!filePath) return UNSTAMPED;
  try {
    if (!fs.existsSync(filePath)) return UNSTAMPED;
    const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const record = parsed as Record<string, unknown>;
    const sha =
      record && typeof record.git_sha === "string" && record.git_sha.trim()
        ? record.git_sha.trim()
        : null;
    if (!sha) return UNSTAMPED;
    const built_at = typeof record.built_at === "string" ? record.built_at : null;
    const git_branch =
      typeof record.git_branch === "string" && record.git_branch.trim()
        ? record.git_branch.trim()
        : undefined;
    return { version: sha, built_at, ...(git_branch ? { git_branch } : {}) };
  } catch {
    // Malformed JSON / fs race / permission error — degrade to "dev" rather
    // than let a bad stamp take down the health endpoint.
    return UNSTAMPED;
  }
}

/** Test hook — clears the process-lifetime cache between fixture cases. */
export function _resetBuildInfoCacheForTests(): void {
  cached = null;
}
