/**
 * Wave 31 — plain-language translation utility.
 *
 * Hard rule from CLAUDE.md: every WebCare maintenance log entry MUST be
 * customer-readable in plain English. This module is the canonical
 * mapper between raw technical strings (wp-cli output, malware-scan
 * findings, performance run summaries) and the customer-facing copy.
 *
 * Used in two places:
 *  1. The MaintenanceLogInbox renders `plainLanguageSummary` directly
 *     — but if a backend ever sends raw technical text, this util
 *     wraps it before display.
 *  2. The `run-action` server handler stores plain copy in the DB;
 *     this module mirrors the verbs so unit-tests can assert parity.
 *
 * Translate technical to plain English — the brief's recurring rule.
 */

export interface RawAction {
  eventType: "updates" | "security" | "performance" | "backups" | "uptime" | "other";
  technical: string;
  context?: Record<string, unknown>;
}

const TEMPLATES: Array<{
  match: RegExp;
  build: (m: RegExpMatchArray, ctx: Record<string, unknown>) => string;
}> = [
  {
    match: /^update_wp_core\s+(\d[\d.]*)\s*->\s*(\d[\d.]*)(?:\s+cve=([\w-]+))?/i,
    build: (m) =>
      m[3]
        ? `Updated WordPress core ${m[1]} → ${m[2]} — patched ${m[3]}`
        : `Updated WordPress core ${m[1]} → ${m[2]}`,
  },
  {
    match: /^update_plugin\s+(\S+)\s+(\d[\d.]*)\s*->\s*(\d[\d.]*)/i,
    build: (m) => `Updated ${m[1]} (${m[2]} → ${m[3]})`,
  },
  {
    match: /^update_theme\s+(\S+)\s+(\d[\d.]*)\s*->\s*(\d[\d.]*)/i,
    build: (m) => `Updated theme ${m[1]} (${m[2]} → ${m[3]})`,
  },
  {
    match: /^malware_remove\s+(\d+)\s+files?\s+from\s+(.+)/i,
    build: (m) =>
      `Removed ${m[1]} malware ${Number(m[1]) === 1 ? "file" : "files"} from ${m[2]}`,
  },
  {
    match: /^block_login_attempts\s+(\d+)\s+(\d+)h/i,
    build: (m) =>
      `Blocked ${m[1]} brute-force login attempts in the last ${m[2]}h`,
  },
  {
    match: /^optimize_images\s+(\d+)\s+saved=([\d.]+)([kKmM]?[bB])/i,
    build: (m) =>
      `Optimized ${m[1]} ${Number(m[1]) === 1 ? "image" : "images"} (saved ${m[2]} ${m[3].toUpperCase()} on page load)`,
  },
  {
    match: /^backup_complete\s+size=([\d.]+)([kKmMgG]?[bB])/i,
    build: (m) => `Backup complete — ${m[1]} ${m[2].toUpperCase()}`,
  },
  {
    match: /^queue_wp_cli_update_all/i,
    build: () => "Queued — applying all pending updates with a safety backup",
  },
  {
    match: /^queue_malware_scan_and_clean/i,
    build: () => "Queued — malware scan + clean-up",
  },
  {
    match: /^apply_hardening_profile/i,
    build: () =>
      "Enabled 2FA, login throttling, and file-edit lockdown across the site",
  },
  {
    match: /^queue_perf_optimize/i,
    build: () => "Queued performance optimization — image + CSS minify",
  },
  {
    match: /^queue_backup/i,
    build: () => "On-demand backup queued",
  },
  {
    match: /^uptime_recovered\s+after=(\d+)m/i,
    build: (m) => `Site recovered after a ${m[1]}-minute outage`,
  },
];

/**
 * Translate a raw technical action string to plain English. Falls back
 * to the original text when no template matches — never an empty string.
 */
export function translateToPlain(raw: RawAction): string {
  const ctx = raw.context ?? {};
  for (const t of TEMPLATES) {
    const m = raw.technical.match(t.match);
    if (m) return t.build(m, ctx);
  }
  // Reasonable fallback: capitalize and strip the leading verb_token.
  const cleaned = raw.technical
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : "Maintenance action recorded";
}

/** Convenience helper: produce the "prevented N vulnerabilities" framing
 *  the brief calls out — "updated 7 plugins" is less compelling than the
 *  outcome version. Returns null when N is zero or unknown. */
export function vulnerabilityFraming(updates: number, knownVulns: number): string | null {
  if (knownVulns <= 0 || updates <= 0) return null;
  return `Prevented ${knownVulns} known ${knownVulns === 1 ? "vulnerability" : "vulnerabilities"} across ${updates} updates`;
}
