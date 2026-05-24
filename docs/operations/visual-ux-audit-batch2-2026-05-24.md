# Visual + console + axe audit — batch 2 (2026-05-24)

Follow-up to PR #673 (`top-4` audit). Covers the remaining 7 product detail
pages plus the `/services` hub at desktop 1440x900 and mobile 375x812.

**Scope:** live prod (`https://wefixtrades.com`). 8 routes × 2 viewports = 16
captures. No source code modified; this PR adds only the spec, screenshots, and
this report.

**Reproducer:**

```sh
npx playwright test --config tests/audit/audit-batch2.config.ts
```

All 16 captures succeeded; total wall time ~91s; no route was skipped.

P1 thresholds from the brief:

- scroll height > 6,000px on desktop
- scroll height > 8,000px on mobile

## Summary table

| Route | Viewport | Scroll height (px) | P1 length | Console errors | Failed reqs | Axe total (crit/ser/mod) |
|---|---|---:|---|---:|---:|---|
| `/products/quickquotepro` | desktop | 8,571 | P1 (+2,571) | 4 | 8 | 4 (0/2/2) |
| `/products/quickquotepro` | mobile  | 11,421 | P1 (+3,421) | 4 | 8 | 5 (0/4/1) |
| `/products/mapguard` | desktop | 8,072 | P1 (+2,072) | 4 | 3 | 3 (0/1/2) |
| `/products/mapguard` | mobile  | 10,604 | P1 (+2,604) | 4 | 3 | 4 (0/3/1) |
| `/products/rankflow` | desktop | 7,012 | P1 (+1,012) | 4 | 3 | 4 (0/1/3) |
| `/products/rankflow` | mobile  | 9,146 | P1 (+1,146) | 4 | 3 | 5 (0/3/2) |
| `/products/webcare` | desktop | 7,081 | P1 (+1,081) | 4 | 4 | 4 (0/1/3) |
| `/products/webcare` | mobile  | 8,966 | P1 (+966) | 4 | 3 | 5 (0/3/2) |
| `/products/sitelaunch` | desktop | 7,060 | P1 (+1,060) | 4 | 3 | 4 (0/1/3) |
| `/products/sitelaunch` | mobile  | 8,511 | P1 (+511) | 4 | 3 | 5 (0/3/2) |
| `/products/socialsync` | desktop | 7,652 | P1 (+1,652) | 4 | 3 | 4 (0/1/3) |
| `/products/socialsync` | mobile  | 9,697 | P1 (+1,697) | 4 | 3 | 5 (0/3/2) |
| `/products/reputationshield` | desktop | 7,910 | P1 (+1,910) | 4 | 3 | 4 (0/1/3) |
| `/products/reputationshield` | mobile  | 10,224 | P1 (+2,224) | 4 | 3 | 5 (0/3/2) |
| `/services` | desktop | 3,219 | ok | 4 | 3 | 4 (0/1/3) |
| `/services` | mobile  | 5,755 | ok | 4 | 3 | 3 (0/1/2) |

Severity counts in the "Axe total" column are violation rules, not node counts.
Color-contrast often hits multiple nodes inside one rule (worst case
`/services` desktop = 13 nodes in a single rule).

## P1 length findings

**Every product detail page exceeds the thresholds on both viewports.** Pattern
matches PR #673's home/tradeline findings — the standard product-page template
itself is the culprit. Worst offenders:

- `/products/quickquotepro` mobile: **11,421px** (+3,421 over threshold).
  Likely the longest page on the site after pre-PR-#676 home.
- `/products/mapguard` mobile: **10,604px** (+2,604).
- `/products/reputationshield` mobile: **10,224px** (+2,224).

Only `/services` is within budget on both viewports — it uses the hub layout
rather than the long product template.

Recommendation: apply the same compression strategy used in PR #676 for `/`
(consolidate intro/hero variations, tighten section padding, fold lower-trust
sections into accordions) to the shared product-page template so the fix
lands once for all 7 product routes.

## Recurring console + network errors (all 8 routes)

Identical to the 4-error pattern PR #673 flagged. Self-hosting Satoshi + Geist
(per existing `polish/perf-self-host-satoshi-geist-fonts` branch already in
worktree list) eliminates 3 of 4:

1. CSP report-only `upgrade-insecure-requests` warning (harmless; suppress in
   the CSP header if noise matters).
2. fontshare CORS rejection on Satoshi CSS (the wrong `Access-Control-Allow-Origin`
   value from `api.fontshare.com`).
3. jsDelivr ORB block on `geist-font@1.3.1` CSS (`net::ERR_BLOCKED_BY_ORB`).
4. Cascading `net::ERR_FAILED` + an unsourced 404 — both stem from #2/#3.

GA collect endpoints also report `net::ERR_ABORTED`; these are network-tracking
noise (ad-blocker / headless heuristic), not site bugs.

## Per-route top finding

- **`/products/quickquotepro`** — Worst page on the site by length AND has **6
  broken product card images** (`source.unsplash.com/300x300/?sliding,window`
  etc. all return `ERR_BLOCKED_BY_ORB`). Unsplash hot-link service is no longer
  reliable; ship local thumbnails or pull from your own CDN. Also unique to
  this page: `aria-progressbar-name` serious axe violation.
- **`/products/mapguard`** — 8 axe color-contrast nodes desktop, 11 mobile.
  Worst-contrast offender after `/services`. Same muted-foreground token issue
  flagged in PR #673.
- **`/products/rankflow`** — `heading-order` skip on both viewports — likely an
  `<h1>` then `<h3>` somewhere. Cleanest a11y of the 7 product pages otherwise.
- **`/products/webcare`** — One of the longest desktop scans (10.5s vs. ~5s
  average). Hints at slow above-the-fold paint; worth a Lighthouse pass.
- **`/products/sitelaunch`** — Median page across every dimension. Use as the
  baseline when measuring the template-compression improvement.
- **`/products/socialsync`** — 5 color-contrast nodes mobile (above category
  median). Same root cause.
- **`/products/reputationshield`** — 2nd-longest mobile page (10,224px).
- **`/services`** — Page length is FINE (only one in scope to pass), but axe
  color-contrast hits **13 nodes** on both viewports. This is the highest
  contrast-node count seen in either audit batch and points to a hub-layout
  variant (probably the service tile cards) that needs its own token fix.

## Recurring issues across the batch

1. **Long-product-template page length** — 7/7 product pages over P1
   threshold on both viewports. Single template fix likely resolves all.
2. **Color contrast** — every page has 1+ serious color-contrast violation,
   ranging 1-13 nodes. Matches the muted-foreground token problem PR #673
   logged for `/`, `/pricing`, `/products/tradeline`. Strongly suggests a
   single shared token (probably the same body-secondary text used in cards)
   below AA 4.5:1 on the brand background.
3. **`aria-hidden-focus` + `scrollable-region-focusable`** — both appear only
   on mobile, on every product page. Strongly suggests one offending shared
   component (maybe a horizontally-scrollable feature carousel) that hides
   itself with `aria-hidden` while keeping focusable children, AND lacks a
   keyboard-focusable scroll container. Fix in one place, eliminate 7 mobile
   serious violations.
4. **`landmark-unique`** — desktop-only on 6/8 routes. Probably duplicate
   `<aside>` or `<nav>` without `aria-label` from a footer/sidebar fragment.
5. **`region` (moderate)** — every route at every viewport: content outside any
   `<main>`/`<aside>`/`<section>` landmark. Likely the same footer fragment.
6. **`heading-order` (moderate)** — every page except quickquotepro/mapguard
   desktop. Sequential heading skip.
7. **Unsplash hot-linked images on `quickquotepro`** — only that route, but it
   makes 6 visible product cards render broken. Highest user-visible bug in
   this batch.

## Suggested follow-up tickets (separate PRs)

| Ticket | Scope | Estimated reach |
|---|---|---|
| Compress product-page template | 1 template, 7 routes | -2,000 to -3,500 px each |
| Replace unsplash hot-links on `quickquotepro` | 6 image refs | Fixes 6 broken cards |
| Fix shared muted-text token contrast | 1 CSS token | Resolves color-contrast on all 8 routes (and the top-4 audit pages) |
| Fix mobile carousel aria-hidden + focusability | 1 shared component | Resolves 14 serious mobile axe violations |
| Add `region` landmark to footer fragment | 1 partial | Resolves on every page in both audits |
| Self-host Satoshi + Geist | Existing branch | Removes 3 of 4 site-wide console errors |

## Files in this PR

- `tests/audit/visual-audit-batch2.spec.ts` — Playwright spec (no infra
  install; re-runnable any time).
- `tests/audit/audit-batch2.config.ts` — standalone config (90s per-route
  budget, prod URL, single worker).
- `docs/operations/visual-audit-screenshots-batch2/audit-results.json` — raw
  capture data.
- `docs/operations/visual-audit-screenshots-batch2/*.png` — 16 full-page
  screenshots.

No source code touched. This PR is informational. Do NOT admin-merge.
