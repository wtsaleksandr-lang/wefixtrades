/**
 * Placeholder-supplier guard.
 *
 * `server/scripts/seed-suppliers.ts` seeds a starter roster whose contact
 * addresses are RFC-2606 reserved examples — design@example.com,
 * seo@example.com, content@example.com, ads@example.com and
 * adflow-agency@example.com — and it inserted them with
 * `status: "active", is_active: true, supplier_type: "email"`.
 *
 * That made them live dispatch targets. `autoAssignSupplier()` matches on
 * `supported_services`, so a paid SiteLaunch order auto-assigned to
 * "Website Design Agency" and `dispatchViaEmail()` mailed
 * design@example.com a brief containing the customer's business name,
 * website and full onboarding answers (see generateSiteLaunchBrief). Nobody
 * owns example.com, so that is customer data leaving the system to an
 * address we do not control — not merely a brief "into the void".
 *
 * Editing the seed script only changes FUTURE seeding; rows already in a
 * database stay active. This guard is therefore enforced at RUNTIME, on both
 * the assignment path and the send path, so an existing bad row cannot
 * dispatch regardless of its `is_active` flag.
 */

/**
 * Reserved / non-routable domains that must never receive a supplier brief.
 * example.* are RFC 2606 reserved; .local / .invalid / .test likewise.
 */
const UNDELIVERABLE_DOMAINS = [
  "example.com",
  "example.org",
  "example.net",
  "example.edu",
  "invalid",
  "test",
  "localhost",
  "fiverr-lead.local",
];

/**
 * True when an address is a documentation/placeholder address that must
 * never be emailed. Matches the exact domain or any subdomain of it.
 */
export function isUndeliverablePlaceholderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  if (!domain) return false;
  return UNDELIVERABLE_DOMAINS.some(
    (d) => domain === d || domain.endsWith(`.${d}`),
  );
}
