/**
 * Regression guard: AdFlow 1-click actions must not claim an outcome that
 * cannot happen, and no supplier brief may be mailed to a placeholder domain.
 *
 * (a) AdFlow has ZERO ad-platform integration — no Google Ads / Meta Ads API
 *     client, no ad-account OAuth, no write path to any campaign. Metrics are
 *     typed in by hand by ops. Yet the handler replied "Auto-pause approved —
 *     campaign paused, you'll see it in the dashboard within a few minutes"
 *     while doing literally nothing: no task, no email, no ops notification.
 *     Campaign status is read from a hand-typed JSON blob, so the dashboard
 *     would keep showing "Active" forever.
 *
 * (b) seed-suppliers.ts seeded design@example.com / adflow-agency@example.com
 *     as active email suppliers. autoAssignSupplier matched them and
 *     dispatchViaEmail mailed briefs — for SiteLaunch, including the
 *     customer's full onboarding answers — to a domain nobody owns.
 *
 * Source-level assertions plus a pure-function test (no DB) so this runs in
 * the DB-less CI `gate` job.
 */
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isUndeliverablePlaceholderEmail } from "../../supplierPlaceholder";

const here = dirname(fileURLToPath(import.meta.url));
const handler = readFileSync(join(here, "adflow.ts"), "utf8");
const servicesDir = join(here, "..", "..");
const assignment = readFileSync(join(servicesDir, "supplierAssignment.ts"), "utf8");
const dispatch = readFileSync(join(servicesDir, "supplierDispatch.ts"), "utf8");
const seed = readFileSync(
  join(servicesDir, "..", "scripts", "seed-suppliers.ts"),
  "utf8",
);
const mapguardKpis = readFileSync(
  join(servicesDir, "..", "routes", "portal", "mapguard", "dashboardKpis.ts"),
  "utf8",
);

const serverDir = join(servicesDir, "..");
const repoRoot = join(serverDir, "..");
const adflowDir = join(serverDir, "routes", "portal", "adflow");
const adflowKpis = readFileSync(join(adflowDir, "dashboardKpis.ts"), "utf8");
const adflowCampaigns = readFileSync(join(adflowDir, "campaigns.ts"), "utf8");
const adflowStats = readFileSync(join(adflowDir, "wave73KpiStats.ts"), "utf8");
const adflowRouteIndex = readFileSync(join(adflowDir, "index.ts"), "utf8");
const adflowReportsSvc = readFileSync(
  join(servicesDir, "adflowReports.ts"),
  "utf8",
);
const adflowDashboardPage = readFileSync(
  join(repoRoot, "client", "src", "pages", "portal", "adflow", "AdFlowDashboard.tsx"),
  "utf8",
);
const adflowCampaignCard = readFileSync(
  join(repoRoot, "client", "src", "components", "adflow", "CampaignCard.tsx"),
  "utf8",
);
const adflowProductCopy = readFileSync(
  join(repoRoot, "client", "src", "config", "products.ts"),
  "utf8",
);
const adflowMockups = readFileSync(
  join(repoRoot, "client", "src", "config", "product-mockups.tsx"),
  "utf8",
);
const metricRegistry = readFileSync(
  join(repoRoot, "shared", "copilot", "metricRegistry.ts"),
  "utf8",
);

/* ─── 1. No action may assert a completed platform change ────────────── */

/**
 * Strip comments so the docblock explaining WHY these strings were removed
 * doesn't trip the check that they are gone from the code.
 */
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const handlerCode = stripComments(handler);

const FORBIDDEN_CLAIMS = [
  "campaign paused",
  "will get more spend tomorrow",
  "Auto-pause approved",
];
for (const claim of FORBIDDEN_CLAIMS) {
  assert.ok(
    !handlerCode.includes(claim),
    `REGRESSION: AdFlow handler replies "${claim}". Nothing is paused, boosted or scheduled — there is no ad-platform integration. Say what actually happened: a request was logged.`,
  );
}

/* ─── 2. Request-shaped actions must create real work ────────────────── */

assert.ok(
  handler.includes("storage.createFulfillmentTask"),
  "REGRESSION: AdFlow actions no longer create a fulfillment task. 'Request logged / your ops team will action it' is only true if a task exists.",
);
assert.ok(
  /if \(request\) \{[\s\S]{0,600}?createFulfillmentTask/.test(handler),
  "the task must be created for every request-shaped action",
);
assert.ok(
  /catch[\s\S]{0,400}?success: false[\s\S]{0,200}?couldn't log that request/.test(handler),
  "if the task write fails we must NOT tell the customer the request was logged",
);

/* ─── 3. Confirmations must state that nothing changed yet ───────────── */

assert.ok(
  handler.includes("Nothing has changed on your live campaign yet."),
  "request confirmations must say plainly that the live campaign is unchanged",
);

/* ─── 4. Placeholder-domain guard: pure behaviour ────────────────────── */

for (const bad of [
  "design@example.com",
  "adflow-agency@example.com",
  "seo@example.com",
  "someone@sub.example.com",
  "x@example.org",
  "y@foo.invalid",
  "unverified+mahmoud@fiverr-lead.local",
]) {
  assert.strictEqual(
    isUndeliverablePlaceholderEmail(bad),
    true,
    `${bad} must be treated as an undeliverable placeholder`,
  );
}
for (const good of [
  "alex@wefixtrades.com",
  "支持@example-agency.com",
  "hello@myexamples.com",
  "ops@exampleagency.co.uk",
]) {
  assert.strictEqual(
    isUndeliverablePlaceholderEmail(good),
    false,
    `${good} is a real address and must NOT be blocked`,
  );
}
assert.strictEqual(isUndeliverablePlaceholderEmail(null), false);
assert.strictEqual(isUndeliverablePlaceholderEmail(""), false);
assert.strictEqual(isUndeliverablePlaceholderEmail("no-at-sign"), false);

/* ─── 5. The guard is wired into BOTH the assign and send paths ──────── */

assert.ok(
  assignment.includes("isUndeliverablePlaceholderEmail"),
  "autoAssignSupplier must skip placeholder-email suppliers so work is never routed to them",
);
assert.ok(
  dispatch.includes("isUndeliverablePlaceholderEmail"),
  "dispatchViaEmail must refuse to send to a placeholder address — rows seeded before the guard may still be active in an existing database",
);
assert.ok(
  dispatch.includes("supplier_placeholder_email"),
  "the blocked dispatch must report a distinct reason so it is visible in logs",
);

/* ─── 6. The seed roster must be inactive ────────────────────────────── */

const seedBody = seed.slice(seed.indexOf("const SUPPLIER_SEEDS"));
for (const placeholder of [
  "design@example.com",
  "seo@example.com",
  "content@example.com",
  "ads@example.com",
  "adflow-agency@example.com",
]) {
  const idx = seedBody.indexOf(placeholder);
  assert.ok(idx !== -1, `expected the ${placeholder} seed entry to still exist (kept so an admin can fill in a real address)`);
  const entry = seedBody.slice(idx, idx + 400);
  assert.ok(
    entry.includes("is_active: false"),
    `REGRESSION: ${placeholder} is seeded active. It becomes a live email dispatch target for real customer briefs.`,
  );
}

/* ─── 7. MapGuard: no fabricated pin geography ───────────────────────── */

assert.ok(
  !/Math\.floor\(idx \/ 5\) % 5/.test(stripComments(mapguardKpis)),
  "REGRESSION: MapGuard buildGrid scatters keyword ranks across map pins by array index. The scan is city-wide (no coordinates), so this paints an unmeasured rank onto a specific location on a real Google map.",
);
assert.ok(
  /if \(typeof entry\.pinRow !== "number" \|\| typeof entry\.pinCol !== "number"\) return;/.test(mapguardKpis),
  "grid cells may only be populated from an explicit pinRow/pinCol written by a geo-aware scan",
);
assert.ok(
  /if \(cur\.size === 0\) return \[\];/.test(mapguardKpis),
  "with no per-pin data the grid must be empty so the dashboard shows its 'not measured here' state instead of an invented map",
);
assert.ok(
  !/const total = cells\.length \|\| 25;/.test(stripComments(mapguardKpis)),
  "REGRESSION: top-3 coverage divides by a fixed 25 grid size even though far fewer keywords are ever scanned, structurally deflating the number",
);

/* ─── 8. AdFlow reports only what was reported or measured ──────────────
 *
 * AdFlow sells at $399–$999/mo against numbers a person types into the CRM.
 * Those numbers used to arrive on the customer's dashboard embellished: an
 * invented revenue multiplier, a constant LTV score, a platform attribution
 * guessed from the campaign name, a synthesised day-by-day breakdown written
 * back into a real field, and two charts hardcoded to fixed arrays.
 *
 * Everything below asserts a specific fabrication is GONE from the source. Flip
 * any one of them back on and the CI `gate` job fails with the reason.
 */

const kpisCode = stripComments(adflowKpis);
const campaignsCode = stripComments(adflowCampaigns);
const statsCode = stripComments(adflowStats);
const reportsCode = stripComments(adflowReportsSvc);
const dashboardCode = stripComments(adflowDashboardPage);
const campaignCardCode = stripComments(adflowCampaignCard);
const registryCode = stripComments(metricRegistry);
const productCopyCode = stripComments(adflowProductCopy);
const mockupsCode = stripComments(adflowMockups);

/* 8a. The invented revenue multiplier — leads × a flat $250 per booking. */
for (const [label, code] of [
  ["dashboardKpis.ts", kpisCode],
  ["campaigns.ts", campaignsCode],
  ["wave73KpiStats.ts", statsCode],
  ["AdFlowDashboard.tsx", dashboardCode],
] as const) {
  assert.ok(
    !/\*\s*25_?000/.test(code) && !/25_?000\s*;/.test(code),
    `REGRESSION (${label}): revenue is being estimated as bookings × $250 again. Nobody measured that ticket value. Report revenue only when a person entered it.`,
  );
}
assert.ok(
  !/revenueWithFallback/.test(kpisCode),
  "REGRESSION: revenueWithFallback is back — it substituted an estimate whenever revenue_earned_cents was absent, which was always.",
);

/* 8b. Hardcoded funnel pass-through rates presented as measured conversion. */
assert.ok(
  !/spendToReach/.test(kpisCode) && !/bookToRevenue/.test(kpisCode),
  "REGRESSION: the ROI funnel's conversion rates are back. spendToReach and bookToRevenue were the literals 100 and 100, rendered to the customer as '% pass-through'.",
);

/* 8c. Platform guessed by substring-matching the campaign NAME. */
for (const [label, code] of [
  ["campaigns.ts", campaignsCode],
  ["wave73KpiStats.ts", statsCode],
] as const) {
  assert.ok(
    !/includes\(\s*"(pmax|fb|facebook|instagram|google|meta|bing|microsoft|search)"\s*\)/i.test(code),
    `REGRESSION (${label}): campaign platform is being inferred from the campaign name again. A Meta campaign called "Spring Search Blitz" gets labelled Google on the customer's dashboard. Platform must come from an explicit reported field.`,
  );
}
assert.ok(
  /reportedPlatform/.test(campaignsCode) &&
    !/detectPlatform|detectPlatformFromName/.test(campaignsCode),
  "campaign platform must be read from an explicit reported field via reportedPlatform(), not detected",
);

/* 8d. The constant LTV score, and the unsourced industry benchmark it fed. */
assert.ok(
  !/ltvTrend|scoreFromLtvTrend|ltvTrendScore/i.test(campaignsCode + campaignCardCode),
  "REGRESSION: the LTV trend factor is back. It returned a hardcoded 50 (or 65) and was rendered to the customer as 'Customer lifetime trend 50/100' with a progress bar. No LTV is measured anywhere.",
);
assert.ok(
  !/INDUSTRY_AVG_CPB_CENTS|15_000/.test(campaignsCode),
  "REGRESSION: the invented $150 cost-per-booking 'industry average' benchmark is back. It was never sourced, and the campaign card stated it to customers as fact.",
);
assert.ok(
  !/industry average/i.test(campaignsCode + campaignCardCode + registryCode),
  "REGRESSION: an 'industry average' is being quoted to customers again. We have not measured one.",
);
assert.ok(
  !/gradeForScore|LetterGradeBadge/.test(campaignsCode + campaignCardCode),
  "REGRESSION: the A-F campaign grade is back. Half of it scored against the invented benchmark and a fifth of it was the constant LTV — there is no measured input left to grade with.",
);

/* 8e. The two permanently hardcoded charts. */
assert.ok(
  !/\[\s*3,\s*4,\s*6,\s*5,\s*8,\s*9,\s*11,\s*14,\s*12,\s*10,\s*11,\s*13\s*\]/.test(
    statsCode + dashboardCode,
  ),
  "REGRESSION: the hardcoded [3,4,6,5,8,9,11,14,12,10,11,13] 'peak ROAS' sparkline is back. Every customer without revenue data saw that identical rising curve and its '+11x ROAS' label.",
);
assert.ok(
  !/x ROAS/.test(statsCode + dashboardCode),
  "REGRESSION: a synthetic 'Nx ROAS' peak label is back. ROAS needs revenue, which is only ever present if a person entered it.",
);
for (const [label, code] of [
  ["wave73KpiStats.ts", statsCode],
  ["AdFlowDashboard.tsx", dashboardCode],
] as const) {
  assert.ok(
    !/label:\s*"Google"\s*,\s*value:\s*1800/.test(code) &&
      !/value:\s*1100/.test(code) &&
      !/value:\s*400\s*\}/.test(code),
    `REGRESSION (${label}): the hardcoded Google 1800 / Meta 1100 / Bing 400 spend donut is back. It was shown to customers who may run on none of those platforms.`,
  );
  assert.ok(
    !/4 \+ i \* 1\.2/.test(code),
    `REGRESSION (${label}): the synthetic monthly-leads ramp Math.round(4 + i * 1.2) is back.`,
  );
}

/* 8f. Reported leads must reach the chart at their reported value. */
assert.ok(
  !/leads \* 2|\* 2,\s*\/\/ matches Wave 72/.test(statsCode),
  "REGRESSION: reported leads are being doubled before display again ('derived leads ≈ jobs × 2'). The chart must show the number the ads team reported.",
);
assert.ok(
  !/thisMonth \?\? 0\) \* 2|lastMonth \?\? 0\) \* 2/.test(dashboardCode),
  "REGRESSION: the dashboard's leads fallback is doubling reported figures again.",
);

/* 8g. The synthetic daily breakdown written back into a real field. */
assert.ok(
  !/generateSyntheticBreakdown/.test(reportsCode),
  "REGRESSION: generateSyntheticBreakdown is back. It spread a period total evenly across every day of the month and stored it as metrics.daily_breakdown — indistinguishable downstream from data a person supplied, and read back out as a measured trend by the dashboard sparkline.",
);
assert.ok(
  !/synthetic/i.test(kpisCode + campaignsCode + statsCode + reportsCode + dashboardCode),
  "REGRESSION: something in the AdFlow path is synthesising numbers again. If a figure was not reported or measured, render an empty state.",
);

/* 8h. The two fabricated heatmaps stay deleted. */
assert.ok(
  !existsSync(join(adflowDir, "heatmaps.ts")),
  "REGRESSION: the AdFlow heatmaps endpoint is back. The day-parting grid spread each day's total across 24 hours with a hardcoded HOUR_WEIGHTS curve — no hour-level ad data has ever existed in this system — and the trade grid valued every booking at a flat $250.",
);
assert.ok(
  !/HOUR_WEIGHTS/.test(kpisCode + campaignsCode + statsCode + dashboardCode),
  "REGRESSION: the invented hourly distribution curve is back.",
);
assert.ok(
  !/Heatmap/.test(adflowRouteIndex) && !/Heatmap/.test(dashboardCode),
  "the deleted heatmap surfaces must not be re-registered or re-rendered",
);

/* 8i. Provenance: the dashboard must say these figures were typed in, by whom. */
assert.ok(
  /enteredBy/.test(kpisCode) && /enteredAt/.test(kpisCode),
  "the KPI payload must carry who entered the reported figures and when — that is what makes 'reported' an honest label rather than a disclaimer",
);
assert.ok(
  /entered_by_name/.test(
    readFileSync(join(serverDir, "routes", "adminCrmRoutes.ts"), "utf8"),
  ),
  "the ops metrics-entry endpoint must stamp who entered the figures, or the dashboard has nothing truthful to show",
);
assert.ok(
  /Reported by your ads team/.test(dashboardCode),
  "the dashboard must label reported figures as reported",
);
assert.ok(
  /Measured by WeFixTrades/.test(dashboardCode),
  "the dashboard must label the figures it measures itself, distinctly from the reported ones",
);
assert.ok(
  /No ad data entered for this period/.test(dashboardCode),
  "with nothing entered the dashboard must say so — an empty state is honest, an invented chart is not",
);
assert.ok(
  /Not reported/.test(dashboardCode) && /Not reported/.test(campaignCardCode),
  "an unreported figure must render as 'Not reported', never as 0 — a 0 reads as a measured zero",
);

/* 8j. No claim of an ad-platform connection, anywhere customer-facing. */
const adflowProductBlock = (() => {
  const start = productCopyCode.indexOf('slug: "adflow"');
  assert.ok(start !== -1, "the AdFlow product entry must still exist");
  const next = productCopyCode.indexOf("slug: ", start + 20);
  return productCopyCode.slice(start, next === -1 ? undefined : next);
})();
assert.ok(
  /does not connect to Google Ads or Meta/i.test(adflowProductBlock),
  "the AdFlow product page must state plainly that WeFixTrades does not connect to the customer's ad accounts",
);
assert.ok(
  !/One signal flowing end-to-end/.test(mockupsCode),
  "REGRESSION: the 'Connected To Your Funnel' marketing panel is back — it claimed a Google Ads / Meta Ads / CRM integration that does not exist, drawn with orbiting platform logos.",
);
assert.ok(
  !/ads_management/.test(
    productCopyCode + mockupsCode + kpisCode + campaignsCode + statsCode,
  ),
  "the ads_management permission must never be requested or referenced while AdFlow has no ad-platform integration",
);

/* 8l. Marketing may illustrate, but never assert, an ad result.
 *
 * Nothing in this product measures ROAS: revenue only exists if a person types
 * it in. So every AdFlow marketing figure has to read as an illustration. The
 * product index carried a bare "4× / return on ad spend" headline stat; the
 * homepage tile and the product panels carried "3.2× ROAS", "8.4% CTR" and
 * "$8 240 Revenue from ads" with no qualifier at all.
 */
const productIndexAdflowRow = (() => {
  const src = stripComments(
    readFileSync(
      join(repoRoot, "client", "src", "pages", "product", "ProductIndex.tsx"),
      "utf8",
    ),
  );
  const i = src.indexOf('slug: "adflow"');
  assert.ok(i !== -1, "the AdFlow product-index row must still exist");
  return src.slice(i, src.indexOf("\n", i) + 1);
})();
assert.ok(
  !/roas|return on ad spend/i.test(productIndexAdflowRow),
  "REGRESSION: the AdFlow product-index tile advertises a return-on-ad-spend figure. No ROAS is measured anywhere in this product.",
);

const serviceStackAdflow = (() => {
  const src = stripComments(
    readFileSync(
      join(repoRoot, "client", "src", "components", "marketing", "ServiceStackTimeline.tsx"),
      "utf8",
    ),
  );
  const i = src.indexOf('product: "AdFlow"');
  assert.ok(i !== -1, "the AdFlow service-stack entry must still exist");
  const end = src.indexOf("},", src.indexOf("tile:", i));
  return src.slice(i, end === -1 ? undefined : end);
})();
for (const [label, block] of [
  ["ServiceStackTimeline.tsx", serviceStackAdflow],
  ["product-mockups.tsx", (() => {
    const i = mockupsCode.indexOf("adflow: [");
    assert.ok(i !== -1, "the AdFlow mockup block must still exist");
    return mockupsCode.slice(i, mockupsCode.indexOf("bookflow: [", i));
  })()],
] as const) {
  // Matches both the object-literal form (label: "x") and the JSX prop form
  // (label="x") — the mockup tiles use the latter.
  for (const m of block.matchAll(/label[:=]\s*"([^"]*)"/g)) {
    const text = m[1]!;
    if (!/roas|ctr|click-through|revenue|cost per lead|cpl|leads delivered|active ads|vs diy/i.test(text)) {
      continue;
    }
    assert.ok(
      /example/i.test(text),
      `REGRESSION (${label}): the AdFlow marketing figure labelled "${text}" is presented as a result. It is not measured — label it as an example or remove it.`,
    );
  }
}

/* 8k. The Copilot must not be handed the retired fabricated metrics. */
for (const dead of ["jobsBooked", "revenueEarned", "costPerBooking", "customersReached"]) {
  assert.ok(
    !new RegExp(`\\b${dead}\\b`).test(
      registryCode.slice(registryCode.indexOf("const ADFLOW")),
    ),
    `REGRESSION: metricRegistry re-registers AdFlow "${dead}". It relabelled a hand-typed lead count as booked jobs, or an estimate as earned revenue, and the Copilot quotes this text to customers verbatim.`,
  );
}

console.log(
  "adflow-action-honesty guard: OK (no false campaign-state claims; requests create real tasks; no synthetic AdFlow telemetry — no invented revenue multiplier, constant LTV, name-guessed platform, hardcoded charts or synthesised daily breakdown; reported figures carry provenance; placeholder domains blocked on assign+send; MapGuard grid geography not fabricated)",
);
