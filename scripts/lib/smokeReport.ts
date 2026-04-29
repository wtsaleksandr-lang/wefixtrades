/**
 * ContentFlow Sprint 19 — shared smoke-test plumbing.
 *
 * Used by every scripts/contentflow-smoke-*.ts script. Provides:
 *   - gating helpers (real-API + public-post + dry-run)
 *   - secret-safe logger
 *   - JSON report read/merge/write
 *
 * IMPORTANT — these scripts are operator-controlled. They never run
 * automatically in the test suite. They require an explicit env flag
 * to do anything beyond a structural check, and ANOTHER flag to make
 * any public-facing call.
 */

import * as fs from "fs";
import * as path from "path";

export const REPORT_PATH = path.join(process.cwd(), "data", "contentflow-smoke-report.json");

export type SmokeStatus = "ok" | "skipped" | "failed" | "blocked";

export interface SmokeChannelResult {
  status: SmokeStatus;
  /** Human-readable summary (no secrets). */
  message: string;
  /** Optional structured details (artefact ids, timing, error code). */
  details?: Record<string, unknown>;
  /** ISO timestamp. */
  at: string;
  /** What the operator must do, if blocked. */
  manual_steps?: string[];
}

export interface SmokeReport {
  generated_at: string;
  branch: string;
  flags: {
    real_api_smoke: boolean;
    allow_real_posts: boolean;
    dry_run: boolean;
  };
  channels: Record<string, SmokeChannelResult>;
}

/* ─── Gating ────────────────────────────────────────────────────────── */

/** Master gate — real-API smoke tests REQUIRE this. Off by default. */
export function isRealApiSmokeEnabled(): boolean {
  return process.env.CONTENTFLOW_REAL_API_SMOKE === "1";
}

/** Public-facing posts ALSO require this. Off by default — even with
 * real API gate ON, scripts will only do read/structural calls
 * (token validity, account lookup) unless this is also set. */
export function isPublicPostAllowed(): boolean {
  return process.env.ALLOW_REAL_POSTS === "1";
}

/** When true, scripts skip ALL state-changing calls. Useful to verify
 * env wiring without burning rate limits or producing artifacts. */
export function isDryRun(): boolean {
  return process.env.DRY_RUN === "1";
}

/* ─── Logging (secret-safe) ─────────────────────────────────────────── */

/** Log with a script-prefix. Never emits raw env values. */
export function log(scriptName: string, ...args: unknown[]): void {
  const ts = new Date().toISOString();
  console.log(`[smoke][${scriptName}][${ts}]`, ...args);
}

export function warn(scriptName: string, ...args: unknown[]): void {
  const ts = new Date().toISOString();
  console.warn(`[smoke][${scriptName}][${ts}][WARN]`, ...args);
}

export function err(scriptName: string, ...args: unknown[]): void {
  const ts = new Date().toISOString();
  console.error(`[smoke][${scriptName}][${ts}][ERR]`, ...args);
}

/** Mask a value for log output. Returns "<set>" when value is non-empty,
 * "<unset>" otherwise. NEVER emit the raw value. */
export function masked(name: string): string {
  return process.env[name] && String(process.env[name]).length > 0 ? "<set>" : "<unset>";
}

/* ─── Report I/O ────────────────────────────────────────────────────── */

function ensureReportDir(): void {
  const dir = path.dirname(REPORT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function emptyReport(): SmokeReport {
  return {
    generated_at: new Date().toISOString(),
    branch: process.env.GIT_BRANCH ?? "unknown",
    flags: {
      real_api_smoke: isRealApiSmokeEnabled(),
      allow_real_posts: isPublicPostAllowed(),
      dry_run: isDryRun(),
    },
    channels: {},
  };
}

export function readReport(): SmokeReport {
  ensureReportDir();
  if (!fs.existsSync(REPORT_PATH)) return emptyReport();
  try {
    const raw = fs.readFileSync(REPORT_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyReport();
    return {
      generated_at: parsed.generated_at ?? new Date().toISOString(),
      branch: parsed.branch ?? "unknown",
      flags: parsed.flags ?? emptyReport().flags,
      channels: parsed.channels ?? {},
    };
  } catch {
    return emptyReport();
  }
}

/** Write a single channel's result into the report. Atomic-ish — read,
 * merge, write. Concurrent script invocations should be sequenced via
 * the orchestrator (smoke-all.ts) to avoid lost updates. */
export function recordResult(channel: string, result: SmokeChannelResult): void {
  ensureReportDir();
  const report = readReport();
  report.generated_at = new Date().toISOString();
  report.flags = {
    real_api_smoke: isRealApiSmokeEnabled(),
    allow_real_posts: isPublicPostAllowed(),
    dry_run: isDryRun(),
  };
  report.channels[channel] = result;
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n", "utf-8");
}

/** Wraps an async smoke handler with a uniform result envelope.
 * Catches everything so a script never throws — always writes a
 * result row to the report. */
export async function runSmoke(
  channel: string,
  scriptName: string,
  fn: () => Promise<Omit<SmokeChannelResult, "at">>,
): Promise<SmokeChannelResult> {
  const at = new Date().toISOString();
  let result: SmokeChannelResult;
  try {
    const r = await fn();
    result = { ...r, at };
  } catch (e: any) {
    err(scriptName, "uncaught:", e?.message || e);
    result = {
      status: "failed",
      message: `uncaught error: ${(e?.message || String(e)).slice(0, 300)}`,
      at,
    };
  }
  recordResult(channel, result);
  log(scriptName, `result: ${result.status} — ${result.message}`);
  return result;
}

/* ─── Pre-flight checks (used by every script) ──────────────────────── */

/** Returns null if the script should proceed. Returns a result object
 * to record + early-exit if not. */
export function preflight(channel: string, opts: { requirePublicPost?: boolean } = {}): SmokeChannelResult | null {
  if (!isRealApiSmokeEnabled()) {
    return {
      status: "skipped",
      message: "CONTENTFLOW_REAL_API_SMOKE not set; refusing to run",
      at: new Date().toISOString(),
      manual_steps: ["Set CONTENTFLOW_REAL_API_SMOKE=1 in the env to enable real-API smoke tests."],
    };
  }
  if (opts.requirePublicPost && !isPublicPostAllowed() && !isDryRun()) {
    return {
      status: "skipped",
      message: "ALLOW_REAL_POSTS not set; this channel requires explicit opt-in for public posts",
      at: new Date().toISOString(),
      manual_steps: [
        "Set ALLOW_REAL_POSTS=1 to permit public-facing test posts on the configured test destination.",
        "Or set DRY_RUN=1 to validate config + token without posting.",
      ],
    };
  }
  return null;
}
