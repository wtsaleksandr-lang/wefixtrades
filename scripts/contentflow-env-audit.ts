/**
 * ContentFlow Sprint 19 — env / config audit.
 *
 * Pure read-only check of which env vars are present, format-valid,
 * and which dev-only override flags are still set in this environment.
 * NEVER prints secret values. Always safe to run.
 *
 * Usage:
 *   npx tsx scripts/contentflow-env-audit.ts
 */

import { masked, log, recordResult } from "./lib/smokeReport";

interface EnvSpec {
  name: string;
  scope: "core" | "ai" | "image" | "email" | "social-fb" | "social-ig" | "social-gbp" | "wordpress" | "r2" | "test-only";
  required_for: string;       /* "facebook posting", "image gen", etc. */
  format?: RegExp;            /* if set, masked-fail when present but not matching */
  /** A dev-only override that MUST be unset in prod. */
  forbidden_in_prod?: boolean;
  /** Has a code-level default — missing value is a warning, not a blocker. */
  optional?: boolean;
}

const SPECS: EnvSpec[] = [
  /* ─── Core ─────────────────────────────────────────────────────── */
  { name: "DATABASE_URL", scope: "core", required_for: "all" },
  { name: "SESSION_SECRET", scope: "core", required_for: "all" },
  { name: "TOKEN_ENCRYPTION_KEY", scope: "core", required_for: "social connection storage" },
  { name: "APP_PUBLIC_URL", scope: "core", required_for: "Instagram publishing (public image URL)" },
  { name: "ADMIN_EMAIL", scope: "core", required_for: "internal alert emails" },

  /* ─── AI ───────────────────────────────────────────────────────── */
  { name: "ANTHROPIC_API_KEY", scope: "ai", required_for: "content generation (caption + repurposer)" },
  { name: "OPENAI_API_KEY", scope: "ai", required_for: "content generation fallback (and image gen on the gpt-image-1 path)" },

  /* ─── Image gen + R2 ───────────────────────────────────────────── */
  { name: "IMAGE_MODEL", scope: "image", required_for: "image generation (code defaults to gpt-image-1)", optional: true },
  { name: "IMAGE_SIZE", scope: "image", required_for: "image generation (code defaults to 1024x1024)", optional: true },
  { name: "R2_ACCESS_KEY_ID", scope: "r2", required_for: "image storage (Cloudflare R2 upload)" },
  { name: "R2_SECRET_ACCESS_KEY", scope: "r2", required_for: "image storage" },
  { name: "R2_BUCKET_NAME", scope: "r2", required_for: "image storage" },
  { name: "R2_PUBLIC_URL", scope: "r2", required_for: "image storage (public URL prefix)", format: /^https?:\/\/.+/ },
  { name: "R2_ENDPOINT", scope: "r2", required_for: "image storage", format: /^https?:\/\/.+/ },

  /* ─── Email / SMTP ─────────────────────────────────────────────── */
  { name: "SMTP_HOST", scope: "email", required_for: "email channel (transactional + repurposer email)" },
  { name: "SMTP_PORT", scope: "email", required_for: "email channel", format: /^\d+$/ },
  { name: "SMTP_USER", scope: "email", required_for: "email channel" },
  { name: "SMTP_PASS", scope: "email", required_for: "email channel" },
  { name: "SMTP_FROM", scope: "email", required_for: "email channel (From: header)", format: /.+@.+\..+/ },

  /* ─── Facebook ─────────────────────────────────────────────────── */
  { name: "FACEBOOK_APP_ID", scope: "social-fb", required_for: "FB OAuth (admin and self-serve)" },
  { name: "FACEBOOK_APP_SECRET", scope: "social-fb", required_for: "FB OAuth" },
  { name: "FACEBOOK_REDIRECT_URI", scope: "social-fb", required_for: "FB OAuth", format: /^https?:\/\/.+/ },

  /* ─── Google Business Profile ──────────────────────────────────── */
  { name: "GOOGLE_BUSINESS_CLIENT_ID", scope: "social-gbp", required_for: "GBP OAuth (admin and self-serve)" },
  { name: "GOOGLE_BUSINESS_CLIENT_SECRET", scope: "social-gbp", required_for: "GBP OAuth" },
  { name: "GOOGLE_BUSINESS_REDIRECT_URI", scope: "social-gbp", required_for: "GBP OAuth", format: /^https?:\/\/.+/ },

  /* ─── Forbidden-in-prod (dev mocks/test stubs) ─────────────────── */
  { name: "FB_GRAPH_API_BASE_OVERRIDE", scope: "test-only", required_for: "TEST ENV ONLY (must be unset in prod)", forbidden_in_prod: true },
  { name: "IG_GRAPH_API_BASE_OVERRIDE", scope: "test-only", required_for: "TEST ENV ONLY (must be unset in prod)", forbidden_in_prod: true },
  { name: "GBP_API_BASE_OVERRIDE", scope: "test-only", required_for: "TEST ENV ONLY (must be unset in prod)", forbidden_in_prod: true },
  { name: "GBP_POST_API_BASE_OVERRIDE", scope: "test-only", required_for: "TEST ENV ONLY (must be unset in prod)", forbidden_in_prod: true },
  { name: "IMAGE_API_BASE_OVERRIDE", scope: "test-only", required_for: "TEST ENV ONLY (must be unset in prod)", forbidden_in_prod: true },
  { name: "EMAIL_TEST_SIMULATE_SUCCESS", scope: "test-only", required_for: "TEST ENV ONLY (must be unset in prod)", forbidden_in_prod: true },
  { name: "REPURPOSER_AI_STUB", scope: "test-only", required_for: "TEST ENV ONLY (must be unset in prod)", forbidden_in_prod: true },
  { name: "DEV_TOOLS_ENABLED", scope: "test-only", required_for: "TEST ENV ONLY (must be unset/0 in prod)", forbidden_in_prod: true },
];

/* ─── Audit row ──────────────────────────────────────────────────── */

interface AuditRow {
  name: string;
  scope: string;
  present: boolean;
  format_ok: boolean | "n/a";
  blocking: string | null;
  required_for: string;
}

function auditOne(spec: EnvSpec): AuditRow {
  const value = process.env[spec.name];
  const present = !!value && String(value).length > 0;
  const isProd = process.env.NODE_ENV === "production";

  /* Forbidden-in-prod: present + prod = blocking. */
  if (spec.forbidden_in_prod) {
    if (present && isProd) {
      return {
        name: spec.name,
        scope: spec.scope,
        present: true,
        format_ok: "n/a",
        blocking: "DEV-ONLY FLAG SET IN PROD — unset before launch",
        required_for: spec.required_for,
      };
    }
    return {
      name: spec.name,
      scope: spec.scope,
      present,
      format_ok: "n/a",
      blocking: null,
      required_for: spec.required_for,
    };
  }

  /* Missing = blocking, unless the spec has a code-level default. */
  if (!present) {
    return {
      name: spec.name,
      scope: spec.scope,
      present: false,
      format_ok: "n/a",
      blocking: spec.optional ? null : `missing — required for ${spec.required_for}`,
      required_for: spec.required_for,
    };
  }
  if (spec.format && !spec.format.test(String(value))) {
    return {
      name: spec.name,
      scope: spec.scope,
      present: true,
      format_ok: false,
      blocking: `format invalid (expected match: ${spec.format.source})`,
      required_for: spec.required_for,
    };
  }
  return {
    name: spec.name,
    scope: spec.scope,
    present: true,
    format_ok: spec.format ? true : "n/a",
    blocking: null,
    required_for: spec.required_for,
  };
}

function printTable(rows: AuditRow[]): void {
  const w = (s: string, n: number) => s.length >= n ? s.slice(0, n - 1) + " " : s + " ".repeat(n - s.length);
  console.log(
    w("NAME", 38) + w("SCOPE", 12) + w("PRESENT", 9) + w("FORMAT", 9) + "BLOCKING",
  );
  console.log("─".repeat(120));
  for (const r of rows) {
    const present = r.present ? "yes" : "no";
    const fmt = r.format_ok === "n/a" ? "n/a" : r.format_ok ? "ok" : "BAD";
    console.log(
      w(r.name, 38) + w(r.scope, 12) + w(present, 9) + w(fmt, 9) + (r.blocking ?? ""),
    );
  }
}

/* ─── Main ───────────────────────────────────────────────────────── */

function main(): void {
  log("env-audit", "starting env / config audit (no secret values are printed)");
  log("env-audit", `NODE_ENV=${process.env.NODE_ENV ?? "<unset>"}`);

  const rows = SPECS.map(auditOne);
  printTable(rows);

  /* Summary */
  const blockers = rows.filter((r) => r.blocking);
  const presence: Record<string, number> = {};
  for (const r of rows) presence[r.scope] = (presence[r.scope] ?? 0) + (r.present ? 1 : 0);

  console.log("\n─── Summary ───");
  console.log(`Total checks:    ${rows.length}`);
  console.log(`Present:         ${rows.filter((r) => r.present).length}`);
  console.log(`Blocking issues: ${blockers.length}`);
  console.log(`By scope:        ${JSON.stringify(presence)}`);
  if (blockers.length > 0) {
    console.log("\nBlockers:");
    for (const b of blockers) console.log(`  - ${b.name} (${b.scope}): ${b.blocking}`);
  }

  /* Persist into the smoke report so the orchestrator can read it. */
  recordResult("env_audit", {
    status: blockers.length === 0 ? "ok" : "blocked",
    message: blockers.length === 0
      ? `all ${rows.length} env checks passed`
      : `${blockers.length} blocking issue(s) — see manual_steps`,
    at: new Date().toISOString(),
    details: {
      total: rows.length,
      present: rows.filter((r) => r.present).length,
      blockers: blockers.length,
      rows: rows.map((r) => ({
        name: r.name, scope: r.scope, present: r.present,
        format_ok: r.format_ok, blocking: r.blocking,
      })),
      presence_by_scope: presence,
      node_env: process.env.NODE_ENV ?? null,
      /* Quick-scan: which forbidden-in-prod overrides are set? */
      mock_overrides_set: SPECS
        .filter((s) => s.forbidden_in_prod)
        .filter((s) => masked(s.name) === "<set>")
        .map((s) => s.name),
    },
    manual_steps: blockers.map((b) => `Set ${b.name} (${b.required_for}): ${b.blocking}`),
  });

  log("env-audit", "report written to data/contentflow-smoke-report.json");
  /* Don't exit non-zero — the report itself signals status. */
}

main();
