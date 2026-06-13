/**
 * Guard: no template preset may reference a banned/deprecated image host.
 *
 * WHY: `source.unsplash.com` is Unsplash's DEPRECATED keyword-redirector. It is
 * now ORB-blocked / returns dead or random images → broken image cards on the
 * customer-facing calculator gallery + widget. That was a real P0 (28 dead
 * `source.unsplash.com` URLs across 8 templates → broken cards), fixed by
 * converting to direct `images.unsplash.com` URLs. Templates are authored
 * frequently (20 new this session), so a copy-pasted redirector URL would
 * silently reintroduce broken cards on the highest-intent conversion surface.
 * This locks the host out.
 *
 * Scans the SERIALIZED preset data (JSON.stringify), so it only sees real
 * string VALUES (image URLs) — explanatory code comments that mention the host
 * are not in the runtime data and cannot trip it (zero false-positive).
 *
 * Denylist = known-broken hosts only (not an allowlist) → zero false-positive
 * on legitimate hosts. Add a host here when it's confirmed dead.
 *
 * Run: `npm run check:template-image-hosts` (tsx; no DB).
 */
import { TEMPLATE_PRESETS } from "../shared/templatePresets";

// Hosts that are confirmed dead/broken for image delivery. Direct
// `images.unsplash.com` URLs are the supported form.
const BANNED_HOSTS = ["source.unsplash.com"];

type Finding = { template: string; host: string };
const findings: Finding[] = [];

for (const t of TEMPLATE_PRESETS) {
  const serialized = JSON.stringify(t);
  for (const host of BANNED_HOSTS) {
    if (serialized.includes(host)) {
      findings.push({ template: t.id, host });
    }
  }
}

if (findings.length > 0) {
  console.error(
    `\ncheck:template-image-hosts — ${findings.length} banned image host reference(s):\n`,
  );
  for (const f of findings) {
    console.error(
      `  ✗ [${f.template}] references banned host "${f.host}" — it is a dead/ORB-blocked ` +
        `redirector → broken image card. Use a direct images.unsplash.com URL.`,
    );
  }
  process.exit(1);
}

console.log(
  `check:template-image-hosts — OK (${TEMPLATE_PRESETS.length} templates, 0 banned hosts: ${BANNED_HOSTS.join(", ")}).`,
);
process.exit(0);
