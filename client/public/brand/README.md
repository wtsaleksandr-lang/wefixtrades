# Brand assets

Canonical SVGs for the WeFixTrades brand mark. Use these instead of inlining
geometry by hand or pasting the icon paths into one-off components.

## Files

| File | Use it for |
|---|---|
| `icon.svg` (24×24) | Bare blue brackets+check. Use when the surrounding container *already* provides a backdrop (light card, white surface, etc). No badge of its own. |
| `icon-badged.svg` (32×32) | Icon inside a grey rounded-square badge. Use when the icon sits directly on a dark background that would otherwise bury the blue strokes (sidebar logos, email header, page favicon). |
| `icon-watermark.svg` (24×24) | Same geometry at ~6% opacity. Background watermark for hero sections / decorative repetition. Layer on top of any surface. |
| `logo-full-light.svg` (280×56) | Full lockup — badged icon + "WeFixTrades" wordmark with "Fix" in blue + dark text. Use on light backgrounds (PDF reports, light marketing pages). |
| `logo-full-dark.svg` (280×56) | Same lockup, off-white wordmark. Use on dark backgrounds (hero sections, dark emails, social-share cards). |

## Where each is wired in today

- **`favicon.svg`** at the repo root (`/client/public/favicon.svg`) — mirrors `icon-badged.svg`. Updates to the badged variant should be reflected in both.
- **Email header logo** (`server/lib/emailFooter.ts`) — uses `icon.svg` data-URI'd inline, inside a grey wrapper element so it reads even in email clients that strip SVG (the wrapper provides the grey badge in HTML).
- **PDF audit report** (`server/lib/pdfTemplate.ts`) — inlines `icon-badged.svg` in the header next to the wordmark text.
- **OG / social-share card** (`server/lib/ogImage.ts`) — inlines the badged icon at the top-left of the 1200×630 share card.

Inline SVGs in `AdminLayout.tsx` / `PortalLayout.tsx` / `client/src/components/primitives/Logo.tsx` use the same geometry but keep their inline copies (the Logo primitive animates the stroke-draw of each path — externalizing would lose that animation).

## When to use what

- **Marketing footer** — full lockup (light or dark depending on footer bg).
- **Sidebar logo (admin / portal)** — badged icon only; the wordmark sits next to it as HTML text so it inherits the system font.
- **Browser tab favicon** — badged icon.
- **Email header** — badged icon + wordmark-as-HTML-text. Don't render the wordmark as SVG text in email — Outlook desktop renders SVG `<text>` unreliably.
- **PDF report header** — badged icon + wordmark-as-HTML-text. PDF renderer (puppeteer/Chromium) does render SVG `<text>` correctly but inline HTML matches the rest of the report's typography.
- **Social share card** — badged icon + lockup, all SVG (the share card is rasterized once before delivery).
- **Hero watermark / decorative** — `icon-watermark.svg`.

## When you need PNG fallbacks

Outlook desktop (2016/2019/365) doesn't render SVG inside `<img>` reliably. Two options:

1. Generate PNG exports of `icon.svg` and `icon-badged.svg` at 1× and 2× (24/48/32/64 px). Then use a `<picture>` / `<img>` with PNG `src` and SVG `srcset`.
2. Accept that Outlook desktop falls back to the `alt` text. Modern email clients (Gmail, Apple Mail, Outlook Web, all mobile) render the SVG correctly.

The current `emailFooter.ts` takes option 2 — alt text reads "WeFixTrades", so the worst-case fallback is still on-brand.

## Constraints

- All variants use the same brand blue (`#0d3cfc`) and grey badge (`#E5E7EB`) — change those values here, then in `client/src/theme/tokens.ts`, then in `server/lib/emailFooter.ts`'s `ACCENT` const. They're not auto-synced.
- Don't add new logo variants without a use-case. If you need a one-off treatment, prefer inline SVG in the consumer file with a comment pointing back here.
