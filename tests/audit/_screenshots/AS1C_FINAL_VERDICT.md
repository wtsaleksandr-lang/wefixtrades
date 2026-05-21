# W-AS-1c — Final verdict (template-polish-finish)

AS-1b proved the 3 sample templates rendered distinct identities but flagged 3
schema mismatches that prevented the FULL template visual identity from
landing. AS-1c (this wave) closes the loop.

## What changed

**Schema (`shared/templatePresets.ts`):**

1. `AdvBgGradientDirection` — added the CSS-standard linear-gradient
   shorthands (`'to top'`, `'to top right'`, `'to right'`, `'to bottom right'`,
   `'to bottom'`, `'to bottom left'`, `'to left'`, `'to top left'`). Legacy
   `'linear-*'` values retained for backwards-compat with any stored
   AO-6c configs.
2. `AdvResultBorder` — added `'accent-tinted'` (1.5px solid accent at 22 %
   opacity, midway between `'subtle'` hairline and full `'accent'`).
3. `BRAND_STUDIO_STYLE_KEYS` — already includes `'animations'` (added by
   AO-6d). Verified no change needed here.

**Renderer (`client/src/components/quote-widget/AdvancedCalculator.tsx`):**

- `gradientCss()` — extended switch handles all 8 CSS-standard direction
  tokens, falling through to the existing `linear-down` default for safety.
- Result-panel `border` block — added the `'accent-tinted'` arm using
  `hexToRgba(rpAccent, 0.22)`.

**Templates updated (3):**

| Template            | bgGradient.direction   | resultPanel.border | animations                                              |
| ------------------- | ---------------------- | ------------------ | ------------------------------------------------------- |
| Junk Removal        | `to bottom right`      | `accent-tinted`    | `{ slide-fade, 280ms, reduced_motion_respect: true }`   |
| Window Replacement  | `to bottom`            | `subtle`           | `{ fade, 220ms, reduced_motion_respect: true }`         |
| Mold Remediation    | `to bottom`            | `accent-tinted`    | `{ slide, 250ms, reduced_motion_respect: true }`        |

## Verification

- `npm run check` → clean.
- Playwright spec `tests/audit/wave-as1c-template-polish.spec.ts` re-shoots
  the same 3 templates after the polish. All 3 tests passed.

## Screenshots

- `as1c-junk_removal_quote-widget.png` — dark slate diagonal gradient (top-left
  → bottom-right), bold orange headline + soft orange-tinted result panel
  border.
- `as1c-window_replacement_quote-widget.png` — airy sky-to-lavender vertical
  gradient, indigo headline + hairline result panel border (intentionally
  unchanged from AS-1b — already correct).
- `as1c-mold_remediation_quote-widget.png` — warm amber-to-peach vertical
  gradient, bold red headline + soft red-tinted result panel border (no longer
  shouting over the amber body).

## Outcome

The 3 sample templates now carry full Brand Studio identity end-to-end —
distinct gradient directions, distinct border emphasis levels, and per-template
step-transition animations — matching the design intent that AS-1 and AS-1b
were building toward.
