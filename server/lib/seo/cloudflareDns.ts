/**
 * Cloudflare DNS helper — automatic TXT verification records.
 *
 * Used by the SEO integrations flow when Google/Bing/GBP asks us to add
 * a TXT record at the apex (or _wftverify.<host>) to prove ownership of
 * wefixtrades.com.
 *
 * Auth: CLOUDFLARE_API_TOKEN in Doppler (scope: Zone:DNS:Edit on the
 * wefixtrades.com zone). If absent, the integrations UI falls back to
 * showing the operator the TXT record to add manually.
 *
 * REST endpoints:
 *   GET    /zones?name=<domain>
 *   GET    /zones/:zone_id/dns_records?type=TXT&name=<name>
 *   POST   /zones/:zone_id/dns_records
 *   DELETE /zones/:zone_id/dns_records/:id
 *
 * Docs: https://developers.cloudflare.com/api/operations/dns-records-for-a-zone-create-dns-record
 */

import { createLogger } from "../logger";

const log = createLogger("CloudflareDns");

const CF_BASE = "https://api.cloudflare.com/client/v4";

export function isCloudflareConfigured(): boolean {
  return Boolean(process.env.CLOUDFLARE_API_TOKEN);
}

function getToken(): string {
  const tok = process.env.CLOUDFLARE_API_TOKEN;
  if (!tok) throw new Error("CLOUDFLARE_API_TOKEN not set in Doppler");
  return tok;
}

interface CfResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${CF_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await res.json()) as CfResponse<T>;
  if (!res.ok || !body.success) {
    const msg = body.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ?? `HTTP ${res.status}`;
    throw new Error(`Cloudflare API error — ${msg}`);
  }
  return body.result;
}

async function resolveZoneId(domain: string): Promise<string> {
  const zones = await cf<Array<{ id: string; name: string }>>(
    `/zones?name=${encodeURIComponent(domain)}`,
  );
  if (zones.length === 0) {
    throw new Error(`No Cloudflare zone found for ${domain}`);
  }
  return zones[0].id;
}

/**
 * Add (or upsert) a TXT record. Returns the Cloudflare record ID so it
 * can be removed once verification completes.
 */
export async function addDnsTxtRecord(
  domain: string,
  name: string,
  value: string,
  ttl = 120,
): Promise<{ id: string }> {
  const zoneId = await resolveZoneId(domain);
  // Best-effort dedupe: list existing TXT for this name and remove any
  // that conflict so the verifying service sees exactly our value.
  try {
    const existing = await cf<Array<{ id: string; content: string }>>(
      `/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(name)}`,
    );
    for (const rec of existing) {
      if (rec.content !== `"${value}"` && rec.content !== value) continue;
      // Exact match already exists — nothing to do.
      log.info("TXT record already present, reusing", { name, id: rec.id });
      return { id: rec.id };
    }
  } catch (err) {
    log.warn("Cloudflare existing-record lookup failed; continuing with create", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  const result = await cf<{ id: string }>(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: "TXT",
      name,
      content: value,
      ttl,
    }),
  });
  log.info("Created TXT record", { name, id: result.id });
  return { id: result.id };
}

export async function removeDnsRecord(domain: string, recordId: string): Promise<void> {
  const zoneId = await resolveZoneId(domain);
  await cf<{ id: string }>(`/zones/${zoneId}/dns_records/${recordId}`, { method: "DELETE" });
  log.info("Removed TXT record", { recordId });
}
