/**
 * SiteLaunch engine guard.
 *
 * Protects the invariants that make this product safe to sell. Each block
 * carries a DELIBERATE-FAILURE fixture: the assertion is written so that
 * reverting the behaviour it guards turns the test red, not merely so that
 * the current code passes.
 *
 * Coverage:
 *   1. RENDERER SHAPE — a document renders to one complete, standalone,
 *      responsive HTML page: doctype, viewport, title, meta description,
 *      canonical, LocalBusiness JSON-LD, an <h1>, an inline stylesheet and a
 *      mobile breakpoint. No external stylesheet or font request.
 *   2. XSS — every hostile string in customer/LLM content is escaped. A
 *      <script> in a business name or a heading must not survive into the
 *      output, and javascript: hrefs are dropped.
 *   3. THEMES ARE STRUCTURAL — the four themes produce materially different
 *      markup and CSS, not the same page in four colours.
 *   4. BRAND CONTRAST — a customer brand colour never yields an illegible
 *      CTA; the derived on-accent ink always clears WCAG AA.
 *   5. IMAGE PROVENANCE — a generated image can never appear in a portfolio
 *      gallery, and the prompt policy refuses prohibited subjects.
 *   6. HONEST STATUS — domain provisioning reports `implemented: false`, and
 *      the removed SSL simulation cannot be reported as an active
 *      certificate.
 *   7. NO AUTO-PUBLISH — the draft generator never emits a published state
 *      and never claims facts the intake did not supply.
 *
 * No DB, no network, no browser — every function under test is pure.
 *
 * Excluded from `tsc --noEmit` via the **\/*.test.ts tsconfig pattern.
 * Runnable standalone:  npx tsx server/services/sitelaunch/engine.test.ts
 * Wired into CI as `npm run check:sitelaunch-engine`.
 */
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://stub:stub@localhost:5432/stub";
if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";

const {
  siteDocumentSchema,
  SITELAUNCH_THEME_IDS,
  SITELAUNCH_THEMES,
  recommendedTheme,
} = await import("@shared/sitelaunch/document");
const { renderPage } = await import("./renderer");
const { buildAccentRamp, parseHex, contrastRatio } = await import("./color");
const { checkImagePrompt, buildHeroImagePrompt, customerPhotos } = await import("./imagePolicy");
const { domainProvisioningState, evaluateSiteLaunchGate, canProvisionDomains } = await import("./gate");
const { honestSslStatus } = await import("../../routes/domainRoutes");
const { generateDraft } = await import("./draftGenerator");

let passed = 0;
let failed = 0;
async function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${label}`);
  } catch (err: any) {
    failed++;
    console.error(`  FAIL ${label}: ${err?.message ?? err}`);
  }
}

/* ═══ Fixtures ═══ */

function makeDoc(overrides: Record<string, unknown> = {}) {
  return siteDocumentSchema.parse({
    version: 1,
    theme_id: "trade-classic",
    brand: { primary: "#1f6feb", secondary: "", logo_url: "", heading_font: "", body_font: "", source: "manual" },
    business: {
      name: "Northside Plumbing",
      tagline: "Drains, taps and hot water",
      phone: "555-0100",
      email: "hello@example.com",
      street: "12 Bay Street",
      city: "Barrie",
      region: "ON",
      postal_code: "L4M",
      country: "CA",
      hours: ["Mon-Fri  8am-6pm", "Sat  9am-1pm"],
      service_areas: ["Barrie", "Innisfil"],
      social: [],
      license_number: "",
      founded_year: "",
    },
    pages: [
      {
        id: "p1",
        slug: "",
        title: "Home",
        nav_label: "Home",
        show_in_nav: true,
        meta_title: "Northside Plumbing",
        meta_description: "Plumbing in Barrie, Ontario.",
        sections: [
          {
            id: "hero1",
            type: "hero",
            props: {
              eyebrow: "Barrie, ON",
              headline: "Plumbing that turns up",
              subhead: "Drains, taps and hot water across Barrie.",
              primary_cta: { label: "Call now", href: "tel:5550100" },
              secondary_cta: { label: "Services", href: "services" },
              credentials: ["Licensed"],
            },
          },
          {
            id: "svc1",
            type: "services",
            props: {
              heading: "What we do",
              items: [
                { title: "Drain clearing", description: "Blocked drains cleared.", icon: "droplet" },
                { title: "Hot water", description: "Tank and tankless.", icon: "flame" },
                { title: "Leak repair", description: "Found and fixed.", icon: "wrench" },
              ],
            },
          },
          { id: "stat1", type: "stats", props: { items: [{ value: "24/7", label: "Emergency" }, { value: "2", label: "Areas" }] } },
          { id: "faq1", type: "faq", props: { items: [{ question: "Do you cover Innisfil?", answer: "Yes." }] } },
          { id: "cta1", type: "cta", props: { headline: "Book a visit", subhead: "" } },
        ],
      },
      {
        id: "p2",
        slug: "services",
        title: "Services",
        nav_label: "Services",
        show_in_nav: true,
        meta_title: "Services",
        meta_description: "Our plumbing services.",
        sections: [
          {
            id: "svc2",
            type: "services",
            props: { heading: "Our services", items: [{ title: "Drain clearing", description: "", icon: "droplet" }] },
          },
        ],
      },
    ],
    footer_note: "",
    show_powered_by: true,
    ...overrides,
  });
}

async function main() {
  console.log("SiteLaunch engine guard\n");

  /* ═══ 1. Renderer shape ═══ */
  console.log("1. Renderer produces a complete standalone responsive page");

  const doc = makeDoc();
  const out = renderPage(doc, doc.pages[0], { origin: "https://northside.example", basePath: "" });

  await check("emits a doctype and a lang attribute", () => {
    assert.match(out.html, /^<!doctype html>/i);
    assert.match(out.html, /<html lang="en">/);
  });

  await check("emits the responsive viewport meta", () => {
    assert.match(out.html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  });

  await check("emits per-page title, description and canonical", () => {
    assert.match(out.html, /<title>Northside Plumbing<\/title>/);
    assert.match(out.html, /<meta name="description" content="Plumbing in Barrie, Ontario\.">/);
    assert.match(out.html, /<link rel="canonical" href="https:\/\/northside\.example\/">/);
  });

  await check("emits LocalBusiness JSON-LD carrying the real address", () => {
    const m = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(out.html);
    assert.ok(m, "JSON-LD block missing");
    const node = JSON.parse(m![1]);
    assert.equal(node["@type"], "LocalBusiness");
    assert.equal(node.name, "Northside Plumbing");
    assert.equal(node.address.addressLocality, "Barrie");
    assert.equal(node.telephone, "555-0100");
  });

  await check("emits exactly one h1, from the hero", () => {
    const h1s = out.html.match(/<h1>/g) ?? [];
    assert.equal(h1s.length, 1, `expected 1 h1, got ${h1s.length}`);
    assert.match(out.html, /<h1>Plumbing that turns up<\/h1>/);
  });

  await check("is standalone — inline stylesheet, no external CSS/font/script requests", () => {
    assert.match(out.html, /<style>/, "stylesheet must be inlined for the ZIP export promise");
    assert.equal(/<link[^>]+rel="stylesheet"/.test(out.html), false, "no external stylesheet");
    assert.equal(/fonts\.googleapis|fonts\.gstatic|cdn\./.test(out.html), false, "no external font/CDN host");
    // The only permitted script tags are the JSON-LD block and, when a
    // calculator token is configured, the first-party embed. Neither is
    // present-and-external here.
    const scripts = out.html.match(/<script\b[^>]*>/g) ?? [];
    assert.equal(scripts.length, 1, `expected only the JSON-LD script, got ${scripts.length}`);
  });

  await check("ships a mobile-first layout with a real desktop breakpoint", () => {
    assert.match(out.html, /@media \(min-width:768px\)/);
    assert.match(out.html, /@media \(min-width:1100px\)/);
    assert.match(out.html, /@media \(prefers-reduced-motion:reduce\)/);
  });

  await check("nav links resolve through basePath and mark the current page", () => {
    const preview = renderPage(doc, doc.pages[1], { origin: "", basePath: "/sitelaunch/preview/tok", preview: true });
    assert.match(preview.html, /href="\/sitelaunch\/preview\/tok\/services" aria-current="page"/);
    assert.match(preview.html, /href="\/sitelaunch\/preview\/tok\/"/);
  });

  await check("a preview render is noindex and says so on the page", () => {
    const preview = renderPage(doc, doc.pages[0], { preview: true });
    assert.match(preview.html, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(preview.html, /not published and is not indexed/);
    // DELIBERATE FAILURE: a non-preview render must NOT be noindex, or every
    // published site would be de-indexed.
    assert.match(out.html, /<meta name="robots" content="index, follow">/);
  });

  await check("a section with no data is omitted, not shipped empty", () => {
    const thin = makeDoc();
    thin.pages[0].sections = [
      thin.pages[0].sections[0],
      { id: "gal", type: "gallery", props: { heading: "Recent work", intro: "", images: [] } },
    ];
    const r = renderPage(thin, thin.pages[0]);
    assert.equal(r.html.includes('id="gal"'), false, "empty gallery must not render a band");
    assert.ok(r.emptySections.some((s) => s.startsWith("gallery")), "empty section must be reported to the operator");
  });

  await check("a quote embed with no calculator token renders nothing at all", () => {
    const d = makeDoc();
    d.pages[0].sections = [{ id: "q", type: "quote_embed", props: { heading: "Quote", intro: "", calculator_token: undefined } }];
    const r = renderPage(d, d.pages[0], { platformOrigin: "https://wefixtrades.com" });
    assert.equal(r.html.includes('id="q"'), false);
    assert.equal(r.html.includes("embed-widget.js"), false);
  });

  await check("a contact form with no callback token never posts to a dead endpoint", () => {
    const d = makeDoc();
    d.pages[0].sections = [
      { id: "c", type: "contact", props: { heading: "Contact", intro: "", show_phone: true, show_email: true, show_address: true } },
    ];
    const r = renderPage(d, d.pages[0], { platformOrigin: "https://wefixtrades.com" });
    assert.equal(/action="https:\/\/wefixtrades\.com\/api\/widget/.test(r.html), false);
    assert.match(r.html, /action="mailto:hello@example\.com"/, "must degrade to mailto, not a dead POST");
  });

  /* ═══ 2. XSS ═══ */
  console.log("\n2. Customer + LLM content is escaped");

  await check("a script tag in a business name cannot escape into markup", () => {
    const d = makeDoc();
    d.business.name = '</title><script>alert(1)</script>';
    const r = renderPage(d, d.pages[0]);
    assert.equal(r.html.includes("<script>alert(1)</script>"), false, "raw script survived");
    assert.match(r.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  await check("a script tag in a heading cannot escape into markup", () => {
    const d = makeDoc();
    (d.pages[0].sections[0] as any).props.headline = '<img src=x onerror=alert(1)>';
    const r = renderPage(d, d.pages[0]);
    assert.equal(r.html.includes("<img src=x onerror=alert(1)>"), false);
    assert.match(r.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  await check("a business name cannot break out of the JSON-LD script block", () => {
    const d = makeDoc();
    d.business.name = 'Acme</script><script>alert(1)</script>';
    const r = renderPage(d, d.pages[0]);
    const block = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(r.html);
    assert.ok(block, "JSON-LD block must still parse as one block");
    assert.equal(block![1].includes("</script>"), false, "unescaped </script> inside JSON-LD");
    assert.doesNotThrow(() => JSON.parse(block![1].replace(/\\u003c/g, "<")));
  });

  await check("a javascript: href is dropped, not rendered", () => {
    const d = makeDoc();
    (d.pages[0].sections[0] as any).props.primary_cta = { label: "Click", href: "javascript:alert(1)" };
    const r = renderPage(d, d.pages[0]);
    assert.equal(r.html.includes("javascript:alert"), false);
    assert.match(r.html, /href="#">Click/);
  });

  await check("a data: image src is dropped, not rendered", () => {
    const d = makeDoc();
    (d.pages[0].sections[0] as any).props.image = { url: "data:text/html,<script>1</script>", alt: "x", provenance: "customer" };
    const r = renderPage(d, d.pages[0]);
    assert.equal(r.html.includes("data:text/html"), false);
  });

  /* ═══ 3. Themes are structural ═══ */
  console.log("\n3. The four themes differ structurally, not just by colour");

  await check("there are exactly four themes and each has metadata", () => {
    assert.equal(SITELAUNCH_THEME_IDS.length, 4);
    assert.equal(SITELAUNCH_THEMES.length, 4);
    for (const t of SITELAUNCH_THEMES) {
      assert.ok(t.name && t.character && t.best_for, `theme ${t.id} missing metadata`);
    }
  });

  const renders = SITELAUNCH_THEME_IDS.map((id) => {
    const d = makeDoc({ theme_id: id });
    return { id, html: renderPage(d, d.pages[0]).html };
  });

  await check("every theme produces a distinct page", () => {
    const seen = new Set(renders.map((r) => r.html));
    assert.equal(seen.size, 4, "two themes rendered byte-identical output");
  });

  await check("themes differ in MARKUP, not only in CSS values", () => {
    // Strip the <style> block; what remains is pure structure. If the themes
    // were colour swaps this set would collapse to one entry.
    const structures = renders.map((r) => r.html.replace(/<style>[\s\S]*?<\/style>/, ""));
    const distinct = new Set(structures);
    assert.ok(
      distinct.size >= 3,
      `expected ≥3 structurally distinct themes, got ${distinct.size} — themes have become colour swaps`,
    );
  });

  await check("themes differ in container width, radius and section rhythm", () => {
    const grab = (html: string, prop: string) => {
      const m = new RegExp(`--sl-${prop}:([^;]+);`).exec(html);
      return m ? m[1].trim() : "";
    };
    const containers = new Set(renders.map((r) => grab(r.html, "container")));
    const radii = new Set(renders.map((r) => grab(r.html, "radius")));
    const rhythm = new Set(renders.map((r) => grab(r.html, "pad-y")));
    assert.ok(containers.size >= 3, `container widths not distinct: ${[...containers].join(",")}`);
    assert.ok(radii.size >= 3, `radii not distinct: ${[...radii].join(",")}`);
    assert.ok(rhythm.size >= 3, `section rhythm not distinct: ${[...rhythm].join(",")}`);
  });

  await check("themes use distinct heading font stacks", () => {
    const stacks = new Set(
      renders.map((r) => (/--sl-font-heading:([^;]+);/.exec(r.html) ?? ["", ""])[1]),
    );
    assert.ok(stacks.size >= 3, `heading stacks not distinct: ${stacks.size}`);
  });

  await check("bold renders a full-bleed dark hero; clean renders a centred one", () => {
    // Compare MARKUP only — every theme's stylesheet defines the rules for
    // every hero variant, so a whole-document substring check would always
    // match and prove nothing.
    const markup = (id: string) =>
      renders.find((r) => r.id === id)!.html.replace(/<style>[\s\S]*?<\/style>/, "");
    assert.match(markup("trade-bold"), /class="sl-hero sl-hero--dark/);
    assert.match(markup("trade-clean"), /class="sl-hero sl-hero--center"/);
    assert.equal(markup("trade-clean").includes("sl-hero--dark"), false);
    assert.equal(markup("trade-bold").includes("sl-hero--center"), false);
  });

  await check("pro renders the utility bar; classic does not", () => {
    const pro = renders.find((r) => r.id === "trade-pro")!.html;
    const classic = renders.find((r) => r.id === "trade-classic")!.html;
    assert.match(pro, /class="sl-utility"/);
    assert.equal(classic.includes('class="sl-utility"'), false);
  });

  await check("trade → theme mapping is deterministic and defaults safely", () => {
    assert.equal(recommendedTheme("roofing"), "trade-bold");
    assert.equal(recommendedTheme("Plumbing"), "trade-classic");
    assert.equal(recommendedTheme("window cleaning"), "trade-clean"); // "window-cleaning" IS mapped
    assert.equal(recommendedTheme("septic tank servicing"), "trade-classic"); // unmapped → safe default
    assert.equal(recommendedTheme(undefined), "trade-classic");
    assert.equal(recommendedTheme("cleaning"), "trade-clean");
  });

  /* ═══ 4. Brand contrast ═══ */
  console.log("\n4. A customer brand colour can never produce an illegible CTA");

  await check("on-accent ink clears WCAG AA for hostile brand colours", () => {
    const hostile = ["#ffffff", "#000000", "#ffff00", "#f0f0f0", "#0d3cfc", "#fa4e1d", "#101010"];
    for (const hex of hostile) {
      const ramp = buildAccentRamp(hex, "#175E7A", "#FDFDFC", "#1B2228");
      const bg = parseHex(ramp.base)!;
      const ink = parseHex(ramp.onBase)!;
      const ratio = contrastRatio(bg, ink);
      assert.ok(ratio >= 4.5, `brand ${hex} → accent ${ramp.base} / ink ${ramp.onBase} = ${ratio.toFixed(2)}:1`);
    }
  });

  await check("an unparseable brand colour falls back to the theme accent", () => {
    const ramp = buildAccentRamp("not-a-colour", "#175E7A", "#FDFDFC", "#1B2228");
    assert.equal(ramp.base.toLowerCase(), "#175e7a");
  });

  await check("the brand colour actually reaches the rendered page", () => {
    const d = makeDoc();
    d.brand.primary = "#8a2be2";
    const r = renderPage(d, d.pages[0]);
    assert.match(r.html, /--sl-accent:#8a2be2;/);
    assert.match(r.html, /<meta name="theme-color" content="#8a2be2">/);
  });

  /* ═══ 5. Image provenance ═══ */
  console.log("\n5. Generated imagery can never be presented as the customer's work");

  await check("a generated image is filtered out of a portfolio gallery", () => {
    const d = makeDoc();
    d.pages[0].sections = [
      {
        id: "gal",
        type: "gallery",
        props: {
          heading: "Recent work",
          intro: "",
          images: [
            { url: "https://cdn.example/ai.png", alt: "ai", provenance: "generated" },
            { url: "https://cdn.example/real.png", alt: "real", provenance: "customer" },
          ],
        },
      },
    ];
    const r = renderPage(d, d.pages[0]);
    assert.equal(r.html.includes("ai.png"), false, "a generated image reached a portfolio gallery");
    assert.match(r.html, /real\.png/);
  });

  await check("a gallery of ONLY generated images renders no gallery at all", () => {
    const d = makeDoc();
    d.pages[0].sections = [
      {
        id: "gal",
        type: "gallery",
        props: {
          heading: "Recent work",
          intro: "",
          images: [{ url: "https://cdn.example/ai.png", alt: "ai", provenance: "generated" }],
        },
      },
    ];
    assert.equal(renderPage(d, d.pages[0]).html.includes('id="gal"'), false);
  });

  await check("the prompt policy refuses prohibited subjects", () => {
    for (const bad of [
      "photo of our crew on site",
      "a completed job in Barrie",
      "team photo outside the company van",
      "before and after of a roof",
    ]) {
      assert.equal(checkImagePrompt(bad).allowed, false, `policy allowed: ${bad}`);
    }
  });

  await check("the only prompt builder we ship passes its own policy", () => {
    const prompt = buildHeroImagePrompt("roofing", "clean, professional");
    assert.equal(checkImagePrompt(prompt).allowed, true, checkImagePrompt(prompt).reason);
    assert.match(prompt, /no people/i);
  });

  await check("customer photos are the only source of `customer` provenance", () => {
    const photos = customerPhotos([{ url: "https://cdn.example/a.jpg", alt: "A" }, { url: "  ", alt: "" }]);
    assert.equal(photos.length, 1);
    assert.equal(photos[0].provenance, "customer");
  });

  /* ═══ 6. Honest status ═══ */
  console.log("\n6. No surface claims a capability we do not have");

  await check("domain provisioning reports itself as NOT implemented", () => {
    const state = domainProvisioningState();
    assert.equal(state.implemented, false, "phase 1 must not claim automated provisioning");
    assert.match(state.message, /manual/i);
    assert.equal(canProvisionDomains(), false);
  });

  await check("even with the phase-2 flag ON, provisioning stays unavailable", () => {
    const prev = process.env.SITELAUNCH_DOMAIN_PROVISIONING_ENABLED;
    process.env.SITELAUNCH_DOMAIN_PROVISIONING_ENABLED = "true";
    try {
      assert.equal(domainProvisioningState().flagEnabled, true);
      assert.equal(canProvisionDomains(), false, "a flag alone must never enable unbuilt automation");
    } finally {
      if (prev === undefined) delete process.env.SITELAUNCH_DOMAIN_PROVISIONING_ENABLED;
      else process.env.SITELAUNCH_DOMAIN_PROVISIONING_ENABLED = prev;
    }
  });

  await check("the generation gate ships OFF and fails closed", () => {
    assert.equal(evaluateSiteLaunchGate(false).allowed, false);
    assert.match(evaluateSiteLaunchGate(false).reason ?? "", /SITELAUNCH_ENGINE_ENABLED/);
    assert.equal(evaluateSiteLaunchGate(true).allowed, true);
  });

  await check("a simulated SSL status is never reported as an active certificate", () => {
    // These two values could only have been written by the removed
    // setTimeout simulation in domainRoutes.ts.
    assert.equal(honestSslStatus("active").ssl_status, "unverified");
    assert.equal(honestSslStatus("provisioning").ssl_status, "unverified");
    assert.ok(honestSslStatus("active").ssl_note, "must explain why it is unverified");
    // Honest values pass through untouched.
    assert.equal(honestSslStatus("none").ssl_status, "none");
    assert.equal(honestSslStatus("manual_required").ssl_status, "manual_required");
    assert.equal(honestSslStatus(undefined).ssl_status, "none");
  });

  await check("the SSL simulation is gone from the source, not just bypassed", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync("server/routes/domainRoutes.ts", "utf8");
    // Strip comments before scanning: the file DOCUMENTS the removed
    // simulation, and that prose must not read as the code being back.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.equal(/setTimeout\s*\(/.test(code), false, "the SSL setTimeout simulation is back");
    assert.equal(/ssl_status:\s*['"]active['"]/.test(code), false, "code writes ssl_status:'active' again");
    assert.equal(/simulation/i.test(code), false, "a simulation branch is back in the code path");
    assert.match(code, /res\.status\(501\)/, "issue-ssl must answer 501 Not Implemented");
  });

  /* ═══ 7. Draft generation ═══ */
  console.log("\n7. Draft generation is structural, honest and never auto-publishes");

  const intake = {
    business_name: "Cedar Ridge Roofing",
    trade_type: "roofing",
    phone: "555-0111",
    email: "hi@example.com",
    city: "Barrie",
    region: "ON",
    services: ["Roof replacement", "Gutter cleaning", "Storm damage repair"],
    service_areas: ["Barrie", "Orillia"],
    hours: ["Mon-Fri  7am-5pm"],
  };
  const brand = { primary: "", secondary: "", logo_url: "", heading_font: "", body_font: "", source: "theme_default" as const };
  const draft = await generateDraft(intake, { brand, skipAi: true });

  await check("a draft with NO AI still produces a complete, valid document", () => {
    assert.doesNotThrow(() => siteDocumentSchema.parse(draft.document));
    assert.ok(draft.document.pages.length >= 5, `expected ≥5 pages, got ${draft.document.pages.length}`);
    assert.ok(draft.document.pages.length <= 7, "SKU promises a 5-7 page site");
    assert.equal(draft.aiCopyUsed, false);
    assert.ok(draft.aiError, "an AI-less run must report why");
  });

  await check("the deterministic page plan is the one the SKU sells", () => {
    const slugs = draft.document.pages.map((p) => p.slug);
    assert.ok(slugs.includes(""), "no home page");
    assert.ok(slugs.includes("services"));
    assert.ok(slugs.includes("about"));
    assert.ok(slugs.includes("contact"));
    assert.ok(slugs.includes("service-areas"));
  });

  await check("theme is derived from the trade, not left to the model", () => {
    assert.equal(draft.document.theme_id, "trade-bold"); // roofing → bold
  });

  await check("every generated page renders without throwing", () => {
    for (const page of draft.document.pages) {
      const r = renderPage(draft.document, page, { origin: "https://cedar.example" });
      assert.match(r.html, /^<!doctype html>/i);
      assert.ok(r.html.length > 1000, `page ${page.slug || "(home)"} rendered suspiciously short`);
    }
  });

  await check("EVERY page has exactly one h1 — including hero-less pages", () => {
    // The SKU sells "proper headings". Only the home page and the per-service
    // pages carry a hero; services / about / areas / contact must promote
    // their first section heading instead of shipping zero h1s.
    for (const page of draft.document.pages) {
      const html = renderPage(draft.document, page, { origin: "https://cedar.example" }).html;
      const count = (html.match(/<h1[\s>]/g) ?? []).length;
      assert.equal(count, 1, `page "${page.slug || "(home)"}" has ${count} h1 elements`);
    }
  });

  await check("the nav is real markup, not hidden behind a closed <details>", () => {
    // A closed <details> hides its non-summary children through the UA slot,
    // so no stylesheet can reveal them — the desktop nav was invisible.
    const html = renderPage(draft.document, draft.document.pages[0]).html;
    assert.equal(html.includes("<details class=\"sl-nav-toggle\""), false, "nav is back inside a <details>");
    assert.match(html, /<nav class="sl-nav" aria-label="Primary">/);
    assert.ok((html.match(/<nav class="sl-nav"/g) ?? []).length === 1, "duplicate primary nav");
  });

  await check("opening hours keep the dash inside a time range", () => {
    const d = makeDoc();
    d.business.hours = ["Monday  7am - 5pm", "Saturday  Closed"];
    d.pages[0].sections = [{ id: "h", type: "hours", props: { heading: "Opening hours", note: "" } }];
    const html = renderPage(d, d.pages[0]).html;
    assert.match(html, /<span>Monday<\/span><span>7am - 5pm<\/span>/);
    assert.match(html, /<span>Saturday<\/span><span>Closed<\/span>/);
  });

  await check("a decorative hero background image carries an empty alt", () => {
    const d = makeDoc({ theme_id: "trade-bold" });
    (d.pages[0].sections[0] as any).props.image = {
      url: "https://cdn.example/bg.jpg",
      alt: "Completed roof",
      provenance: "customer",
    };
    const html = renderPage(d, d.pages[0]).html;
    assert.match(html, /<div class="sl-hero-bg" aria-hidden="true"><img src="https:\/\/cdn\.example\/bg\.jpg" alt=""/);
  });

  await check("nothing claims a credential the intake did not supply", () => {
    const all = draft.document.pages
      .map((p) => renderPage(draft.document, p).html)
      .join("\n")
      .toLowerCase();
    for (const claim of ["licensed and insured", "award-winning", "years of experience", "5-star", "voted best"]) {
      assert.equal(all.includes(claim), false, `unsupported claim rendered: "${claim}"`);
    }
  });

  await check("missing facts are reported to the operator, not papered over", () => {
    assert.ok(draft.missingFacts.includes("photos of completed work"));
    assert.ok(draft.missingFacts.includes("licence / registration number"));
    assert.ok(draft.missingFacts.includes("years in business"));
  });

  await check("a supplied credential IS allowed through", async () => {
    const withLicence = await generateDraft(
      { ...intake, license_number: "ON-4471", years_in_business: "12" },
      { brand, skipAi: true },
    );
    const html = renderPage(withLicence.document, withLicence.document.pages[0]).html;
    assert.match(html, /ON-4471/);
    assert.match(html, /12 years in business/);
    assert.equal(withLicence.missingFacts.includes("licence / registration number"), false);
  });

  await check("no generated document carries a published/live state", () => {
    const serialised = JSON.stringify(draft.document);
    assert.equal(/"status"\s*:\s*"published"/.test(serialised), false);
    assert.equal(/"domain_status"/.test(serialised), false, "a document must not carry domain state");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
