# Free Tools widget audit — 2026-05-24

Static code audit of the 7 customer-facing Free Tools portal pages under
`/portal/free-tools/*`. Goal: validate premium feel, DESIGN-SYSTEM compliance
(input rules + recurring-violation rules locked 2026-05-21/22), accessibility,
brand-token usage, mobile responsiveness, and LERE/copy quality.

**Audited via:** code review only. Pages sit behind portal auth, so a clean
public Playwright render needs a session cookie — out of scope for this audit
batch. The previews directory `client/public/free-tools/previews/*.png` already
contains Playwright-rendered baselines from
`scripts/generate-free-tool-previews.ts`; they were spot-checked against the
source.

**Scope:**
`index.tsx`, `SchemaGenerator.tsx`, `FaqWidget.tsx`, `HoursWidget.tsx`,
`TrustBadges.tsx`, `ServiceAreaMap.tsx`, `CallbackForm.tsx`, `ReviewLink.tsx`.

## Per-tool scorecard

| Tool | Polish 1–5 | Top issue |
|---|---|---|
| Schema Generator | 4 | Static `<label>` blocks above every input violate locked title-in-field rule |
| FAQ Widget | 3 | Every keystroke fires `patchMut` (no debounce) → toast spam on flaky network |
| Hours Block | 4 | Default `Intl` timezone runs at module-init — SSR/hydration risk if ever SSR'd |
| Trust Badges | 4 | `BadgePreview` always renders the same `ShieldCheck` icon — no actual badge previews |
| Service Area Map | 3 | Pin/circle colour pickers default to a hardcoded hex (`#0d3cfc`) not a token |
| Callback Form | 4 | Status filter `<select>` has no FieldHelpCue; "All" sits last instead of first |
| Review Link + QR | 4 | Star-distribution chart has no axis labels / counts on hover (just `title=`) |

Polish floor for the suite is 3 (FAQ + Service Area), ceiling is 4. Nothing in
the wave hits the 5 bar — none of the tools are using the canonical
`FieldHelpCue`, none use the floating-label / placeholder-as-label pattern, and
all of them stack inputs at `space-y-3/4` which is explicitly forbidden inside
property panels.

## Top 10 site-wide observations

1. **DESIGN-SYSTEM rule #1 (title-in-field) violated everywhere.**
   Every tool repeats the same pattern:
   ```tsx
   const labelClass = "block text-xs font-medium text-gray-600 mb-1";
   <label className={labelClass} htmlFor="...">Street address</label>
   <input ... placeholder="123 Main St" />
   ```
   The locked rule (DESIGN-SYSTEM.md line 51) is "Title inside the input field,
   not above it." All 7 tools use a separate `<label>` block — full rewrite of
   `labelClass` → floating-label component needed. This was flagged before in
   `feedback_input_field_rules.md`.

2. **Recurring-violation rule #2 (FieldHelpCue) violated everywhere.**
   Zero `<FieldHelpCue>` instances across the 7 files. Every section header
   ("Business address", "Opening hours", "Choose your badges", "Map settings",
   "Link settings", "Widget settings") needs a top-left `?` cue. Currently
   customers get zero contextual help anywhere in the suite.

3. **Recurring-violation rule #1 (no large gaps) violated everywhere.**
   `space-y-6`, `space-y-4`, `space-y-3` appear in every file
   (12/16/24px gaps). Spec calls for 2px input clustering or 1px hairline
   dividers. This is *the* most-cited UI sin per Alex's recurring-violations
   memo and the entire wave ships violating it.

4. **No `aria-required` on truly required inputs.**
   Schema "Street address" is functionally required (placeholder schema is
   useless without it), Service Area `address_line` is required (button
   disables on empty), but neither has `required` or `aria-required="true"`
   on the input. Screen readers can't announce required state.

5. **FAQ Widget — keystroke autosave with no debounce.**
   `FaqWidget.tsx` lines 259 + 265: every character typed into a question or
   answer fires a PATCH and re-runs the toast on error. On a flaky truck-Wi-Fi
   connection this produces a wall of red toasts and N PATCHes per word. Needs
   either (a) blur-based save, (b) a 400ms debounce, or (c) explicit Save
   button. Not premium.

6. **No empty-state imagery anywhere.**
   FAQ empty state: "No questions yet — add your first below." (plain text).
   Callback inbox empty state: "No callbacks in this view yet." (plain text).
   Feedback inbox empty state: plain text. Premium SaaS norm here is a small
   illustration + a single-action CTA — currently feels like an unfinished
   product page.

7. **Iframe previews locked to light mode (`bg-slate-50`).**
   Every preview pane forces `data-theme="light"` on the page wrapper. If a
   customer toggles the portal to dark mode (PreferenceToggle exists in the
   shell), the Free Tools pages snap back to light — jarring. Either drop the
   forced `data-theme="light"` and theme the iframe wrapper properly, or
   document this as an intentional carve-out.

8. **No "Save" affordance is sticky.**
   In Hours, Trust Badges, Service Area, Callback, Review Link the Save button
   lives at the *end* of the editor column. On mobile, customers edit fields
   in the long left column then have to scroll past everything to find Save.
   Mobile UX rule: sticky-bottom save bar (we already established this pattern
   for QuoteQuick — see `feedback_sticky_widget_header.md` PR #467).

9. **Hours Widget — unused `useEffect` was imported.**
   Same in FaqWidget (now fixed inline). Service Area imports `useMemo` for
   `previewUrl` which is good, but adds a `?t=${previewKey}` cache-buster to
   the URL — fine for dev, but means every save bumps the URL and breaks any
   CDN-level caching (the embed docs claim "immutable cache").

10. **Premium-button blast radius too wide.**
    `.btn-primary-premium` (defined `index.css` line 1800) is documented as
    *"NOT a default for every blue button — reserve for the single page-primary
    CTA"*. Every tool uses it for both **Copy snippet** AND **Save** AND
    sometimes **Add question** — multiple "primary" CTAs per page dilutes the
    premium feel. Spec: one premium gradient per page, others should be the
    plain `Button` default. Counted instances: Schema (1 OK), FAQ (3 — bad),
    Hours (3 — bad), Badges (3 — bad), Service Area (3 — bad), Callback (3 —
    bad), Review Link (2 — bad).

## Quick wins shipped inline

- `FaqWidget.tsx` — dropped unused `useEffect` import (TypeScript lint cleanup).

## Quick wins not shipped (need >5 lines or design discussion)

- Migrate all `<label>` blocks to floating-label component (touches all 7 files,
  ~200 LoC, needs a shared `<FloatingField>` component).
- Add `<FieldHelpCue>` to every section header (touches all 7 files,
  needs help-copy from product).
- Compress `space-y-{3,4,6}` to hairline divider pattern.
- Debounce FAQ patch mutations.
- Sticky-bottom Save bar on mobile across editor cards.
- Reduce `.btn-primary-premium` to one per page (downgrade the rest).

## Accessibility notes (axe-style spot checks)

- All toggle buttons in `TrustBadges` use `aria-pressed` correctly.
- All `<button>` icon-only controls have `aria-label`.
- Lucide icons consistently have `aria-hidden="true"`.
- No skip-to-content link on any Free Tools page (covered by `PortalLayout`?).
- Star-distribution chart in Review Link has only `title=` on bars — not
  keyboard-discoverable. Should be a real `<button>` or have `tabindex="0"`.
- Time inputs use native `<input type="time">` — accessible by default. Good.

## Mobile responsiveness (code-grep only)

- `grid-cols-1 lg:grid-cols-3` everywhere — collapses cleanly.
- Editor column is always `lg:col-span-2`, preview is `lg:col-span-1`.
- Service Area pin/circle colour rows use `grid-cols-1 sm:grid-cols-2` —
  cramped on 320–360 widths because each cell has a 48px swatch + input. Verify
  with Playwright on a 320px viewport.
- Schema Generator hours rows: `flex-1` time inputs + 28-char day label on
  iPhone SE → text + 2 time-pickers may overflow horizontally. Should test.

## Conclusion

The suite *functions* well — every tool persists state correctly, snippets
copy, previews refresh, and the inbox patterns are consistent. Visual polish
is mid-tier: the wave shipped before the locked DESIGN-SYSTEM input rules and
the recurring-violations memo, so the entire suite is now technically
out-of-spec on items #1, #2, and #3 of the global rules. A follow-up
**`polish/free-tools-design-system`** PR should:

1. Introduce a `<FloatingField>` wrapper (or use the existing one from
   QuoteQuick if it exists).
2. Add `<FieldHelpCue>` to every section header.
3. Migrate the 3 gap-violation patterns to hairline dividers.
4. Cap `.btn-primary-premium` to one CTA per page.
5. Add sticky-bottom Save bar on mobile editor columns.

Estimated 1.5–2 days of work for one design-systems-aware engineer.
