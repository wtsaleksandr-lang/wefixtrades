# QuoteQuick Dashboard — Design Lock

**Status**: LOCKED · **Date**: 2026-05-17 · **Owner**: Alex
**Reference**: Effortel billing dashboard screenshot (`Screenshot_20260517-191619`).

This document **locks** the visual language for the QuoteQuick builder wizard.
Every existing screen and every new feature on that surface must match it.
The canonical implementation lives in `client/src/theme/dashboardTheme.ts`
(values mirrored into `client/src/theme/tokens.ts` under `colors.dashboard`).

> If a design decision is not covered here, it is **not** locked — ask Alex
> rather than inventing one.

---

## 1 · The look in one paragraph

A **slate blue-grey canvas** with **floating, rounded panels** sitting on top of
it. The shell is split into separate "bars and sections": a detached header
bar, then — below a gap — a main panel holding an icon nav rail and the
content area. Inside, content is built from **borderless, softly-shadowed
cards** with large rounded corners; even table rows are individual rounded
cards separated by gaps, never a bordered grid. All numbers and dates are set
in a **monospace** face. The single accent is **WeFixTrades brand blue**
(`#0d3cfc`) — it replaces the teal/cyan used in the reference. The active nav
item is a **dark rounded square** with a brand-blue icon.

---

## 2 · Color tokens

All values are also exported from `tokens.ts` (`colors.dashboard`) and
assembled in `dashboardTheme.ts` (`dashboardTheme.colors`).

### Surfaces

| Token         | Hex        | Use                                                |
|---------------|------------|----------------------------------------------------|
| `canvas`      | `#A2B6BF`  | Outermost page background (the slate grey)         |
| `panel`       | `#E4EDF1`  | Main content panel, nav rail, header bar           |
| `card`        | `#FFFFFF`  | Stat cards, table-row cards, inputs                |
| `cardMuted`   | `#F4F6F8`  | Inactive / secondary card surface                  |
| `cardHover`   | `#F7F9FB`  | Card hover state                                   |

`canvas` is "the grey" referenced by Alex. `panel` is `effortel.n200`;
`canvas` sits between `effortel.n400` and `n500` on the existing ramp.

### Navigation rail

| Token            | Hex        | Use                                          |
|------------------|------------|----------------------------------------------|
| `navActiveBg`    | `#22282A`  | Active nav item — dark rounded square         |
| `navActiveIcon`  | `#0d3cfc`  | Icon inside the active square (brand blue)    |
| `navIcon`        | `#6B7886`  | Inactive nav icon                             |
| `navIconHover`   | `#3A434B`  | Inactive nav icon, hover                      |

### Text

| Token     | Hex        | Use                              |
|-----------|------------|----------------------------------|
| `heading` | `#22282A`  | Headings, large numerals         |
| `body`    | `#4A5560`  | Body copy                        |
| `muted`   | `#7E8A94`  | Captions, column headers         |
| `subtle`  | `#A2AEB7`  | De-emphasised / placeholder text |

### Accent (brand blue — replaces the reference teal)

| Token            | Hex                       | Use                          |
|------------------|---------------------------|------------------------------|
| `accent`         | `#0d3cfc`                 | Primary actions, active icon |
| `accentDark`     | `#0b34d6`                 | Hover / pressed              |
| `accentLight`    | `#4f6dfd`                 | Subtle accent text           |
| `accentLighter`  | `#E6EAFF`                 | Accent-tinted backgrounds    |
| `accentTint`     | `rgba(13,60,252,0.08)`    | Faint wash                   |

### Status pill badges (pastel)

Soft tinted background + darker text, fully rounded (`radius.pill`).

| Variant | Bg        | Text      |
|---------|-----------|-----------|
| Blue    | `#D9E2FF` | `#0b34d6` |
| Green   | `#BEEFD3` | `#1B7A3D` |
| Red     | `#F6D8DA` | `#B23A45` |
| Amber   | `#FBE6C8` | `#9A6512` |

### Borders

Borders are **hairline and rare** — separation comes from surface contrast,
gaps, and shadow. When a border is unavoidable: `border` `#D8E0E6`,
`borderLight` `#E8EDF1`.

---

## 3 · Layout — "split bars and sections"

```
┌──────────────────────────────────────────────┐  ← canvas (#A2B6BF)
│  ┌────────────────────────────────────────┐  │
│  │  header bar  (panel, radius.panel)     │  │
│  └────────────────────────────────────────┘  │
│            ↕ layout.panelGap (14px)           │
│  ┌──────┬─────────────────────────────────┐  │
│  │ rail │  content area                   │  │
│  │      │   ┌─────┐ ┌─────┐ ┌─────┐        │  │
│  │      │   │ card│ │ card│ │ card│  ...   │  │
│  │      │   └─────┘ └─────┘ └─────┘        │  │
│  │      │   ┌───────────────────────────┐  │  │
│  │      │   │ table-row card            │  │  │
│  │      │   └───────────────────────────┘  │  │
│  └──────┴─────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

Rules:
- The header bar and the main panel are **separate** rounded panels with a
  `layout.panelGap` (14px) gap of bare canvas between them.
- Panels use `radius.panel` (24px). The canvas is always visible around them
  (`layout.shellPad`, 16px, on every side).
- The nav rail is part of the main panel, `layout.railWidth` (76px), icon-only.
- Content cards sit on `panel`, separated by `layout.cardGap` (12px). Never
  draw a divider line where a gap will do.
- Table rows are **individual cards**, not `<tr>` rows in a bordered table.

---

## 4 · Radius scale

| Token        | Value   | Use                               |
|--------------|---------|-----------------------------------|
| `panel`      | `24px`  | Header bar, main panel            |
| `card`       | `16px`  | Stat cards, table-row cards       |
| `control`    | `10px`  | Inputs, buttons, small controls   |
| `navSquare`  | `12px`  | Active nav square                 |
| `pill`       | `999px` | Status badges, toggles            |

Nothing on this surface uses square (0-radius) corners.

---

## 5 · Elevation

Shadows are **soft, low-contrast, blue-grey tinted** — never black, never
hard. Separation is mostly surface contrast; shadow is a finishing touch.

| Token       | Value                                                            |
|-------------|------------------------------------------------------------------|
| `card`      | `0 1px 3px rgba(20,30,45,0.04), 0 8px 24px rgba(20,30,45,0.05)`   |
| `cardHover` | `0 2px 6px rgba(20,30,45,0.06), 0 14px 32px rgba(20,30,45,0.08)`  |
| `panel`     | `0 1px 2px rgba(20,30,45,0.04), 0 10px 30px rgba(20,30,45,0.06)`  |
| `nav`       | `0 6px 16px rgba(13,60,252,0.24)` (active nav square only)        |

---

## 6 · Typography

- **UI font**: `Satoshi Variable`, system-ui fallback (unchanged).
- **Monospace**: `"Et Mono", "SF Mono", "Roboto Mono", monospace`
  (`dashboardTheme.typography.fontMono`).
- **Numerals & dates are mono.** Any KPI value, price, count, percentage,
  duration or date in this surface is set in `fontMono`. Prose stays in the
  UI font.
- Headings: 600–700 weight, near-black `heading`, tight line-height.
- Column headers / captions: `muted`, 12px, 500 weight.

---

## 7 · Component recipes

**Stat / KPI card** — `card` surface, `radius.card`, `shadows.card`, no
border. Icon top-left (stroke, `muted`), large mono value, `muted` caption.

**Table-row card** — `card` surface, `radius.card`, `shadows.card`, one per
record, stacked with `layout.cardGap`. Mono for every numeric/date cell.
Hover → `cardHover` + `shadows.cardHover`.

**Nav rail** — `panel` surface, `layout.railWidth` wide, icon-only. Active
item = `navActiveBg` rounded square (`radius.navSquare`) + `navActiveIcon`
glyph + `shadows.nav`. Inactive = `navIcon`, hover `navIconHover`.

**Status pill** — pastel badge pair from §2, `radius.pill`, ~`2px 10px`
padding, 12px 700-weight mono text.

**Primary button** — `accent` bg, white text, `radius.control`, hover
`accentDark`.

---

## 8 · Do / Don't

- **Do** let the canvas grey show through between panels and around the shell.
- **Do** use gaps + surface contrast to separate things.
- **Do** set every number/date in `fontMono`.
- **Don't** use the reference's teal — the accent is brand blue `#0d3cfc`.
- **Don't** add hard or dark borders, bordered tables, or square corners.
- **Don't** use pure-black shadows.
- **Don't** introduce a second accent colour.

---

## 9 · Consuming the lock

```ts
import { dashboardTheme as d } from '@/theme/dashboardTheme';

// d.colors.canvas, d.colors.card, d.colors.accent ...
// d.radius.panel, d.radius.card ...
// d.shadows.card, d.layout.panelGap, d.typography.fontMono ...
```

The builder wizard (`client/src/components/wizard/`) is the first surface to
adopt this — see the follow-up PR. `dashboardTheme` is intentionally shaped
like `platformTheme` so the migration is mostly a token swap.
