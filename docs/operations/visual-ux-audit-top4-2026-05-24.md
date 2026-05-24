# Top-4 marketing visual + console + axe audit — 2026-05-24

Tight-scope live audit of the four most-trafficked marketing routes on
`https://wefixtrades.com`. Captures scroll height, console errors, failed
network requests, axe-core violations, and a full-page screenshot per
route × viewport (desktop 1440×900, mobile 375×812).

- **Reproducer:** `tests/audit/visual-audit-top4.spec.ts`
- **Config:** `tests/audit/audit-top4.config.ts`
- **Run command:** `npx playwright test --config tests/audit/audit-top4.config.ts`
- **Raw results:** `docs/operations/visual-audit-screenshots/audit-results.json`
- **Screenshots:** `docs/operations/visual-audit-screenshots/<route>-<viewport>.png`
- **Captured:** 8/8 (4 routes × 2 viewports), 0 skipped, total wall time ~57s
- **Browser:** Chromium 147.0.7727.15 (Playwright bundled headless shell)

## Summary table

| Route | Viewport | Scroll height (px) | Console errors | Failed requests | Axe violations (C/S/Mo/Mi) | Time |
|---|---|---|---|---|---|---|
| `/` | desktop | **11004** P1 | 4 | 2 | 5 (1/2/2/0) | 13.2s |
| `/` | mobile | **13588** P1 | 4 | 2 | 4 (1/2/1/0) | 13.6s |
| `/pricing` | desktop | 3521 | 4 | 3 | 3 (0/1/2/0) | 4.4s |
| `/pricing` | mobile | 5476 | 4 | 3 | 2 (0/1/1/0) | 4.7s |
| `/products/tradeline` | desktop | **7671** P1 | 4 | 3 | 6 (0/3/3/0) | 5.3s |
| `/products/tradeline` | mobile | **10487** P1 | 4 | 3 | 6 (0/4/2/0) | 5.2s |
| `/free-audit` | desktop | 2419 | 4 | 3 | 2 (0/0/2/0) | 4.7s |
| `/free-audit` | mobile | 2811 | 4 | 3 | 1 (0/0/1/0) | 4.5s |

**Axe column legend:** C = critical, S = serious, Mo = moderate, Mi = minor.

**P1 = page-length compression needed.** Threshold per brief: mobile > 8000px or desktop > 6000px.

| P1 over-length pages | Viewport | Measured | Threshold | Over by |
|---|---|---|---|---|
| `/` | desktop | 11004 | 6000 | +5004 |
| `/` | mobile | 13588 | 8000 | +5588 |
| `/products/tradeline` | desktop | 7671 | 6000 | +1671 |
| `/products/tradeline` | mobile | 10487 | 8000 | +2487 |

## Console errors (identical on every route × viewport)

Same four messages fire on all 8 captures — these are site-wide, not route-specific:

1. `The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy.`
2. `Access to XMLHttpRequest at 'https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700,800,900&display=swap' from origin 'https://wefixtrades.com' has been blocked by CORS policy: The 'Access-Control-Allow-Origin' header has a value 'https://api.fontshare.com' that is not equal to the supplied origin.`
3. `Failed to load resource: net::ERR_FAILED` (cascade from #2)
4. `Failed to load resource: the server responded with a status of 404 ()`

## Failed network requests (site-wide)

Two failures on every page, plus a third on every route except `/`:

- `https://cdn.jsdelivr.net/npm/geist-font@1.3.1/dist/geist-sans/style.css` — `net::ERR_BLOCKED_BY_ORB` (Chromium Opaque Response Blocking — jsDelivr serving CSS without correct MIME or CORS for cross-origin fetch).
- `https://api.fontshare.com/v2/css?f[]=satoshi@...` — `net::ERR_FAILED` (CORS preflight rejected — fontshare returns `Access-Control-Allow-Origin: https://api.fontshare.com` instead of `*` or the requesting origin).
- `https://www.google-analytics.com/g/collect?...` — `net::ERR_ABORTED` (only on routes other than `/`; benign — pagehide aborts the beacon before flush).

## Axe violations (per route)

### `/` (home) — 5 desktop / 4 mobile

| Rule | Impact | Nodes (desk / mob) |
|---|---|---|
| `aria-allowed-attr` | critical | 4 / 4 |
| `color-contrast` | serious | 36 / 44 |
| `scrollable-region-focusable` | serious | 1 / 1 |
| `landmark-unique` | moderate | 1 / — |
| `region` | moderate | 1 / 1 |

### `/pricing` — 3 desktop / 2 mobile

| Rule | Impact | Nodes (desk / mob) |
|---|---|---|
| `color-contrast` | serious | 13 / 14 |
| `landmark-unique` | moderate | 1 / — |
| `region` | moderate | 1 / 1 |

### `/products/tradeline` — 6 desktop / 6 mobile

| Rule | Impact | Nodes (desk / mob) |
|---|---|---|
| `aria-hidden-focus` | serious | 1 / 1 |
| `color-contrast` | serious | 2 / 2 |
| `nested-interactive` | serious | 1 / 1 |
| `scrollable-region-focusable` | serious | — / 1 |
| `heading-order` | moderate | 1 / 1 |
| `landmark-unique` | moderate | 1 / — |
| `region` | moderate | 1 / 1 |

### `/free-audit` — 2 desktop / 1 mobile

| Rule | Impact | Nodes (desk / mob) |
|---|---|---|
| `landmark-unique` | moderate | 1 / — |
| `region` | moderate | 1 / 1 |

## Per-route recommendations (top 3 each)

### `/` (home)

1. **Compress page length.** Mobile is 13,588px (~17 phone screens); desktop 11,004px. Fold below-the-fold sections behind tab/accordion patterns or move them to dedicated pages. Largest savings: collapse repeating social-proof / feature grids.
2. **Fix the `aria-allowed-attr` critical (4 nodes).** Critical-severity a11y blocker — likely an `aria-*` attribute applied to a role that doesn't permit it (common cause: `aria-selected` on non-`option`/`tab`/`row`, or `aria-expanded` on a non-button). Inspect the home-page mega-CTA / nav components.
3. **Address `color-contrast` (36–44 nodes).** Largest violation surface on the site. Likely a single token used across many components (muted-foreground on muted background?). Fix the token, not each instance.

### `/pricing`

1. **Resolve `color-contrast` (13–14 nodes).** Same root-cause investigation as home — probably the same token. Tier-card body copy or "compare features" microcopy are likely culprits.
2. **Add a `<main>` landmark (`region`, `landmark-unique`).** Wrap the pricing tier grid in `<main>` (or single `role="main"`) so the page has exactly one top-level landmark — improves screen-reader nav and silences both axe rules.
3. **GA4 collect beacon aborts on navigation.** Cosmetic on prod but noisy in console. Use `sendBeacon` (gtag does this by default — check whether a custom analytics wrapper is overriding to `fetch`).

### `/products/tradeline`

1. **Compress page length.** Mobile 10,487px (over the 8,000 threshold by 2,487px); desktop 7,671px (over the 6,000 threshold by 1,671px). Likely candidate: collapse the per-feature deep-dive sections into an in-page tabbed pattern.
2. **Fix `nested-interactive` and `aria-hidden-focus`.** Both are real keyboard/SR breakage. `nested-interactive` = a button/link inside another button/link (commonly happens when a phone mockup CTA is wrapped in a clickable card). `aria-hidden-focus` = focusable element inside an `aria-hidden="true"` subtree (likely a decorative animation container with focusable content).
3. **Fix `heading-order`.** Headings skip a level somewhere on the page (e.g., `<h2>` followed by `<h4>` with no `<h3>`). Realign for screen-reader outline parity with the visual hierarchy.

### `/free-audit`

1. **Wrap form in a `<main>` landmark.** Same fix as `/pricing` — resolves both `region` and `landmark-unique`. Cleanest page in the audit; one structural change leaves it axe-clean.
2. **Validate the route below the fold.** Mobile is 2,811px (well under threshold) but verify that any post-submit confirmation/thank-you state isn't producing the 404 console message.
3. **No critical/serious axe issues — keep it that way.** Use this page as the template for landmark structure on the other routes.

## Site-wide recommendations (cuts all 8 captures at once)

1. **Stop loading fonts from jsDelivr and fontshare cross-origin XHR.** Self-host the Satoshi + Geist WOFF2 files, declare `@font-face` in CSS, and serve from the same origin. Eliminates the CORS error, the ORB block, and the cascading "Failed to load resource" — 3 of the 4 site-wide console errors disappear.
2. **Track down the 404.** The "Failed to load resource: the server responded with a status of 404" fires on every page but the URL is suppressed (resource loader logs the message without the URL after CSP rewrite). Add a network panel filter for 404s in DevTools, or instrument `window.addEventListener('error', ...)` to capture the source URL.
3. **Fix the CSP report-only directive.** Either drop `upgrade-insecure-requests` from the report-only header (it's a no-op in report mode and clutters the console) or move it to the enforcing CSP if you want it active.
4. **Centralize the `color-contrast` token.** Home has 36–44 nodes, pricing 13–14, tradeline 2. Pattern says a single muted-on-muted token is the root cause. Audit `--color-muted-foreground` (or equivalent) against AA 4.5:1.
