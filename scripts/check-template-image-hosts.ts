/**
 * Guard: template-preset OPTION images must be local, trade-accurate assets —
 * never a remote stock-photo host, and never the same asset recycled across a
 * pile of unrelated trades.
 *
 * HISTORY
 *  1. `source.unsplash.com` (Unsplash's deprecated keyword-redirector) was
 *     ORB-blocked → 28 dead URLs / broken cards. Banned.
 *  2. The fallback `images.unsplash.com` direct URLs were *recycled* stock —
 *     the same generic photo reused for unrelated options/trades, so an
 *     "Asphalt driveway" card showed a random unrelated photo. Option imagery
 *     now ships as locally-generated, trade-accurate assets under
 *     `client/public/template-images/...`. This guard locks that in.
 *
 * RULES
 *  (1) HOST: any banned/remote image host in serialized preset data fails.
 *      Option imageUrls MUST be local `/template-images/...` paths.
 *  (2) REUSE: an option image path reused across more than
 *      MAX_TEMPLATE_REUSE *unrelated* templates fails — that is the
 *      "recycled stock" smell the rewire fixed; don't let it creep back.
 *
 * Scans SERIALIZED preset data (JSON.stringify) for the host check, so it only
 * sees real string VALUES — explanatory comments mentioning a host can't trip
 * it (zero false-positive). The reuse check walks option imageUrls directly.
 *
 * Run: `npm run check:template-image-hosts` (tsx; no DB).
 */
import { TEMPLATE_PRESETS } from "../shared/templatePresets";

// Hosts confirmed dead/broken OR disallowed for option imagery. Option images
// must be local `/template-images/...` assets, so every remote stock host is
// banned here.
const BANNED_HOSTS = ["source.unsplash.com", "images.unsplash.com"];

// An option image may legitimately be shared by a few closely-related presets
// (e.g. a trade + its "pro" variant). More than this many DISTINCT templates
// sharing one path is the recycled-stock smell → fail.
const MAX_TEMPLATE_REUSE = 3;

// Required local prefix for option imagery.
const LOCAL_PREFIX = "/template-images/";

let failed = false;

/* ── Rule 1: banned remote hosts ─────────────────────────────────────────── */
const hostFindings: { template: string; host: string }[] = [];
for (const t of TEMPLATE_PRESETS) {
  const serialized = JSON.stringify(t);
  for (const host of BANNED_HOSTS) {
    if (serialized.includes(host)) hostFindings.push({ template: t.id, host });
  }
}
if (hostFindings.length > 0) {
  failed = true;
  console.error(
    `\ncheck:template-image-hosts — ${hostFindings.length} banned image host reference(s):\n`,
  );
  for (const f of hostFindings) {
    console.error(
      `  ✗ [${f.template}] references banned host "${f.host}" — option images must be ` +
        `local "${LOCAL_PREFIX}..." assets, not remote/recycled stock.`,
    );
  }
}

/* ── Rule 2: every option imageUrl must be a local /template-images/ path ──── */
/* ── Rule 3: no option image path reused across > N unrelated templates ───── */
const pathToTemplates = new Map<string, Set<string>>();
const nonLocalFindings: { template: string; field: string; url: string }[] = [];

for (const t of TEMPLATE_PRESETS) {
  for (const field of t.fields ?? []) {
    for (const opt of (field as { options?: { imageUrl?: string }[] }).options ?? []) {
      const url = opt.imageUrl;
      if (!url) continue;
      if (!url.startsWith(LOCAL_PREFIX)) {
        nonLocalFindings.push({ template: t.id, field: (field as { id: string }).id, url });
        continue;
      }
      if (!pathToTemplates.has(url)) pathToTemplates.set(url, new Set());
      pathToTemplates.get(url)!.add(t.id);
    }
  }
}

if (nonLocalFindings.length > 0) {
  failed = true;
  console.error(
    `\ncheck:template-image-hosts — ${nonLocalFindings.length} option image(s) are not local "${LOCAL_PREFIX}..." paths:\n`,
  );
  for (const f of nonLocalFindings) {
    console.error(`  ✗ [${f.template}.${f.field}] imageUrl "${f.url}" — use a local ${LOCAL_PREFIX} asset.`);
  }
}

const reuseFindings = [...pathToTemplates.entries()]
  .filter(([, set]) => set.size > MAX_TEMPLATE_REUSE)
  .map(([path, set]) => ({ path, templates: [...set] }));

if (reuseFindings.length > 0) {
  failed = true;
  console.error(
    `\ncheck:template-image-hosts — ${reuseFindings.length} option image(s) reused across more than ${MAX_TEMPLATE_REUSE} templates (recycled-stock smell):\n`,
  );
  for (const f of reuseFindings) {
    console.error(`  ✗ "${f.path}" reused by ${f.templates.length} templates: ${f.templates.join(", ")}`);
  }
}

if (failed) process.exit(1);

const distinctPaths = pathToTemplates.size;
console.log(
  `check:template-image-hosts — OK (${TEMPLATE_PRESETS.length} templates, ` +
    `${distinctPaths} distinct local option images, 0 banned hosts, ` +
    `0 paths reused across >${MAX_TEMPLATE_REUSE} templates).`,
);
process.exit(0);
