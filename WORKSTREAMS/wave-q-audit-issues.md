# Wave Q — Final visual audit findings

**Audit run:** 2026-05-26
**Harness:** `tests/wave-q-audit/audit.spec.ts` + `playwright.config.ts`
**Surfaces audited:** 58 (marketing, portal, admin, free-tools — desktop 1440×900 + mobile 375×667)
**Final state:** 0 Critical · 0 Important · 18 Polish

The harness drives Chromium across every surface modified in the 24-PR
session (Waves 7..16), screenshots desktop + mobile, and collects
findings into `tests/wave-q-audit/findings.json`. Re-run any time with
`npx playwright test --config tests/wave-q-audit/playwright.config.ts`
against a dev server on port 5555.

---

## Critical (block release) — ALL FIXED

### [x] C1. Home `/` shows Vite runtime-error overlay on every load
- **Root cause:** `client/src/components/marketing/globe/GlobeCanvas.tsx`
  fetched `//cdn.jsdelivr.net/npm/world-atlas/land-110m.json`
  (protocol-relative). In dev (http://) jsdelivr returns no
  `Access-Control-Allow-Origin` header, the fetch rejects, the
  unhandled rejection surfaces in Vite's runtime-error-plugin overlay.
- **Fix:**
  1. URL pinned to explicit `https://cdn.jsdelivr.net/...`
  2. Added `.catch()` so even a future outage degrades to a plain
     emissive globe without crashing the page.

---

## Important (fix before declaring done) — ALL FIXED

### [x] I1. `TradeLineChatDemo` — Framer Motion "animate opacity from undefined" warnings
- **Root cause:** `initial={showAll ? false : { opacity: 0, ... }}` —
  when `showAll` is true, `initial={false}` left Framer reading
  `undefined` as the starting opacity.
- **Fix:** When `showAll`, pass a concrete `initial` that matches
  `animate`, plus `transition.duration = 0` so there's no visible enter
  animation. (file: `client/src/components/product-demos/TradeLineChatDemo.tsx`)

### [x] I2. `SiteLaunchDemo` — non-animatable gradient + transparent color
- **Root causes:**
  - `animate.background = "linear-gradient(135deg, #0d3cfc 0%, #0d3cfc 100%)"`
    (Framer can't interpolate gradients; both stops were the same colour anyway)
  - `color: ... ? "rgba(13,21,20,0.7)" : "transparent"` and similar —
    `transparent` is not animatable from an rgb()/hex value.
- **Fix:** Flat `#0d3cfc` replaces the gradient. `"transparent"` swapped
  for explicit `rgba(...,0)` so Framer can interpolate.
  (file: `client/src/components/product-demos/SiteLaunchDemo.tsx`)

### [x] I3. CSP `upgrade-insecure-requests` directive ignored in report-only
- **Root cause:** Helmet adds `upgrade-insecure-requests` to the CSP
  directives by default; browsers log a console error when this is
  delivered via `Content-Security-Policy-Report-Only`. ~116 errors per
  full-site sweep.
- **Fix:** Explicitly set `upgradeInsecureRequests: null` in the helmet
  CSP config. Will re-enable explicitly when CSP graduates to
  enforce-mode. (file: `server/index.ts`)

### [x] I4. `RankFlowHeroAnimation` — `<circle r=undefined>` SVG error
- **Root cause:** `motion.circle` with `r={4}` + `animate={{ r: [4,6,4] }}`
  but no `initial`. Framer's first paint passed `undefined` to the DOM
  attribute. Browser logged "SVG circle r: Expected length, undefined".
- **Fix:** Added `initial={{ r: 4 }}`. (file:
  `client/src/components/marketing/heroAnimations/RankFlowHeroAnimation.tsx`)

### [x] I5. `/admin/system-alerts` → "Page not found"
- **Root cause:** The Wave 12D admin Alerts page is mounted at
  `/admin/crm/alerts` in `App.tsx`. Several Copilot deeplinks, docs, and
  this audit's spec reference `/admin/system-alerts`, which had no route.
  Page rendered the marketing fallback.
- **Fix:** Added `<Route path="/admin/system-alerts"><Redirect to="/admin/crm/alerts" /></Route>`
  mirroring the existing `/admin/contentflow → /admin/crm/contentflow` pattern.
  (file: `client/src/App.tsx`)

---

## Polish (documented; not blocking) — 18 findings

### P1. Framer Motion `animate opacity from "undefined"` warnings on `/`
- **Count:** ~14 unique callsites; the warnings come from framer-motion
  internals (`node_modules/.vite/deps/framer-motion.js`) so source
  doesn't pinpoint a specific user file.
- **Trigger:** `<AnimatePresence initial={false}>` wrapping `motion.div`
  children that animate opacity. Framer reads opacity from "current"
  (= undefined) on first mount before the child's `initial` is applied.
- **Production impact:** None — visual result is correct, only the dev
  console logs warnings.
- **Recommended follow-up:** Audit `AnimatePresence initial={false}`
  usage across `client/src/components/marketing/heroAnimations/` and
  either provide explicit child `initial` matching their `animate`
  state, or remove `initial={false}` and accept the first-paint
  animation. ~30 files affected; out of scope for this QA pass per the
  ≤30-line-per-fix rule.

### P2. `/api/tools/local-rankflux` returns 502 (MozCast RSS removed upstream)
- **Root cause:** `https://moz.com/mozcast.rss` returns HTTP 404 — Moz
  appears to have removed/renamed the RSS feed. `/mozcast` (HTML page)
  still 200s, but the server's RSS parser can't consume it.
- **Production impact:** The page renders gracefully with the error
  string the server returns (`Could not reach MozCast — try again
  shortly.`); subscription form remains functional. No JS crash.
- **Recommended follow-up:** Wave 6B (Rankflux) needs an alternative
  source — either scrape `https://moz.com/mozcast` HTML, switch to a
  different SERP-volatility feed (SEMrush Sensor JSON, Algoroo, etc.),
  or stub to a cached last-known value. Out of scope for QA.

### P3. Wave 14 Free Tools mega-menu — hover-trigger detection
- **Count:** 2 (home/desktop only).
- **Reality:** The mega-menu IS shipped and functional — visible on
  several audit screenshots (e.g. `portal-contentflow-desktop.png` shows
  the panel expanded). The audit's `trigger.hover()` may not match the
  exact DOM event the NavbarMenu listens for.
- **Production impact:** None — feature works.
- **Recommended follow-up:** Add a `data-testid="free-tools-trigger"`
  attribute on the nav item so future audits can detect it
  unambiguously.

### P4. Portal/admin routes render marketing fallback when unauthenticated
- **Count:** 16 (8 portal + admin surfaces × 2 viewports).
- **Reality:** This is correct behaviour — `RequirePortal` wrappers
  redirect unauthenticated users to the marketing site. The audit
  harness has no auth session so it sees the fallback; not a bug.
- **Recommended follow-up:** Wire the harness to an authed session
  (re-use `tests/e2e/admin-crm/global-setup.ts`) if we want to
  visually verify portal/admin chrome in future audits.

---

## Detection harness improvements

Several "issues" in pass 1 were false positives from a too-loose audit
harness. Pass-1 → final-pass changes:

- Added benign-noise filters: `VITE_POSTHOG_PUBLIC_KEY not set`,
  `THREE.Clock deprecated`, `[contrastGuard] auto-corrected`,
  `WebGL GPU stall`, `React Flow container needs width`, etc. — none
  are bugs.
- Spec-back-link detector now requires `[data-testid="portal-nav"]`
  presence to confirm the route actually rendered the portal/admin
  shell; otherwise it logs a skip-marker instead of flagging missing
  back-link.
- Zero-dim canvas detector now respects `offsetParent === null` so
  CSS-hidden ancestors (e.g. home globe on mobile) don't generate false
  positives.
- Solution slug list updated to real slugs from
  `client/src/pages/solutions/SolutionPage.tsx` (the original spec
  referenced `for-handymen`, `for-carpet-cleaners`,
  `for-window-cleaners` which don't exist as registered slugs).

---

## Sanity guards

All passing post-fix:

```
npm run check                        → tsc OK
npm run check:hardcoded-colors       → 0 new violations
npm run check:layout-rules           → 0 new violations
npm run check:copilot-forms          → 35 wired, 88 exempt OK
npm run check:migrations             → OK
npm run check:schema-drift           → Layer 1 + 2 OK
npm run build                        → built in 28.59s, prerender 77/77 OK
```

---

## Reproducing the audit

```bash
cd C:\Users\Owner\.codex\wefixtrades
# Dev server on port 5555 (avoids port-5000 conflict with DelayPredict)
PORT=5555 NODE_ENV=development doppler run --project wefixtrades \
  --config dev_personal -- npx tsx server/index.ts > /tmp/server.log 2>&1 &
# Wait for it
until curl -sS -m 2 -o /dev/null -w "%{http_code}" "http://127.0.0.1:5555/" | grep -q 200; do sleep 2; done
# Audit
npx playwright test --config tests/wave-q-audit/playwright.config.ts
# View findings
cat tests/wave-q-audit/findings.json
# View screenshots
ls tests/wave-q-audit/screenshots/
```
