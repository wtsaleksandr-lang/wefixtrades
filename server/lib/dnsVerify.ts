/**
 * DNS verification for Pro-tier custom email domains.
 *
 * Verifies SPF, DKIM, and DMARC TXT records exist on the trade's DNS.
 * Returns a structured pass/fail per record so the portal UI can show
 * the trade exactly which one is missing.
 *
 * Uses Node's built-in `dns/promises` for resolution. No external deps.
 */

import dns from "dns/promises";

export interface DnsCheckResult {
  domain: string;
  spf: { ok: boolean; details: string };
  dkim: { ok: boolean; details: string };
  dmarc: { ok: boolean; details: string };
  allPassed: boolean;
}

const SENDGRID_DKIM_SELECTOR = process.env.SENDGRID_DKIM_SELECTOR || "s1._domainkey";
const SENDGRID_SPF_INCLUDE = process.env.SENDGRID_SPF_INCLUDE || "sendgrid.net";
const REQUIRED_DMARC_POLICY = ["none", "quarantine", "reject"]; // any valid policy passes

async function resolveTxtSafe(host: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(host);
    return records.map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

export async function verifyDomain(domain: string): Promise<DnsCheckResult> {
  const normalized = domain.toLowerCase().trim();

  // SPF — root TXT must include sendgrid.net (or whichever SPF include we use)
  const rootTxt = await resolveTxtSafe(normalized);
  const spfRecord = rootTxt.find((r) => r.toLowerCase().startsWith("v=spf1"));
  const spfOk = !!spfRecord && spfRecord.toLowerCase().includes(`include:${SENDGRID_SPF_INCLUDE.toLowerCase()}`);
  const spfDetails = spfRecord
    ? spfOk
      ? `SPF found and includes ${SENDGRID_SPF_INCLUDE}.`
      : `SPF record exists but doesn't include ${SENDGRID_SPF_INCLUDE}. Found: ${spfRecord}`
    : `No SPF record on ${normalized}. Expected a TXT record starting with "v=spf1 include:${SENDGRID_SPF_INCLUDE} ~all".`;

  // DKIM — selector subdomain must resolve to a TXT containing v=DKIM1 + p=<pubkey>
  const dkimHost = `${SENDGRID_DKIM_SELECTOR}.${normalized}`;
  const dkimTxt = await resolveTxtSafe(dkimHost);
  const dkimRecord = dkimTxt.find((r) => r.toLowerCase().startsWith("v=dkim1"));
  const dkimOk = !!dkimRecord && /p=[A-Za-z0-9+/=]+/i.test(dkimRecord);
  const dkimDetails = dkimRecord
    ? dkimOk
      ? `DKIM found on ${dkimHost}.`
      : `DKIM record at ${dkimHost} is missing a public key.`
    : `No DKIM record at ${dkimHost}. Expected a TXT record starting with "v=DKIM1".`;

  // DMARC — _dmarc subdomain must have v=DMARC1 + a policy
  const dmarcHost = `_dmarc.${normalized}`;
  const dmarcTxt = await resolveTxtSafe(dmarcHost);
  const dmarcRecord = dmarcTxt.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
  const dmarcPolicyMatch = dmarcRecord?.match(/p=(none|quarantine|reject)/i);
  const dmarcOk = !!dmarcRecord && !!dmarcPolicyMatch && REQUIRED_DMARC_POLICY.includes(dmarcPolicyMatch[1].toLowerCase());
  const dmarcDetails = dmarcRecord
    ? dmarcOk
      ? `DMARC found with policy "${dmarcPolicyMatch![1]}".`
      : `DMARC record exists but has no valid policy (p=none / quarantine / reject).`
    : `No DMARC record at ${dmarcHost}. Expected a TXT record starting with "v=DMARC1; p=none;".`;

  return {
    domain: normalized,
    spf: { ok: spfOk, details: spfDetails },
    dkim: { ok: dkimOk, details: dkimDetails },
    dmarc: { ok: dmarcOk, details: dmarcDetails },
    allPassed: spfOk && dkimOk && dmarcOk,
  };
}

/** Required-records strings shown in the portal UI so the trade can copy them into DNS */
export function requiredRecordsForDomain(domain: string): Array<{ type: string; host: string; value: string; purpose: string }> {
  return [
    {
      type: "TXT",
      host: domain,
      value: `v=spf1 include:${SENDGRID_SPF_INCLUDE} ~all`,
      purpose: "SPF — authorizes WeFixTrades to send mail from this domain",
    },
    {
      type: "TXT",
      host: `${SENDGRID_DKIM_SELECTOR}.${domain}`,
      value: "(provided by WeFixTrades — generated per domain)",
      purpose: "DKIM — cryptographically signs your messages",
    },
    {
      type: "TXT",
      host: `_dmarc.${domain}`,
      value: "v=DMARC1; p=none; rua=mailto:dmarc@wefixtrades.com",
      purpose: "DMARC — tells receiving servers how to handle failed checks",
    },
  ];
}
