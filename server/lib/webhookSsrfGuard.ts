/**
 * Shared SSRF guard for OUTBOUND webhook delivery.
 *
 * Extracted from server/jobs/notificationWorker.ts (the original inline
 * private-IP check) so the lead-webhook delivery path and the notification
 * worker share ONE implementation instead of duplicating the rule.
 *
 * Policy: a destination is only allowed when it is an `https:` URL whose
 * hostname resolves EXCLUSIVELY to public, routable addresses. Any resolved
 * private / loopback / link-local / unique-local address rejects the whole
 * URL (so a host that resolves to several A records can't smuggle one
 * internal address through).
 */

/**
 * Exported so other outbound-fetch SSRF guards (e.g. ContentFlow's
 * reference-screenshot capture in server/services/contentflow/
 * referenceCapture.ts) share THIS single private-range rule instead of
 * duplicating it.
 */
export function isPrivateAddress(ip: string): boolean {
  return (
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.17.") ||
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    ip.startsWith("172.2") || // covers 172.20–172.29
    ip.startsWith("172.30.") || // 172.30.x.x (private)
    ip.startsWith("172.31.") || // 172.31.x.x (private)
    ip.startsWith("127.") ||
    ip === "0.0.0.0" ||
    ip.startsWith("169.254.") || // link-local
    ip === "::1" || // IPv6 loopback
    ip.startsWith("fc") || // IPv6 unique-local
    ip.startsWith("fd") || // IPv6 unique-local
    ip.startsWith("fe80:") // IPv6 link-local
  );
}

/**
 * Throws if `rawUrl` is not a safe public https destination.
 *
 * - Rejects non-https protocols.
 * - DNS-resolves the hostname and rejects if ANY resolved address is
 *   private / loopback / link-local / unique-local.
 *
 * Returns the parsed URL on success (callers may reuse it).
 */
export async function assertPublicHttpsUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Webhook URL is not a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Webhook URL must use HTTPS");
  }

  const dns = await import("dns");
  const lookups = await dns.promises.lookup(url.hostname, { all: true });
  if (lookups.length === 0) {
    throw new Error("Webhook host did not resolve to any address");
  }
  const blocked = lookups.some((addr) => isPrivateAddress(addr.address));
  if (blocked) {
    throw new Error("Webhook host resolves to a private or loopback address");
  }

  return url;
}
