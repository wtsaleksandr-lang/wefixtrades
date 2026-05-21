# W-BB-2 — Per-category visual variety verdict

AS-1c shipped explicit dramatic Brand Studio identities for 3 sample
templates (junk_removal_quote, window_replacement_quote, mold_remediation_quote).
The remaining 44 templates were left bare — the gallery still read as
"44 white cards with the default blue accent" once you got past those 3.

BB-2 closes that gap by deriving a category-level `AdvStyle` at load time:
`toAdvancedConfig()` and the wizard shell's `applyTemplate()` now BOTH read
`template.style ?? deriveStyleFromCategory(template)`, so every template
without its own `style:` block picks up a per-category gradient body,
accent-tinted result panel, urgency-tuned animations, and heading weight.

The 3 AS-1c templates are unaffected — they keep their explicit `style:`
blocks. The derivation helper is only invoked as a fallback.

## 7-category palette table

| Category            | bg from   | bg to     | accent    | urgency | animation    | heading | font     |
| ------------------- | --------- | --------- | --------- | ------- | ------------ | ------- | -------- |
| Automotive          | `#0f172a` | `#1e293b` | `#fb923c` | high    | slide-fade   | 800     | geist    |
| Construction        | `#1c1917` | `#292524` | `#f59e0b` | medium  | slide        | 700     | satoshi  |
| Cleaning            | `#ecfdf5` | `#d1fae5` | `#10b981` | low     | fade         | 600     | jakarta  |
| Home Improvement    | `#f0f9ff` | `#dbeafe` | `#2563eb` | medium  | fade         | 700     | inter    |
| Emergency           | `#fef3c7` | `#fed7aa` | `#dc2626` | high    | slide-fade   | 800     | manrope  |
| Outdoor             | `#f0fdf4` | `#d1fae5` | `#16a34a` | low     | slide        | 700     | jakarta  |
| Professional        | `#faf5ff` | `#ede9fe` | `#7c3aed` | medium  | fade         | 600     | satoshi  |

Within a category, the gradient `direction` rotates between
`to bottom right`, `to bottom`, `to bottom left`, `radial` so two cleaning
templates don't look identical. The rotation is keyed off a stable hash of
`template.id`, so each template always lands on the same direction across
reloads.

`resultPanel.emphasis` is `'bold'` for `urgency === 'high'`, `'normal'`
otherwise. `resultPanel.border` is `'accent-tinted'` for high urgency,
`'subtle'` otherwise.

## Verdict — PASS

10 templates spanning all 7 categories were captured under
`tests/audit/_screenshots/bb2-*.png` via
`tests/audit/wave-bb2-variety-screenshot.spec.ts`. All 10 tests passed.

Visual cross-check (sampled widget shots):

| Template               | Category         | Confirmed identity                          |
| ---------------------- | ---------------- | ------------------------------------------- |
| car_towing             | Automotive       | dark slate gradient + orange $85.00 headline |
| roof_repair            | Construction     | dark stone gradient + amber $6,000 headline  |
| property_cleaning      | Cleaning         | emerald gradient + green $128 headline       |
| gutter_cleaning        | Cleaning         | emerald gradient, DIFFERENT direction        |
| interior_painting      | Home Improvement | sky-blue gradient + blue accent              |
| locksmith_service      | Emergency        | amber-to-peach gradient + bold red $95       |
| water_damage_restoration | Emergency      | amber-to-peach + bold red headline           |
| landscaping            | Outdoor          | light-green gradient + green $900 headline   |
| mobile_car_detail      | Automotive       | dark slate gradient, different direction     |
| web_design_quote       | Professional     | violet gradient + purple $2,240 headline     |

Across categories: every category reads as a distinct visual identity
(dark-slate / dark-stone / emerald / sky / amber / lime / violet). Two
Automotive templates and two Cleaning templates use different gradient
directions inside the same palette — they're recognisably the same family
without being pixel-identical.

Within categories: the per-template direction rotation works as intended.

## Validation

- `npx tsc --noEmit` — clean
- 10/10 Playwright tests passed (`audit.bb2.config.ts`)
- AS-1c templates UNTOUCHED: the 3 explicit-style templates short-circuit
  the derivation in both `toAdvancedConfig` and the wizard's `applyTemplate`.
