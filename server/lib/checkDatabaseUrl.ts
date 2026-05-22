/**
 * BF-1b — pre-deploy DATABASE_URL sanity guard (boot-path entry point).
 *
 * Why this exists: BF-1 (PR #489) ranked "Replit Autoscale deployment bound
 * to a different DATABASE_URL than the workspace" as the highest-likelihood
 * cause of the apparent credential-wipe symptom on production republish. The
 * boot canary in bootstrapMigrations.ts logs auth-table counts AFTER migrations
 * run — by then, a misconfigured deploy has already applied 35 migrations
 * against the wrong DB. This guard runs BEFORE bootstrapMigrations so we
 * refuse to touch a suspicious DB at all.
 *
 * Detection: tokenize the host portion of DATABASE_URL on `.`/`-`/`_` and
 * flag if any well-known non-prod marker appears as its own token. This
 * avoids false positives on hosts like `production-db.example.com` (the
 * substring "dev" inside "ep-development-xyz" tokens out as "development",
 * which IS a marker; but the substring "dev" inside "developers" does not
 * tokenize because "developers" is the whole token).
 *
 * Tunable: PROD_DATABASE_URL_REQUIRED_SUBSTRING — once Alex confirms the
 * prod Neon hostname pattern, setting this env var forces the boot to fail
 * unless DATABASE_URL host contains it. Belt-and-suspenders for the marker
 * blacklist.
 *
 * Never echoes the raw DATABASE_URL — only the @host:port portion is logged.
 *
 * The CLI entry point lives at scripts/check-database-url.mjs and shells
 * through the same `check()` function so CI and boot agree.
 */

import { createLogger } from "./logger";

const log = createLogger("CheckDatabaseUrl");

const NON_PROD_MARKERS = [
  "dev",
  "develop",
  "development",
  "preview",
  "staging",
  "stage",
  "test",
  "sandbox",
  "ephemeral",
  "localhost",
  "127.0.0.1",
];

function maskHost(url: string): string {
  const m = url.match(/@([^/?]+)/);
  return m ? m[1] : "(unparseable)";
}

export interface CheckResult {
  ok: boolean;
  reason?: string;
  host: string;
  markers: string[];
}

export function checkDatabaseUrl(opts?: {
  databaseUrl?: string;
  nodeEnv?: string;
  requiredSubstring?: string;
}): CheckResult {
  const raw = opts?.databaseUrl ?? process.env.DATABASE_URL ?? "";
  const nodeEnv = opts?.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const required =
    opts?.requiredSubstring ?? process.env.PROD_DATABASE_URL_REQUIRED_SUBSTRING ?? "";

  if (!raw) {
    if (nodeEnv === "production") {
      return {
        ok: false,
        reason: "DATABASE_URL is empty in production",
        host: "(empty)",
        markers: [],
      };
    }
    return { ok: true, host: "(empty)", markers: [] };
  }

  const host = maskHost(raw).toLowerCase();
  const tokens = host.split(/[.\-_]/);
  const markers = NON_PROD_MARKERS.filter((m) => tokens.includes(m));

  if (nodeEnv !== "production") {
    return { ok: true, host, markers };
  }

  if (markers.length > 0) {
    return {
      ok: false,
      reason:
        `NODE_ENV=production but DATABASE_URL host contains non-prod ` +
        `marker(s): ${markers.join(",")}. BF-1 credential-wipe signature.`,
      host,
      markers,
    };
  }

  if (required && !host.includes(required.toLowerCase())) {
    return {
      ok: false,
      reason:
        `NODE_ENV=production and PROD_DATABASE_URL_REQUIRED_SUBSTRING=` +
        `"${required}" set, but DATABASE_URL host does not contain it.`,
      host,
      markers,
    };
  }

  return { ok: true, host, markers };
}

/**
 * Boot-path entry: runs checkDatabaseUrl() and either logs an OK line or
 * logs a FATAL line and returns false (caller should process.exit(1)).
 */
export function assertDatabaseUrlOk(): boolean {
  const r = checkDatabaseUrl();
  if (!r.ok) {
    log.error(
      `[check-database-url] FATAL: ${r.reason} (host=${r.host}). Fix the ` +
        `deployment's DATABASE_URL Secret in Replit Deployments console ` +
        `before retrying.`,
    );
    return false;
  }
  log.info(`[check-database-url] OK host=${r.host} env=${process.env.NODE_ENV}`);
  return true;
}
