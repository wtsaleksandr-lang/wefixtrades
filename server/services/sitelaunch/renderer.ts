/**
 * SiteLaunch — the server-side renderer.
 *
 * document + page → one complete, standalone, responsive HTML file.
 *
 * WHY SERVER-SIDE. The SKU contractually promises "SEO-ready structure —
 * proper headings, meta tags, image optimization, and local SEO foundations"
 * (client/src/config/products.ts:308). The existing QuoteQuick hosted-tenant
 * model resolves the tenant in the BROWSER (shared/slugUtils.ts
 * `hostedSlugFromHost()` reads window.location) and ships the same SPA bundle
 * to every tenant — server/lib/ogMiddleware.ts documents that consequence
 * explicitly ("skipped in this PR"). A crawler would receive no per-site
 * <title>, no meta description and no JSON-LD. So SiteLaunch renders HTML on
 * the server from the DB instead.
 *
 * WHY STRINGS, NOT REACT SSR. Three reasons, in order of weight:
 *   1. The export promise. "You own the website… if you ever leave, you take
 *      it with you" (products.ts:304) requires each page to be a single file
 *      with zero external requests. A React SSR shell would still need a
 *      hydration bundle and a Tailwind stylesheet to look right.
 *   2. Testability. `renderPage()` is a pure function — the guard test
 *      (renderer.test.ts) asserts real output with no DOM, no browser and no
 *      build step.
 *   3. The marketing components are Tailwind + framer-motion client
 *      components behind `@/` aliases; importing them into the Express
 *      process would pull the client build graph into the server bundle.
 *
 * The REUSE is therefore at the level of the section vocabulary and the
 * design language (see the mapping table in shared/sitelaunch/document.ts),
 * not literal component imports. That is stated plainly rather than claimed
 * as component reuse it is not.
 *
 * SAFETY. Every interpolated value passes through `esc()`. Customer content
 * is untrusted: it arrives from an intake form and from an LLM. No section
 * accepts raw HTML anywhere in the document model.
 */

import {
  type SiteDocument,
  type SitePage,
  type SiteSection,
  type SiteImage,
  navPages,
  pagePath,
} from "@shared/sitelaunch/document";
import { resolveTheme, type ResolvedTheme } from "./themes";
import { buildStylesheet } from "./css";

/* ────────────────────────────────────────────────────────────────────────
 * Escaping + small helpers
 * ──────────────────────────────────────────────────────────────────────── */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** HTML-escape. Applied to EVERY interpolated value without exception. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Escape a value being placed inside a <script type="application/ld+json">
 *  block. JSON.stringify handles quoting; `<` must still be neutralised so a
 *  crafted business name cannot close the script element. */
// "\u" is assembled from a char code rather than written as a source
// escape so no editor or tool round-trip can silently turn the
// replacement strings back into the raw characters they neutralise.
const UESC = String.fromCharCode(92) + "u";
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

function jsonLdSafe(value: unknown): string {
  return JSON.stringify(value)
    .split("<")
    .join(`${UESC}003c`)
    .split(LINE_SEP)
    .join(`${UESC}2028`)
    .split(PARA_SEP)
    .join(`${UESC}2029`);
}

/**
 * Resolve a document link to an href.
 *   - "tel:" / "mailto:" / "http(s)://" / "#anchor" pass through
 *   - anything else is treated as an internal page slug
 * Any other scheme (javascript:, data:) is dropped to "#" — customer and LLM
 * content is untrusted.
 */
function resolveHref(raw: string, opts: RenderOptions): string {
  const value = (raw || "").trim();
  if (!value) return "#";
  if (/^(tel:|mailto:)/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("#")) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "#"; // unknown scheme — drop
  const slug = value.replace(/^\/+/, "");
  return `${opts.basePath}${slug ? `/${slug}` : "/"}`.replace(/\/{2,}/g, "/") || "/";
}

/**
 * Href for an INTERNAL page, addressed by its slug. Distinct from
 * `resolveHref` because "" is a legitimate slug (the home page) whereas an
 * empty user-supplied link field is not — collapsing the two made every
 * "Home" nav item render as `href="#"`.
 */
function internalHref(slug: string, opts: RenderOptions): string {
  const clean = (slug || "").replace(/^\/+|\/+$/g, "");
  return `${opts.basePath}/${clean}`.replace(/([^:])\/{2,}/g, "$1/");
}

/** Only http(s) and root-relative image sources are emitted. */
function safeImageSrc(url: string): string | null {
  const value = (url || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return value;
  return null;
}

/* ── Icon allowlist ──────────────────────────────────────────────────────
 * A tiny inline-SVG set. Unknown keys fall back to `wrench` rather than
 * rendering an empty box. Paths are 24x24, stroke-based, currentColor. */
const ICONS: Record<string, string> = {
  wrench: "M14.7 6.3a4 4 0 0 1-5 5L5 16l3 3 4.7-4.7a4 4 0 0 0 5-5l-2 2-2-2 2-2Z",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
  droplet: "M12 3s6 6.3 6 10a6 6 0 1 1-12 0c0-3.7 6-10 6-10Z",
  flame: "M12 3c3 4 5 5.5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1.5 1 2 1.5 2 .5-2 .5-4 1.5-7Z",
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  shield: "M12 3 5 6v5.5c0 4.5 3 8 7 9.5 4-1.5 7-5 7-9.5V6l-7-3Z",
  clock: "M12 7v5l3.5 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  phone: "M5 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L15 13l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 3 5.2 2 2 0 0 1 5 3Z",
  check: "m4 12.5 5 5L20 6.5",
  star: "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z",
  leaf: "M20 4C10 4 4 9 4 16c0 2 1 4 1 4s2-8 15-12c0 0-4 8-11 9",
  brush: "M9 14 4 19c-1 1 0 3 1.5 2.5L11 19M14.5 4.5 20 10l-6 6-5.5-5.5 6-6Z",
  truck: "M3 7h11v9H3V7Zm11 3h4l3 3v3h-7v-6ZM7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  ruler: "m3 16 5-5 3 3 5-5 3 3-8 8-8-4Z",
  map: "m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15",
};

function icon(key: string): string {
  const path = ICONS[key] ?? ICONS.wrench;
  return `<span class="sl-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg></span>`;
}

/* ────────────────────────────────────────────────────────────────────────
 * Render options
 * ──────────────────────────────────────────────────────────────────────── */

export interface RenderOptions {
  /** Absolute origin used for canonical/OG URLs, e.g. "https://acme.example". */
  origin: string;
  /** Path prefix every internal link is written under. "" for a real site;
   *  "/sitelaunch/preview/<token>" when rendering an admin preview. */
  basePath: string;
  /** True when this render is a preview — adds noindex and a preview banner
   *  so a staged draft can never be mistaken for a live, indexed page. */
  preview: boolean;
  /**
   * Origin serving the QuoteQuick embed script and the FreeTools widget API.
   * Absent → embed-backed sections degrade to an honest note instead of
   * emitting a script tag that 404s.
   */
  platformOrigin?: string;
  /** Rendered into the export README / footer. */
  generatedAt?: Date;
}

const DEFAULT_OPTIONS: RenderOptions = {
  origin: "",
  basePath: "",
  preview: false,
};

/* ────────────────────────────────────────────────────────────────────────
 * Section renderers
 * ──────────────────────────────────────────────────────────────────────── */

function button(link: { label: string; href: string } | undefined, kind: "primary" | "secondary", opts: RenderOptions): string {
  if (!link || !link.label) return "";
  return `<a class="sl-btn sl-btn-${kind}" href="${esc(resolveHref(link.href, opts))}">${esc(link.label)}</a>`;
}

/**
 * Every page needs exactly one h1 — part of the "proper headings" promise —
 * and the services / about / contact / areas pages have no hero to supply
 * one. `PENDING_H1` is armed once per page render; the first section that
 * emits a heading consumes it and renders an h1 sized like an h2, and every
 * later heading stays an h2. Module state is safe because `renderPage` is
 * synchronous and single-pass.
 */
let PENDING_H1 = false;

function takeHeadingTag(): "h1" | "h2" {
  if (PENDING_H1) {
    PENDING_H1 = false;
    return "h1";
  }
  return "h2";
}

function sectionHead(eyebrow: string, heading: string, intro: string, headingTag?: "h1" | "h2"): string {
  const parts: string[] = [];
  if (eyebrow) parts.push(`<span class="sl-eyebrow">${esc(eyebrow)}</span>`);
  if (heading) {
    // An EXPLICIT "h1" is the hero's own display heading and keeps display
    // sizing. A PROMOTED h1 (hero-less page) is styled like the h2 it stands
    // in for, so the page does not suddenly grow a display-sized heading.
    const promoted = headingTag === undefined;
    const tag = headingTag ?? takeHeadingTag();
    const cls = promoted && tag === "h1" ? ' class="sl-h1-as-h2"' : "";
    parts.push(`<${tag}${cls}>${esc(heading)}</${tag}>`);
  }
  if (intro) parts.push(`<p class="sl-lede">${esc(intro)}</p>`);
  if (!parts.length) return "";
  return `<div class="sl-head">${parts.join("")}</div>`;
}

function img(image: SiteImage | undefined, className: string, lazy: boolean): string {
  if (!image) return "";
  const src = safeImageSrc(image.url);
  if (!src) return "";
  const loading = lazy ? ' loading="lazy" decoding="async"' : "";
  return `<img class="${esc(className)}" src="${esc(src)}" alt="${esc(image.alt)}"${loading}>`;
}

/**
 * IMAGE PROVENANCE RULE. A `generated` image is never placed in a section
 * whose semantics assert it depicts the customer's own work or people. This
 * is a misrepresentation guard, not a style preference — see the audit's
 * §1.8 photography finding.
 */
function isPortfolioSafe(image: SiteImage): boolean {
  return image.provenance !== "generated";
}

function renderHero(sec: Extract<SiteSection, { type: "hero" }>, rt: ResolvedTheme, opts: RenderOptions): string {
  const p = sec.props;
  const variant = rt.theme.structure.hero;
  const head = sectionHead(p.eyebrow, p.headline, p.subhead, "h1");
  const actions =
    p.primary_cta || p.secondary_cta
      ? `<div class="sl-actions">${button(p.primary_cta, "primary", opts)}${button(p.secondary_cta, "secondary", opts)}</div>`
      : "";
  const creds = p.credentials.length
    ? `<div class="sl-creds">${p.credentials.map((c) => `<span class="sl-cred">${esc(c)}</span>`).join("")}</div>`
    : "";

  if (variant === "full-bleed-dark") {
    const bgSrc = p.image ? safeImageSrc(p.image.url) : null;
    // Decorative: empty alt. With a real alt, a failed load paints the alt
    // text across the dark hero.
    const bg = bgSrc
      ? `<div class="sl-hero-bg" aria-hidden="true"><img src="${esc(bgSrc)}" alt="" loading="lazy" decoding="async"></div>`
      : "";
    return `<section class="sl-hero sl-hero--dark sl-on-dark" id="top">${bg}<div class="sl-wrap">${head}${actions}${creds}</div></section>`;
  }
  if (variant === "centered-plain") {
    return `<section class="sl-hero sl-hero--center" id="top"><div class="sl-wrap">${head}${actions}${creds}</div></section>`;
  }
  // split-image and split-credentials both put copy left, media right.
  const media = p.image
    ? `<div class="sl-hero-media sl-split-media">${img(p.image, "", false)}</div>`
    : "";
  const credsBlock = variant === "split-credentials" ? creds : "";
  const inlineCreds = variant === "split-image" ? creds : "";
  return `<section class="sl-hero" id="top"><div class="sl-wrap"><div class="sl-split">${
    `<div>${head}${actions}${inlineCreds}</div>`
  }${media}</div>${credsBlock}</div></section>`;
}

function renderServices(sec: Extract<SiteSection, { type: "services" }>, opts: RenderOptions): string {
  const p = sec.props;
  const cards = p.items
    .map((item) => {
      const inner = `${icon(item.icon)}<h3>${esc(item.title)}</h3>${
        item.description ? `<p>${esc(item.description)}</p>` : ""
      }${item.price_from ? `<span class="sl-price">From ${esc(item.price_from)}</span>` : ""}`;
      return item.href
        ? `<a class="sl-card" href="${esc(resolveHref(item.href, opts))}">${inner}</a>`
        : `<div class="sl-card">${inner}</div>`;
    })
    .join("");
  const cols = p.items.length % 4 === 0 ? " sl-grid--4" : p.items.length === 2 ? " sl-grid--2" : "";
  return `${sectionHead(p.eyebrow, p.heading, p.intro)}<div class="sl-grid sl-grid--cards${cols}">${cards}</div>`;
}

function renderFeatures(sec: Extract<SiteSection, { type: "features" }>): string {
  const p = sec.props;
  const cards = p.items
    .map(
      (item) =>
        `<div class="sl-card">${icon(item.icon)}<h3>${esc(item.title)}</h3>${
          item.description ? `<p>${esc(item.description)}</p>` : ""
        }</div>`,
    )
    .join("");
  const cols = p.items.length % 4 === 0 ? " sl-grid--4" : p.items.length === 2 ? " sl-grid--2" : "";
  return `${sectionHead(p.eyebrow, p.heading, p.intro)}<div class="sl-grid sl-grid--cards${cols}">${cards}</div>`;
}

function renderSteps(sec: Extract<SiteSection, { type: "steps" }>): string {
  const p = sec.props;
  const items = p.items
    .map(
      (item, i) =>
        `<div class="sl-step"><span class="sl-step-num">${String(i + 1).padStart(2, "0")}</span><h3>${esc(
          item.title,
        )}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ""}</div>`,
    )
    .join("");
  const cols = p.items.length % 4 === 0 ? " sl-grid--4" : p.items.length === 2 ? " sl-grid--2" : "";
  return `${sectionHead(p.eyebrow, p.heading, "")}<div class="sl-grid${cols}">${items}</div>`;
}

function renderStats(sec: Extract<SiteSection, { type: "stats" }>): string {
  const p = sec.props;
  const items = p.items
    .map(
      (item) =>
        `<div class="sl-stat"><span class="sl-stat-value">${esc(item.value)}</span><span class="sl-stat-label">${esc(
          item.label,
        )}</span></div>`,
    )
    .join("");
  return `${p.heading ? sectionHead("", p.heading, "") : ""}<div class="sl-stats">${items}</div>`;
}

function renderTrust(sec: Extract<SiteSection, { type: "trust" }>): string {
  const p = sec.props;
  const items = p.items.map((label) => `<li>${esc(label)}</li>`).join("");
  return `${p.heading ? sectionHead("", p.heading, "") : ""}<ul class="sl-trust">${items}</ul>`;
}

function renderAbout(sec: Extract<SiteSection, { type: "about" }>): string {
  const p = sec.props;
  const body = p.body.map((para) => `<p class="sl-body">${esc(para)}</p>`).join("");
  const bullets = p.bullets.length
    ? `<ul class="sl-bullets">${p.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`
    : "";
  const media = p.image ? `<div class="sl-split-media">${img(p.image, "", true)}</div>` : "";
  const copy = `<div>${sectionHead(p.eyebrow, p.heading, "")}<div style="margin-top:20px">${body}</div>${bullets}</div>`;
  return media ? `<div class="sl-split sl-split--media-first">${media}${copy}</div>` : copy;
}

function renderGallery(sec: Extract<SiteSection, { type: "gallery" }>): string {
  const p = sec.props;
  // Provenance guard: a generated image must never be presented as the
  // customer's own completed work.
  const safeImages = p.images.filter(isPortfolioSafe).filter((i) => safeImageSrc(i.url));
  if (!safeImages.length) return "";
  const figures = safeImages
    .map(
      (image) =>
        `<figure>${img(image, "", true)}${image.alt ? `<figcaption>${esc(image.alt)}</figcaption>` : ""}</figure>`,
    )
    .join("");
  return `${sectionHead("", p.heading, p.intro)}<div class="sl-gallery">${figures}</div>`;
}

function renderTestimonials(sec: Extract<SiteSection, { type: "testimonials" }>): string {
  const p = sec.props;
  if (!p.items.length) return "";
  const cards = p.items
    .map((item) => {
      const stars = item.rating
        ? `<div class="sl-rating" aria-label="${esc(item.rating)} out of 5">${"★".repeat(item.rating)}</div>`
        : "";
      const attribution = [item.author, item.location].filter(Boolean).join(", ");
      return `<div class="sl-quote">${stars}<blockquote>${esc(item.quote)}</blockquote>${
        attribution ? `<cite>${esc(attribution)}</cite>` : ""
      }</div>`;
    })
    .join("");
  const cols = p.items.length % 4 === 0 ? " sl-grid--4" : p.items.length === 2 ? " sl-grid--2" : "";
  return `${sectionHead("", p.heading, "")}<div class="sl-grid sl-grid--cards${cols}">${cards}</div>`;
}

function renderFaq(sec: Extract<SiteSection, { type: "faq" }>): string {
  const p = sec.props;
  if (!p.items.length) return "";
  const items = p.items
    .map(
      (item) =>
        `<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`,
    )
    .join("");
  return `${sectionHead("", p.heading, "")}<div class="sl-faq">${items}</div>`;
}

function renderHours(sec: Extract<SiteSection, { type: "hours" }>, doc: SiteDocument): string {
  const p = sec.props;
  if (!doc.business.hours.length) return "";
  const rows = doc.business.hours
    .map((line) => {
      /* Split on the FIRST run of 2+ spaces (or a tab) only. Splitting on a
       * hyphen as well swallowed the dash inside a real time range, so
       * "Monday  7am - 5pm" rendered as "Monday | 7am 5pm". */
      const m = /^(.*?)(?:\t|\s{2,})(.+)$/.exec(line.trim());
      return m
        ? `<li><span>${esc(m[1].trim())}</span><span>${esc(m[2].trim())}</span></li>`
        : `<li><span>${esc(line.trim())}</span></li>`;
    })
    .join("");
  return `${sectionHead("", p.heading, "")}<ul class="sl-hours">${rows}</ul>${
    p.note ? `<p class="sl-body" style="margin-top:16px">${esc(p.note)}</p>` : ""
  }`;
}

function renderServiceArea(sec: Extract<SiteSection, { type: "service_area" }>, doc: SiteDocument): string {
  const p = sec.props;
  const areas = p.areas.length ? p.areas : doc.business.service_areas;
  if (!areas.length) return "";
  // Deliberately a named list, not a map with drawn coverage. We do not hold
  // verified boundary geometry for a customer's service area, and the
  // MapGuard honesty guard exists precisely because a fabricated coverage
  // shape reads as fact. See scripts check:adflow-action-honesty.
  return `${sectionHead("", p.heading, p.intro)}<ul class="sl-areas">${areas
    .map((a) => `<li>${esc(a)}</li>`)
    .join("")}</ul>`;
}

function renderContact(
  sec: Extract<SiteSection, { type: "contact" }>,
  doc: SiteDocument,
  opts: RenderOptions,
): string {
  const p = sec.props;
  const b = doc.business;
  const facts: string[] = [];
  if (p.show_phone && b.phone)
    facts.push(
      `<li><strong>Phone</strong><a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a></li>`,
    );
  if (p.show_email && b.email)
    facts.push(`<li><strong>Email</strong><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>`);
  if (p.show_address) {
    const address = [b.street, b.city, b.region, b.postal_code].filter(Boolean).join(", ");
    if (address) facts.push(`<li><strong>Address</strong>${esc(address)}</li>`);
  }

  /**
   * HONEST FORM RULE. A form that posts nowhere is worse than no form: the
   * customer believes an enquiry arrived. So the form only POSTs when a real
   * FreeTools callback widget token is configured (the endpoint is
   * POST /api/widget/:token/callback — server/routes/widgetFreetoolsRoutes.ts).
   * Otherwise we fall back to a mailto: form, and if there is no email
   * either, we render the contact facts alone with no form at all.
   */
  const canPost = Boolean(p.callback_widget_token && opts.platformOrigin);
  const canMailto = Boolean(b.email);

  let form = "";
  if (canPost) {
    const action = `${opts.platformOrigin}/api/widget/${encodeURIComponent(p.callback_widget_token as string)}/callback`;
    form = `<form class="sl-form" method="post" action="${esc(action)}">
<label class="sl-field"><span>Your name</span><input name="name" type="text" autocomplete="name" required></label>
<label class="sl-field"><span>Phone</span><input name="phone" type="tel" autocomplete="tel" required></label>
<label class="sl-field"><span>Email</span><input name="email" type="email" autocomplete="email"></label>
<label class="sl-field"><span>How can we help?</span><textarea name="message" rows="5"></textarea></label>
<button class="sl-btn sl-btn-primary" type="submit">Request a callback</button>
</form>`;
  } else if (canMailto) {
    form = `<form class="sl-form" method="post" action="mailto:${esc(b.email)}" enctype="text/plain">
<label class="sl-field"><span>Your name</span><input name="name" type="text" autocomplete="name" required></label>
<label class="sl-field"><span>Phone</span><input name="phone" type="tel" autocomplete="tel"></label>
<label class="sl-field"><span>How can we help?</span><textarea name="message" rows="5"></textarea></label>
<button class="sl-btn sl-btn-primary" type="submit">Send enquiry</button>
</form>`;
  }

  const factsBlock = facts.length ? `<ul class="sl-contact-facts">${facts.join("")}</ul>` : "";
  const body = form
    ? `<div class="sl-contact">${form}<div>${factsBlock}</div></div>`
    : factsBlock
      ? `<div style="margin-top:24px">${factsBlock}</div>`
      : "";
  return `${sectionHead("", p.heading, p.intro)}${body}`;
}

function renderQuoteEmbed(sec: Extract<SiteSection, { type: "quote_embed" }>, opts: RenderOptions): string {
  const p = sec.props;
  // No token, or no platform origin to load the script from → skip the whole
  // section. An empty bordered box reads as a broken page.
  if (!p.calculator_token || !opts.platformOrigin) return "";
  const src = `${opts.platformOrigin}/embed-widget.js`;
  return `${sectionHead("", p.heading, p.intro)}<div class="sl-embed"><div data-wefixtrades-widget="${esc(
    p.calculator_token,
  )}"></div><script src="${esc(src)}" data-token="${esc(p.calculator_token)}" async></script></div>`;
}

function renderCta(sec: Extract<SiteSection, { type: "cta" }>, opts: RenderOptions): string {
  const p = sec.props;
  return `${sectionHead("", p.headline, p.subhead)}<div class="sl-actions">${button(
    p.primary_cta,
    "primary",
    opts,
  )}${button(p.secondary_cta, "secondary", opts)}</div>`;
}

/* ── Band assignment ─────────────────────────────────────────────────────
 * Which background a section sits on is a THEME decision, not a per-section
 * one — that is a large part of why the four themes look different. */
function bandClass(sec: SiteSection, index: number, rt: ResolvedTheme): string {
  if (sec.type === "hero") return "";
  if (sec.type === "cta") return " sl-cta";
  // A trust strip is a strip, not a full section. At full rhythm it left a
  // ~200px hole between two adjacent bands.
  const strip = sec.type === "trust" ? " sl-section--strip" : "";
  const mode = rt.theme.structure.banding;
  if (mode === "none") return strip;
  if (mode === "dark-accents") {
    return (sec.type === "stats" || sec.type === "trust" ? " sl-section--dark sl-on-dark" : "") + strip;
  }
  return (index % 2 === 0 ? "" : " sl-section--alt") + strip;
}

function renderSection(
  sec: SiteSection,
  index: number,
  doc: SiteDocument,
  rt: ResolvedTheme,
  opts: RenderOptions,
): string {
  let inner = "";
  switch (sec.type) {
    case "hero":
      return renderHero(sec, rt, opts);
    case "services":
      inner = renderServices(sec, opts);
      break;
    case "features":
      inner = renderFeatures(sec);
      break;
    case "steps":
      inner = renderSteps(sec);
      break;
    case "stats":
      inner = renderStats(sec);
      break;
    case "trust":
      inner = renderTrust(sec);
      break;
    case "about":
      inner = renderAbout(sec);
      break;
    case "gallery":
      inner = renderGallery(sec);
      break;
    case "testimonials":
      inner = renderTestimonials(sec);
      break;
    case "faq":
      inner = renderFaq(sec);
      break;
    case "hours":
      inner = renderHours(sec, doc);
      break;
    case "service_area":
      inner = renderServiceArea(sec, doc);
      break;
    case "contact":
      inner = renderContact(sec, doc, opts);
      break;
    case "quote_embed":
      inner = renderQuoteEmbed(sec, opts);
      break;
    case "cta":
      inner = renderCta(sec, opts);
      break;
  }
  // A section that produced nothing (no data behind it) is omitted entirely
  // rather than shipped as an empty band.
  if (!inner.trim()) return "";
  return `<section class="sl-section${bandClass(sec, index, rt)}" id="${esc(sec.id)}"><div class="sl-wrap">${inner}</div></section>`;
}

/* ────────────────────────────────────────────────────────────────────────
 * Chrome — header, footer, head
 * ──────────────────────────────────────────────────────────────────────── */

function renderHeader(doc: SiteDocument, page: SitePage, rt: ResolvedTheme, opts: RenderOptions): string {
  const b = doc.business;
  const logo = safeImageSrc(rt.logoUrl);
  const brandInner = logo
    ? `<img src="${esc(logo)}" alt="${esc(b.name)}"><span>${esc(b.name)}</span>`
    : `<span>${esc(b.name)}</span>`;

  const links = navPages(doc)
    .map((p) => {
      const current = p.id === page.id ? ' aria-current="page"' : "";
      return `<a href="${esc(internalHref(p.slug, opts))}"${current}>${esc(p.nav_label)}</a>`;
    })
    .join("");

  const phoneCta = b.phone
    ? `<a class="sl-btn sl-btn-primary sl-header-cta" href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a>`
    : "";

  const utility =
    rt.theme.structure.nav === "utility-bar"
      ? `<div class="sl-utility"><div class="sl-wrap"><span>${esc(
          b.tagline || [b.city, b.region].filter(Boolean).join(", "),
        )}</span>${b.phone ? `<a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a>` : ""}</div></div>`
      : "";

  return `${utility}<header class="sl-header"><div class="sl-wrap sl-header-inner">
<a class="sl-brand" href="${esc(internalHref("", opts))}">${brandInner}</a>
${phoneCta}
<nav class="sl-nav" aria-label="Primary">${links}</nav>
</div></header>`;
}

function renderFooter(doc: SiteDocument, opts: RenderOptions): string {
  const b = doc.business;
  const year = (opts.generatedAt ?? new Date()).getFullYear();
  const address = [b.street, b.city, b.region, b.postal_code].filter(Boolean).join(", ");
  const contactItems = [
    b.phone ? `<li><a href="tel:${esc(b.phone.replace(/[^\d+]/g, ""))}">${esc(b.phone)}</a></li>` : "",
    b.email ? `<li><a href="mailto:${esc(b.email)}">${esc(b.email)}</a></li>` : "",
    address ? `<li>${esc(address)}</li>` : "",
  ]
    .filter(Boolean)
    .join("");

  const navLinks = navPages(doc)
    .map((p) => `<li><a href="${esc(internalHref(p.slug, opts))}">${esc(p.nav_label)}</a></li>`)
    .join("");

  const social = b.social.length
    ? `<div><h4>Follow</h4><ul>${b.social
        .map((s) => `<li><a href="${esc(resolveHref(s.href, opts))}" rel="noopener">${esc(s.label)}</a></li>`)
        .join("")}</ul></div>`
    : "";

  const legalBits = [
    `<span>&copy; ${year} ${esc(b.name)}</span>`,
    b.license_number ? `<span>Licence ${esc(b.license_number)}</span>` : "",
    doc.show_powered_by
      ? `<span>Built with <a href="https://wefixtrades.com" rel="noopener">WeFixTrades</a></span>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `<footer class="sl-footer"><div class="sl-wrap">
<div class="sl-footer-grid">
<div><h4>${esc(b.name)}</h4>${b.tagline ? `<p>${esc(b.tagline)}</p>` : ""}${
    doc.footer_note ? `<p>${esc(doc.footer_note)}</p>` : ""
  }</div>
<div><h4>Pages</h4><ul>${navLinks}</ul></div>
<div><h4>Contact</h4><ul>${contactItems}</ul></div>
${social}
</div>
<div class="sl-footer-legal">${legalBits}</div>
</div></footer>`;
}

/**
 * LocalBusiness JSON-LD. Only fields we actually hold are emitted — an
 * absent phone or address is omitted rather than filled with a placeholder,
 * because structured data asserting a false address is a real-world harm.
 */
function renderJsonLd(doc: SiteDocument, page: SitePage, opts: RenderOptions): string {
  const b = doc.business;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: b.name,
  };
  if (b.tagline) node.description = b.tagline;
  if (opts.origin) node.url = `${opts.origin}${pagePath(page)}`;
  if (b.phone) node.telephone = b.phone;
  if (b.email) node.email = b.email;
  const address: Record<string, string> = {};
  if (b.street) address.streetAddress = b.street;
  if (b.city) address.addressLocality = b.city;
  if (b.region) address.addressRegion = b.region;
  if (b.postal_code) address.postalCode = b.postal_code;
  if (b.country) address.addressCountry = b.country;
  if (Object.keys(address).length > 1) node.address = { "@type": "PostalAddress", ...address };
  if (b.service_areas.length) node.areaServed = b.service_areas.slice(0, 30);
  if (b.founded_year) node.foundingDate = b.founded_year;
  const logo = safeImageSrc(doc.brand.logo_url);
  if (logo) node.logo = logo;
  return `<script type="application/ld+json">${jsonLdSafe(node)}</script>`;
}

function renderHead(doc: SiteDocument, page: SitePage, rt: ResolvedTheme, opts: RenderOptions): string {
  const b = doc.business;
  const title = page.meta_title || `${page.title} | ${b.name}`;
  const description = page.meta_description || b.tagline || "";
  const canonical = opts.origin ? `${opts.origin}${pagePath(page)}` : "";
  const ogImage = safeImageSrc(firstImageUrl(page) || doc.brand.logo_url);

  const tags = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(title)}</title>`,
    description ? `<meta name="description" content="${esc(description)}">` : "",
    canonical ? `<link rel="canonical" href="${esc(canonical)}">` : "",
    opts.preview
      ? `<meta name="robots" content="noindex, nofollow">`
      : `<meta name="robots" content="index, follow">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(b.name)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    description ? `<meta property="og:description" content="${esc(description)}">` : "",
    canonical ? `<meta property="og:url" content="${esc(canonical)}">` : "",
    ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : "",
    `<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">`,
    `<meta name="theme-color" content="${esc(rt.accent.base)}">`,
    `<style>${buildStylesheet(rt)}</style>`,
    renderJsonLd(doc, page, opts),
  ];
  return tags.filter(Boolean).join("\n");
}

/**
 * The page's representative (OG / social card) image.
 *
 * PROVENANCE APPLIES HERE TOO. A social card is the image a page is shared
 * as, so a generated image standing in for the customer's work is the same
 * misrepresentation as putting it in the gallery — it is just harder to
 * notice. Only `customer` and `stock` imagery is eligible; the gallery is
 * additionally restricted to portfolio-safe images.
 */
function ogEligible(image: SiteImage | undefined): string {
  if (!image?.url) return "";
  return image.provenance === "generated" ? "" : image.url;
}

function firstImageUrl(page: SitePage): string {
  for (const sec of page.sections) {
    if (sec.type === "hero") {
      const url = ogEligible(sec.props.image);
      if (url) return url;
    }
    if (sec.type === "about") {
      const url = ogEligible(sec.props.image);
      if (url) return url;
    }
    if (sec.type === "gallery") {
      const safe = sec.props.images.find(isPortfolioSafe);
      if (safe?.url) return safe.url;
    }
  }
  return "";
}

/* ────────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────────── */

export interface RenderResult {
  html: string;
  title: string;
  /** Sections that produced no markup because their data was empty. Surfaced
   *  in the admin editor so an operator sees what is missing instead of
   *  wondering why a section "vanished". */
  emptySections: string[];
}

/** Render one page of a site document to a complete standalone HTML file. */
export function renderPage(
  doc: SiteDocument,
  page: SitePage,
  options: Partial<RenderOptions> = {},
): RenderResult {
  const opts: RenderOptions = { ...DEFAULT_OPTIONS, ...options };
  const rt = resolveTheme(doc.theme_id, doc.brand);

  // Arm h1 promotion when this page has no hero to supply one.
  PENDING_H1 = !page.sections.some((sec) => sec.type === "hero");

  const emptySections: string[] = [];
  const body = page.sections
    .map((sec, i) => {
      const html = renderSection(sec, i, doc, rt, opts);
      if (!html) emptySections.push(`${sec.type} (${sec.id})`);
      return html;
    })
    .filter(Boolean)
    .join("\n");

  const previewBanner = opts.preview
    ? `<div style="background:${esc(rt.theme.palette.surfaceDark)};color:${esc(
        rt.theme.palette.inkOnDark,
      )};padding:10px 20px;font:600 13px/1.4 system-ui,sans-serif;text-align:center">Preview — this draft is not published and is not indexed.</div>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
${renderHead(doc, page, rt, opts)}
</head>
<body>
<a class="sl-skip" href="#main">Skip to content</a>
${previewBanner}
${renderHeader(doc, page, rt, opts)}
<main id="main">
${body}
</main>
${renderFooter(doc, opts)}
</body>
</html>`;

  return {
    html,
    title: page.meta_title || `${page.title} | ${doc.business.name}`,
    emptySections,
  };
}

/** Render every page. Used by the preview harness and the ZIP export. */
export function renderSite(
  doc: SiteDocument,
  options: Partial<RenderOptions> = {},
): Array<{ page: SitePage; result: RenderResult }> {
  return doc.pages.map((page) => ({ page, result: renderPage(doc, page, options) }));
}
