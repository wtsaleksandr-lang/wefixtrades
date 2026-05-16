# Brand assets

Canonical SVGs for the WeFixTrades brand mark. Use these instead of inlining
geometry by hand or pasting the icon paths into one-off components.

## The mark

The icon is an **open checkbox**: a square outline whose top-right corner is
left open, with a checkmark that exits through that gap. There is **no badge
or box around the icon** — it sits bare on whatever surface it's placed on.

- Box stroke is `#1E1E1E` (ink) on light surfaces, `#F9F9F9` (off-white) on dark.
- The check is always brand blue `#0d3cfc`.
- Geometry (24×24 viewBox): box `M12 7 H4 V20 H17 V12.5`, check `M8 13 11.5 16.5 21 5`.

## Files

| File | Use it for |
|---|---|
| `icon.svg` (24×24) | Bare icon for **light** backgrounds — ink box + blue check. |
| `icon-dark.svg` (24×24) | Bare icon for **dark** backgrounds — white box + blue check. |
| `icon-watermark.svg` (24×24) | Same geometry, single ink tone at ~6% opacity. Decorative background watermark. |
| `icon-badged.svg` (28×28) | **Retired.** No badge anymore — kept as a bare icon (translated, ink box) so old references still resolve. Prefer `icon.svg`. |
| `logo-full-light.svg` (270×56) | Full lockup — bare icon + "WeFixTrades" wordmark ("Fix" in blue), ink text. Light backgrounds. |
| `logo-full-dark.svg` (270×56) | Same lockup, off-white wordmark + white box. Dark backgrounds. |

## Where each is wired in today

- **`favicon.svg`** (`/client/public/favicon.svg`) — bare icon, all-blue (box + check
  both `#0d3cfc`) so it survives both light and dark browser tab themes.
- **`favicon.png`** (`/client/public/favicon.png`) — 256×256 raster of `favicon.svg`,
  transparent background. Regenerate by rendering `favicon.svg` headlessly when the
  mark changes. Also serves as the email header logo.
- **Email header logo** (`server/lib/emailFooter.ts`) — hosted `/favicon.png` via
  `<img>` (webmail clients block `data:` URIs and don't render SVG).
- **PDF audit report** (`server/lib/pdfTemplate.ts`) — inlines the bare icon
  (white box, dark header bar) next to the wordmark text.
- **OG / social-share card** (`server/lib/ogImage.ts`) — inlines the bare icon
  (white box) at the top-left of the 1200×630 share card.

Inline SVGs in `AdminLayout.tsx` / `PortalLayout.tsx` / `client/src/components/primitives/Logo.tsx`
use the same geometry but keep their inline copies (the `Logo` primitive animates
the stroke-draw of each path — externalizing would lose that animation).

## When to use what

- **Marketing footer** — full lockup (light or dark depending on footer bg).
- **Sidebar logo (admin / portal)** — bare icon; the wordmark sits next to it as
  HTML text so it inherits the system font.
- **Browser tab favicon** — `favicon.svg` (all-blue).
- **Email header** — `favicon.png` + wordmark-as-HTML-text. Don't render the
  wordmark as SVG text in email — Outlook desktop renders SVG `<text>` unreliably.
- **PDF report header** — bare icon + wordmark-as-HTML-text.
- **Social share card** — bare icon + wordmark, all SVG (rasterized once before delivery).
- **Hero watermark / decorative** — `icon-watermark.svg`.

## Constraints

- All variants use brand blue `#0d3cfc`, ink `#1E1E1E`, and off-white `#F9F9F9`.
  Change those here, then in `client/src/theme/tokens.ts`, then in
  `server/lib/emailFooter.ts`'s `ACCENT` const. They're not auto-synced.
- Never wrap the icon in a badge, box, or rounded square — the mark is bare by design.
- Don't add new logo variants without a use-case. If you need a one-off treatment,
  prefer inline SVG in the consumer file with a comment pointing back here.
