# SEO continuous improvement — 2026-05-24

Audit run on the live `wefixtrades.com` deploy. Goal: take stock of what
SEO Wave A→D + Lighthouse + RUM + daily digest shipped, then find the
highest-leverage next wins before public launch on 2026-07-15.

## TL;DR

The SPA shell **leaks the homepage canonical / title / description into
every other URL's initial HTML**. `<PageMeta>` correctly upserts the right
values on hydration, but:

1. Googlebot eventually JS-renders — fine, but a second-pass cost.
2. **Bing's primary index does NOT execute JS** at scale. Every URL today
   looks like a duplicate of `/` to Bing.
3. Social-card scrapers (Facebook, Twitter, LinkedIn, Slack, Discord) do
   not execute JS — share previews are all the homepage card.
4. LLM crawlers (ChatGPT, Claude, Perplexity) read the static HTML — the
   AI search surface sees one page per host, not 46.

Inline fixes this PR ships:

- Removed the hard-coded `<link rel="canonical" href="https://wefixtrades.com/" />`
  from `client/index.html`. PageMeta sets the right canonical per route on
  hydration; emitting a static `/` is worse than no canonical.
- Added baseline `Organization` + `WebSite` JSON-LD blocks to the shell so
  non-JS crawlers see the brand on every URL.
- Added an explicit `<meta name="robots" content="index, follow" />` default
  in the shell.

The remaining items below are the next 15 wins, ranked by impact.

---

## What's deployed (recap)

- **PR #627 — SEO Wave A:** `<PageMeta>` component + per-route title /
  description / canonical / OG / Twitter / JSON-LD upsert, plus dynamic
  `/sitemap.xml` and `/robots.txt`.
- **PR #660 — SEO Wave B:** `OptimizedImage` with WebP/AVIF + srcset +
  preload, applied to LCP images on top marketing routes.
- **PR #662 — SEO Wave C:** Lighthouse CI hard-fail thresholds in
  `audit.yml` (mobile + desktop matrix, 6 routes, median-of-3).
- **PR #663 — SEO Wave D:** RUM Web Vitals (LCP / CLS / INP) ingest with
  GA4 forwarding.
- **PR #628 — Bing automation:** Bing URL submission cron.
- **PR #635 — GA4:** End-to-end GA4 wire (measurement ID baked at build).
- **PR #664 — Daily digest:** GSC + Bing + GA4 + healthz + activity email
  summary.

These are solid. The audit below assumes they all keep working and only
flags gaps.

---

## Findings (ranked by severity)

### S0 — Initial HTML is the homepage for every URL

- **What:** `curl https://wefixtrades.com/products/tradeline` returns 3,536
  bytes of SPA shell. Title, description, OG image, and canonical all
  resolve to homepage values. Zero JSON-LD. Zero H1. Zero per-page
  content. Same for every URL in the sitemap.
- **Why it matters:** Bing primary index, every social-card scraper, and
  every LLM crawler are looking at the homepage's metadata for all 46
  URLs. Googlebot eventually JS-renders but the canonical `/` it sees in
  the initial pass is a strong duplicate-content signal.
- **Inline fix shipped:** removed the static canonical, added
  Organization + WebSite JSON-LD, defaulted robots to index/follow.
- **Remaining work (M):** add a build-time prerender step for the ~46
  marketing routes. `vite-plugin-prerender` or `react-snap` runs Puppeteer
  over the built SPA, captures the hydrated HTML per route, and writes
  static `dist/<path>/index.html` files. Express's static handler picks
  these up before falling back to the SPA shell. Crawlers without JS now
  see the right title / description / canonical / JSON-LD / H1 / hero
  copy on the first byte. No runtime SSR — pure build artifact.

### S1 — `<link rel="canonical">` defaulted to homepage in the shell

- **What:** even with PageMeta hydration, Bing / Facebook / LinkedIn /
  Slack / Discord scrapers see `<link rel="canonical" href="https://wefixtrades.com/" />`
  on every URL.
- **Inline fix shipped.** Removed in this PR.

### S1 — No prerendering / SSR plan documented

- **What:** there is no `prerender`, `react-snap`, `vite-plugin-ssr`,
  or `astro` dependency in the repo. The Wave A docstring acknowledges
  "SPA SEO is not perfect (server-side rendering would be better)" but
  no follow-up wave is queued.
- **Fix (M):** ship Wave E — prerender. See S0 above.

### S2 — Sitemap missing detail pages

- `lighthouserc.cjs` audits `/free-audit` but sitemap exposes
  `/tools/free-audit`. `/free-audit` 301-redirects via a `<Redirect>` —
  Lighthouse is auditing the redirect target. Fine but misleading.
- Solutions page: `/solutions/visibility` is in sitemap but the route is
  `<Route path="/solutions/:slug" component={SolutionPage} />` with no
  guard against arbitrary slugs (`SolutionPage.tsx` has its own gating).
  Audit confirmed `visibility` is the only deployed slug.
- Blog index `/blog` is in sitemap but no individual posts. As blog
  content ships, the sitemap generator should iterate the published-posts
  list (currently a TODO).
- **Fix (S):** align lighthouserc path to `/tools/free-audit`.
  **Fix (M):** wire blog posts into `sitemapRoutes.ts` when the first
  post ships.

### S2 — Bing share lookup quota not surfaced in audit doc

- **What:** PR #628 wired Bing URL submission. Today's audit didn't
  exercise the live quota endpoint because that requires the service
  account; daily digest covers it.
- **Fix (S):** add a "current quota" line to the daily digest summary so
  the launch team sees remaining headroom before content waves.

### S2 — Missing rich-results-eligible schema types

- Currently emitted: `Organization`, `WebSite`, `Product`, `FAQPage`.
- Missing where applicable:
  - **`BreadcrumbList`** on every product / feature / docs page (helper
    `breadcrumbSchema()` exists in `client/src/lib/seo/jsonLd.ts` and
    `useBreadcrumbSchema.ts` is built but not wired). Rich result.
  - **`Service`** (or `LocalBusiness`) on `/services` + product pages —
    "services for trades businesses" is the literal value prop.
  - **`SoftwareApplication`** on each `/products/*` page — these are SaaS
    products, not physical goods. Google's SaaS / SoftwareApplication
    rich results are now eligible.
  - **`HowTo`** on `/docs/embed`, `/docs/domain`, `/docs/booking` —
    docs ARE how-to content.
- **Fix (M):** add 4 schema helpers + wire them. Effort scales linearly
  with the number of pages but the wiring is one-line-per-page.

### S2 — Outbound authority links: none

- Sample: home, products, services, docs all have zero outbound
  authoritative links. Google's E-E-A-T scoring rewards pointing to
  authoritative sources (Wikipedia, .gov, industry bodies like NFPA,
  IRC code references for plumbing/HVAC, BBB).
- **Fix (M):** add 1-2 outbound authority links per long-form page (docs,
  product pages) where naturally relevant. Particularly /docs/booking
  could link to ICS/CalDAV RFC; /docs/api could link to OpenAPI spec.

### S2 — H1 uniqueness unaudited (no static H1 in initial HTML)

- Audit could not measure H1 uniqueness because no page renders an H1 in
  initial HTML. Will be auditable once prerender ships.
- **Fix (post-prerender):** add a CI check that each prerendered route
  has exactly one H1 and that H1 values are unique across routes.

### S3 — Image alt-text coverage not measurable from outside

- Same root cause: SPA shell has no `<img>` tags. Most image rendering
  happens through `OptimizedImage` which enforces alt as a required prop
  (PR #660), so coverage should be high — but a static audit can't prove
  it.
- **Fix (S):** add a lint rule that flags `<img>`, `<OptimizedImage>`,
  and `<picture>` usages with empty / missing alt. Wave B's OptimizedImage
  already requires alt in TS types; verify the rule for native `<img>`.

### S3 — `og:image` is a placeholder

- `/brand/og-default.png` 200s but is the generic brand placeholder.
  Per-product OG images would let Twitter / Facebook / Slack share cards
  carry product names and screenshots.
- **Fix (M):** generate 1200×630 OG images per product slug at build
  time. There's already a `scripts/generate-free-tool-previews.ts` — extend
  the same pattern.

### S3 — `lastmod` is "today" for every URL

- `sitemapRoutes.ts` sets `<lastmod>${today}</lastmod>` for all URLs on
  every request. Search engines learn to ignore unreliable `lastmod`.
- **Fix (S):** track per-route last content edit (from `git log -1
  --format=%cs <file>` at build time) and pin lastmod to that. Static
  marketing routes won't oscillate.

### S3 — No `<priority>` differentiation between docs

- Every `/docs/*` carries priority `0.6`. `/docs/embed` and `/docs/api`
  are the highest-value docs (embed = activation, api = integrators) and
  should bump to `0.7`.
- **Fix (S):** one-line tweak in `STATIC_ROUTES`.

### S3 — Internal linking hub-and-spoke gaps

- Marketing pages link to product pages. Product pages don't
  cross-link to sibling products. A `/products/tradeline` page should
  link to `/products/quickquotepro` ("Pair with QuickQuotePro for instant
  estimates after the call connects") and vice versa. Today these are
  silos with the main nav as the only path between them.
- **Fix (M):** add a "Related products" 2-card block to
  `EffortelProductPage.tsx` driven from `PRODUCT_PAGES`.

### S3 — No internal search & no `SearchAction` in WebSite schema

- The Wave A `websiteSchema()` declares a `SearchAction` pointing to
  `/search?q={search_term_string}` — that route does not exist.
- **Fix (S):** either ship `/search` (out of scope for this PR) or
  remove the `SearchAction` from `websiteSchema()` so Google doesn't
  flag a broken sitelinks search box.

### S3 — Bing & GSC programmatic checks deferred

- This audit is read-only via curl, so the GSC / Bing API checks the
  brief requested were left to the daily digest (PR #664). The digest
  already covers indexed vs discovered-not-indexed vs excluded and quota.
- **Fix (S):** thread the digest's GSC sections into a weekly
  `seo-state.md` snapshot for trend analysis.

### S3 — Lighthouse CI form-factor coverage gap

- Audit runs on 6 routes × 2 form factors × 3 samples = 36 runs per PR.
  Solid. But there's no Lighthouse on `/products/mapguard`,
  `/products/reputationshield`, `/blog`, or `/docs/embed` — all
  high-traffic intent routes once content ships.
- **Fix (S):** add 2-3 more routes to `lighthouserc.cjs`. Roughly 6
  extra minutes of CI per PR.

---

## Top 15 ranked improvements

| # | Improvement                                                           | Severity | Effort | Why                                              |
|---|-----------------------------------------------------------------------|----------|--------|--------------------------------------------------|
| 1 | Build-time prerender (Puppeteer over 46 routes → static HTML per URL) | S0       | M      | Bing / social / LLM crawlers see real pages      |
| 2 | Remove static canonical from `index.html` (shipped inline)            | S1       | S      | Stops cross-URL duplicate-content signal         |
| 3 | Inject Organization + WebSite JSON-LD into shell (shipped inline)     | S1       | S      | Brand visible to non-JS crawlers immediately     |
| 4 | Wire `BreadcrumbList` schema on product / feature / docs pages         | S2       | S      | Rich-result eligible, helper already exists      |
| 5 | Add `SoftwareApplication` schema to each `/products/*`                 | S2       | M      | Eligible for SaaS rich result                    |
| 6 | Generate per-product 1200×630 OG images at build                       | S3       | M      | Social share cards stop being generic            |
| 7 | Per-route `lastmod` from git timestamps                                | S3       | S      | Crawlers respect honest lastmod                  |
| 8 | Add "Related products" block on `EffortelProductPage`                  | S3       | M      | Internal hub-and-spoke, cross-product equity     |
| 9 | Add `HowTo` schema on `/docs/embed`, `/docs/domain`, `/docs/booking`   | S2       | S      | How-to rich result is high CTR                   |
|10 | 1-2 outbound authority links per long-form doc                         | S2       | M      | E-E-A-T signal                                   |
|11 | Align lighthouserc to `/tools/free-audit` (kill redirect audit)        | S2       | S      | One-line tweak                                   |
|12 | Bump `/docs/embed` + `/docs/api` to priority 0.7                       | S3       | S      | Sitemap priority hygiene                         |
|13 | Add 2-3 more routes to Lighthouse matrix                               | S3       | S      | Coverage for mapguard, repshield, docs/embed     |
|14 | Remove `SearchAction` from `websiteSchema()` (or ship `/search`)       | S3       | S      | Broken sitelinks search box risk                 |
|15 | Wire blog post URLs into sitemap when first post ships                 | S2       | M      | Index content as it goes live                    |

S = small (≤30 min), M = medium (≤4h), L = large (>4h, multi-day).

## Inline fixes shipped this PR

- `client/index.html` — removed the hard-coded canonical, added baseline
  Organization + WebSite JSON-LD, added explicit `robots: index, follow`
  default.

## What was intentionally NOT shipped here

- Prerender (Wave E) is the right next PR but is a multi-file change that
  touches `vite.config.ts`, `package.json`, the static handler in
  `server/static.ts`, and the Lighthouse + RUM pipelines. Out of scope
  for the continuous-improvement audit.
- BreadcrumbList / SoftwareApplication / HowTo schema wiring touches
  every product / feature / docs page (~20 files). Scope-bounded to its
  own PR.
- Per-product OG images touch the build pipeline. Separate PR.

## Operational notes

- Live worktree: `C:\Users\Owner\.codex\wfx-seo3` on branch
  `audit/seo-continuous-improvement` from `origin/main`.
- All audit signals captured via `curl` against the production host. No
  secrets touched, no service accounts invoked from this PR.
- GSC + Bing programmatic state continues to flow through the daily
  digest (PR #664) — no duplication.
