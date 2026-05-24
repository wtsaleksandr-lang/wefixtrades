# Accessibility audit — batch 3 (2026-05-24)

Follow-up to PR #673 (`top-4`), PR #678 (`batch-2` 7 product pages + services),
PR #675 (TradeLine a11y fixes) and PR #680 (`muted-foreground` AA contrast).
This audit covers the **8 public marketing routes still uncovered** plus a
repo-wide code review of keyboard, screen-reader and form patterns against
WCAG 2.1 AA.

**Scope:** live prod (`https://wefixtrades.com`). 8 routes x 2 viewports = 16
axe-core captures. Reproducer:

```sh
npx playwright test --config tests/audit/audit-batch3.config.ts
```

Total wall time ~80s. All 16 captures succeeded.

## Per-route violations

axe-core ran with `wcag2a + wcag2aa + wcag21a + wcag21aa` tags. Severity
columns are violation **rules**, node counts in parens.

| Route | Viewport | Total | Critical | Serious (rules x nodes) | Landmarks (h/n/m/f) | Skip link |
|---|---|---:|---:|---|---|---|
| `/about` | desktop | 1 | 0 | color-contrast (1) | 0 / 3 / 1 / 1 | no |
| `/about` | mobile  | 1 | 0 | color-contrast (1) | 0 / 2 / 1 / 1 | no |
| `/contact` | desktop | 1 | 0 | color-contrast (4) | 0 / 3 / 1 / 1 | no |
| `/contact` | mobile  | 1 | 0 | color-contrast (4) | 0 / 2 / 1 / 1 | no |
| `/blog` | desktop | 1 | 0 | color-contrast (13) | 0 / 3 / 1 / 1 | no |
| `/blog` | mobile  | 1 | 0 | color-contrast (14) | 0 / 2 / 1 / 1 | no |
| `/case-studies` | desktop | 1 | 0 | color-contrast (**65**) | 0 / 3 / 1 / 1 | no |
| `/case-studies` | mobile  | 1 | 0 | color-contrast (**55**) | 0 / 2 / 1 / 1 | no |
| `/resources` | desktop | **0** | 0 | — | 0 / 3 / 1 / 1 | no |
| `/resources` | mobile  | **0** | 0 | — | 0 / 2 / 1 / 1 | no |
| `/templates` | desktop | 1 | 0 | color-contrast (1) | 0 / 3 / 1 / 1 | no |
| `/templates` | mobile  | 1 | 0 | color-contrast (1) | 0 / 2 / 1 / 1 | no |
| `/demo` | desktop | 3 | **1** | color-contrast (20), button-name (**1 critical**), scrollable-region-focusable (1) | 0 / 3 / 1 / 1 | no |
| `/demo` | mobile  | 3 | **1** | color-contrast (20), button-name (**1 critical**), scrollable-region-focusable (1) | 0 / 2 / 1 / 1 | no |
| `/docs` | desktop | 1 | 0 | color-contrast (1) | 0 / 3 / 1 / 1 | no |
| `/docs` | mobile  | **0** | 0 | — | 0 / 2 / 1 / 1 | no |

JSON detail: `docs/operations/visual-audit-screenshots-batch3/a11y-results.json`.

## Top 10 findings

### 1. CRITICAL: `button-name` on `/demo` (both viewports)

The chat-send button in `client/src/pages/marketing/demo.tsx:158` is icon-only
(`<Send size={16}>`) with no accessible name. Screen readers announce it as
just "button". WCAG 4.1.2 (Name, Role, Value).

**Shipped in this PR** — added `aria-label="Send message"` and
`aria-hidden="true"` on the inner SVG.

### 2. No skip-to-content link on any marketing route

All 8 routes report `skipLink=false`. First tab focus lands on the WeFixTrades
logo link, forcing keyboard users to tab through the entire nav (announcement
banner + 6+ nav items) on every page load. WCAG 2.4.1 (Bypass Blocks).
`AdminLayout` and `PortalLayout` already have skip links — only
`MarketingLayout` was missing one.

**Shipped in this PR** — added the same `sr-only`/`focus:not-sr-only` link to
`MarketingLayout`, targeting `#main-content`, with the `<main>` now carrying
`id="main-content"` and `tabIndex={-1}` so focus actually moves on activation.

### 3. No `<header role=banner>` landmark on marketing routes

axe reports `header=0` on every route. `MarketingNav` is rendered as a bare
`<nav>` without a wrapping `<header>`, so the global chrome has no banner
landmark. WCAG 1.3.1 (Info and Relationships).

**Shipped in this PR** — wrapped `AnnouncementBanner + MarketingNav` in a
`<header>` element inside `MarketingLayout`.

### 4. `/case-studies` color-contrast — 65 / 55 nodes (highest in batch)

The trade-coloured tint chips (`TINT.cyan.ink` on `TINT.cyan.bg` at 0.18
alpha, etc. in `client/src/pages/CaseStudies.tsx:50-60`) fail AA on dark
text + light tinted backgrounds and again on the corresponding hover/active
states. Each badge multiplies the violation across all 9+ case-study cards
× 6 trade families.

**Recommendation:** raise the ink alpha to 1.0 and the bg alpha to ~0.25 with
a 1px ink-coloured border (matches the `audit(ui): batch2` PR #678 fix to the
product pages), or switch the chips to neutral `text-foreground` with
coloured 1px borders only.

### 5. `/blog` color-contrast — 13 / 14 nodes

Category chips + post-meta text (publish date, reading time) reuse the same
tinted-on-tint pattern. Same fix as #4.

### 6. `/contact` color-contrast — 4 nodes

The 3 contact-method icon chips (Phone / Email / Chat) at the top of
`client/src/pages/marketing/contact.tsx` plus the footer "Sign out" link
underline state. Lower-hanging than #4/#5 — single colour token bump.

### 7. `/demo` color-contrast — 20 nodes per viewport

The `mkt.onDarkMuted` and `mkt.onDarkFaint` palette tokens are used on
gradient mic-orb backgrounds where their AA contrast no longer holds.
PR #680 fixed `muted-foreground` on solid surfaces; the gradient/orb usage
on `/demo` was not in scope.

### 8. `/demo` `scrollable-region-focusable` (serious)

The chat-transcript scroll container (`scrollContainerRef` in
`client/src/pages/marketing/demo.tsx:38`) is keyboard-scrollable but has no
`tabIndex={0}` and no accessible name. Keyboard users can not move focus into
the scroll region to scroll it with the arrow keys. WCAG 2.1.1.

**Recommendation:** add `tabIndex={0}` + `role="log"` + `aria-label="Chat
transcript"` to the scroll container.

### 9. Icon-only buttons without aria-label — broader pattern

Code-grep flagged 15 files using `role="button"` on `<div>`s with `cursor-pointer`
plus icon-only `<button>`s in:

- `client/src/components/marketing/CarouselArrowButton.tsx` (already has
  aria-label, ok)
- `client/src/components/wizard/elfsight/AddFieldMenu.tsx`
- `client/src/components/marketing/TradeLineDemoLauncher.tsx`
- `client/src/components/marketing/TradeLineHeroPhone.tsx`
- `client/src/components/marketing/InfoTooltip.tsx`

These should be reviewed in a follow-up PR — only the visible `/demo` send
button was fixed inline here because it tripped a **critical** rule.

### 10. Form-pattern review — htmlFor/id association

Spot-check of `client/src/pages/Signup.tsx`, `Login.tsx`,
`marketing/contact.tsx`, `OnboardingForm.tsx`, `quote-widget/steps/LeadCaptureStep.tsx`
shows shadcn/ui `<FormField>` + `<FormLabel>` consistently used — labels and
errors are wired via Radix-Slot internally, so the htmlFor/id linkage is
correct. Required-field indication is via the visual asterisk only — no
`aria-required="true"` on the inputs. Recommend a follow-up sweep to add it.

## Quick-win inline fixes shipped in this PR

1. `client/src/pages/marketing/demo.tsx` — `aria-label="Send message"` +
   `aria-hidden="true"` on the chat-send button SVG.
2. `client/src/components/marketing/MarketingLayout.tsx` — skip-to-content
   link, `<header>` landmark wrapping the announcement banner + nav,
   `id="main-content" tabIndex={-1}` on `<main>`.

Expected post-deploy delta on the next batch3 re-run:

- `/demo`: 3 rules -> 2 rules, **critical -> 0**.
- All 8 routes: `skipLink=false -> true`, `header=0 -> 1`.

## Keyboard-navigation code review

- **Skip-to-content** — present on `AdminLayout` and `PortalLayout`; now
  added to `MarketingLayout` (fixed in this PR).
- **Focus visible** — `focus-visible:ring-*` used in only 5 files (mostly
  `LucideIconPicker`, `AdminProductPageShell`, `ToggleQuestion`,
  `LeadCaptureStep`, `CheckboxGroupQuestion`). Most shadcn primitives in
  `components/ui/*` inherit the default 2px ring from the
  Radix base. No regressions found.
- **role="button" on `<div>`s** — present in 15 files. axe did not flag
  these on the audited routes (they live on /portal /admin product pages),
  but recommend a follow-up sweep to add `tabIndex={0}` + `onKeyDown` for
  Enter/Space.
- **Modal focus trap** — Radix `<Dialog>` (used everywhere) traps focus by
  default. `CheckoutModal`, `AuditTabHelpModal` and the toast viewport were
  not custom-implemented — no extra work needed.

## Screen-reader code review

- **Landmarks** — all marketing routes now have `<header> / <nav> / <main>
  / <footer>` after the inline fix. Admin + portal already do.
- **aria-live regions** — 6 files use them (toaster + calc-spinner + chat
  bubble + map-snapshot). Radix `<Toast>` injects `aria-live="polite"` by
  default — no manual wiring needed.
- **aria-label on icon-only buttons** — 20 files in `components/marketing`
  use aria-label or aria-labelledby. Coverage is decent but not complete —
  see finding #9.
- **Form errors** — `<FormMessage>` from shadcn uses `id={formMessageId}`
  + `aria-describedby` on the input — wired automatically by
  `FormField`/`FormItem`.

## Color-contrast code review (delta from PR #680)

PR #680 fixed `--muted-foreground` to clear AA on white. **Remaining hot
spots not in that PR:**

- Trade-coloured tint chips on `/case-studies` (#4 above)
- Blog post-meta + category chips on `/blog` (#5)
- Dark-surface `mkt.onDarkMuted/Faint` on `/demo` gradients (#7)
- Footer legal-link 0.55 alpha is **passing** at 5.5:1 (per the comment in
  `MarketingLayout.tsx:20`) — keep as-is.

## Recommendations for follow-up PRs

1. **`/case-studies` tint-chip contrast pass** — single biggest win in node
   count (120 across both viewports).
2. **`/blog` category-chip + meta-text contrast pass** — 27 nodes.
3. **`/demo` dark-surface contrast + transcript scroll-region a11y** —
   20 nodes + 1 serious rule.
4. **`role="button"` on `<div>` sweep** — convert the 15 known files to
   real `<button>` elements or add `tabIndex` + Enter/Space `onKeyDown`.
5. **`aria-required="true"` on visually-required form fields** — small,
   global sweep on the 5 audited forms.
6. **Continuous gate** — wire `npx playwright test --config
   tests/audit/audit-batch3.config.ts` into the existing audit CI workflow
   so the `critical` gate ratchets future regressions.

## Sign-off

| Severity | Count | Routes affected | Status |
|---|---:|---|---|
| critical | 1 (rule) x 2 (viewport) | /demo | **Fixed inline** |
| serious  | 14 (rule-instances) | 7 of 8 routes | Documented; follow-up PRs |
| moderate | 0 | — | — |
| minor    | 0 | — | — |

`/resources` and `/docs` (mobile) ship **zero** WCAG 2.1 AA violations
today — both can serve as the layout reference for the contrast cleanups
above.
