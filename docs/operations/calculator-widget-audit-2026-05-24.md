# Calculator + Embed Widget audit — 2026-05-24

Static code review of the QuoteQuick customer-facing calculator + embeddable
widget system. Focus: customer UX, embed reliability, perf, hosting concerns,
mobile fit.

**Scope reviewed**

- `client/public/embed-widget.js` (loader, ~19.2 KB raw)
- `client/public/embed-chat.js` (chat-only embed, ~4.8 KB raw)
- `client/public/widget/embed.js` (ReputationShield review widget, ~5.7 KB)
- `client/src/pages/calculator.tsx` (hosted + iframe page entry)
- `client/src/components/quote-widget/*` (QuoteWidget + 50+ children)
- `client/src/components/quote-widget/AdvancedCalculator.tsx` (3358 LOC)
- `server/routes/leadRoutes.ts` (`POST /api/leads`)
- `server/routes/calculatorRoutes.ts` (lookup + customization persist)
- `server/index.ts` (helmet / CSP / CORS / X-Frame / CORP)
- `server/jobs/embedBrokenDetector.ts`
- `vite.config.ts` (chunking strategy)

**Method:** code-only. No browser run, no Lighthouse, no live embed sniff
(would need `npm install` — excluded by audit charter).

## Widget bundle size

`embed-widget.js` itself is **19,658 bytes** raw (~6 KB after gzip estimate).
That's the *loader*. The actual widget is the React app served from
`/Calculator?slug=…&embed=true` inside the iframe, which is **not split**:
`vite.config.ts` only defines vendor chunks (`vendor-react`, `vendor-radix`,
`vendor-motion`, `vendor-gsap`, `vendor-rive`, `vendor-charts`, `vendor-globe`)
but `App.tsx` uses **zero `React.lazy` / dynamic imports** — every route
(admin, portal, marketing, calculator) ships in the same main entry. An
embedded calculator iframe therefore loads the entire SPA: vendor chunks
(React + Radix + Framer + GSAP + Recharts + globe.gl + three.js) plus every
page module the router can reach. Real-world iframe payload is likely
**1.5–3 MB transferred / 5–8 MB parsed** — this is the dominant perf concern.

## Severity-ranked findings

### P0 — high impact, ship soon

1. **No code-splitting for `/Calculator` iframe target.**
   `vite.config.ts` chunks vendors but `client/src/App.tsx` imports every
   page eagerly (`import Calculator from "@/pages/calculator"`, 50+ others).
   Embedded customers download the admin shell, marketing pages,
   globe.gl/three.js (~600 KB), recharts, etc., on first paint of a quote
   widget. Fix: wrap non-`/Calculator` routes in `React.lazy` + Suspense;
   keep the calculator path eager so the embed iframe is fast.

2. **`postMessage(..., '*')` from iframe to parent.**
   `client/src/pages/calculator.tsx:42` sends the resize event with a
   wildcard target origin:
   ```ts
   window.parent.postMessage({ type: 'quotequick-resize', slug, height }, '*');
   ```
   Low-impact today (payload is just `{slug, height}`), but it's a leak
   primitive — any embedding origin can listen for `quotequick-resize` and
   correlate slugs with heights. The embed loader doesn't know the parent
   origin, but the iframe knows `document.referrer` → target it to that
   referrer's origin (or skip if cross-origin and unknown).

3. **`message` listener in `embed-widget.js` doesn't verify `event.origin`.**
   Lines 91–95 + 461–465 accept any window's message that matches the
   `{type:'quotequick-resize', slug}` shape. A malicious script on the host
   page could spam fake resize events and stretch the iframe to gigantic
   heights, blowing out the page layout (DoS-ish). Easy fix: ignore
   messages whose `event.source !== iframe.contentWindow`. Quick win
   shipped inline below.

4. **AdvancedCalculator is 3,358 lines in a single component file.**
   No internal code-split, no React.lazy on the rarely-used Brand Studio
   bits. Pricing, theming, scheduling, deposit, contact, custom CSS, font
   loading, animations all in one module. Render diff cost is high; HMR
   thrashes in dev. Refactor target — out of scope for an audit, flagged
   in `large-files-refactor-plan-2026-05-24.md`.

### P1 — meaningful UX / reliability issues

5. **Lead dedup is per-process in-memory.**
   `leadRoutes.ts:34` uses a `Map<string, number>` for 10s dedup. In a
   multi-instance deploy (Replit autoscale), each instance has its own
   map; a double-tapped submit served by two pods bypasses dedup. Should
   live in Redis/DB or rely on a unique index.

6. **No rate limit on `POST /api/leads`.**
   Helmet is loaded but no `express-rate-limit` / `slowDown` wraps this
   endpoint. Endpoint is public, calculator_id is enumerable, validation
   only requires email-or-phone — a bot can spray fake leads at any
   published calculator, polluting owner inboxes and burning email/SMS
   quota. Add a per-IP + per-calculator_id token bucket.

7. **`embedBrokenDetector` fires per zero-view calc but doesn't
   batch-debounce per owner.**
   An owner with 5 published-but-removed calcs gets 5 alert emails the
   same day. Add aggregation per owner_email before `fireAlert`.

8. **No `noindex` on `/Calculator` iframe variant.**
   The hosted page (`{slug}.your-quote.net`) is intentionally indexed,
   but the iframe-mode response (`?embed=true`) is the *same* SPA — Google
   can crawl `wefixtrades.com/Calculator?slug=foo&embed=true` and index
   duplicates of every embedded calc, hurting customer SEO. Should emit
   `<meta name="robots" content="noindex">` (or `X-Robots-Tag: noindex`
   header) when the request includes `embed=true`.

9. **Lead form has no honeypot / CAPTCHA.**
   `LeadCaptureStep.tsx` has client-side validation only. Server requires
   email-or-phone, validates email regex, but nothing else. For free-tier
   public calcs this is a spam magnet.

10. **No request timeout on `/api/calculators/lookup`.**
    `calculator.tsx:55` `fetch` has no AbortController — a stalled DB
    query blocks the iframe spinner indefinitely. LeadCaptureStep got a
    15s timeout (line 184); apply the same pattern here.

### P2 — polish

11. **Floating-mode launcher uses inline SVG + inline styles for the
    panel.** Repeated SVG / style strings inflate the loader. Tolerable
    today but a stylesheet + class scheme would let CSP get stricter.

12. **`embed-widget.js` reads `data-base-url` from script attr without
    URL validation.** A typo'd `data-base-url="javascript:..."` is not
    sanitized before being concatenated into the iframe src. Concrete
    exploit is unlikely (owner controls their own snippet) but
    defensively validate `URL(baseUrl)` and require `http(s):`.

13. **`/embed-chat.js` and `/embed-widget.js` are served from the SPA
    static dir** — no surrogate/CDN cache headers in `server/index.ts`
    beyond CORP. Add `Cache-Control: public, max-age=300, s-maxage=86400`
    so repeat visitors don't re-download 19 KB on every page nav.

14. **Resize loop on rapid step transitions.** The `ResizeObserver` in
    `calculator.tsx:39` fires on every layout change and emits one
    postMessage per frame during animations. Throttle (e.g.
    `requestAnimationFrame` or 100ms debounce) — currently the parent
    page can receive 60 messages/sec during the step-change animation.

15. **`Cross-Origin-Opener-Policy` not explicitly set for `/Calculator`.**
    Helmet's default is fine but if the embed ever wants to do
    `window.parent.postMessage` to a popup, COOP `same-origin` (helmet
    default in some versions) would break it. Verify on a live embed.

16. **Hosted-page `error` state link to "Create a Calculator" hardcodes
    `/Wizard`** (`calculator.tsx:91`). Marketing surface uses different
    routes (`/quotequick`); flag for marketing-route audit.

17. **Floating-launcher `qq-launcher-state-${slug}` localStorage is
    same-origin scoped** — meaning if the same calculator is embedded on
    site A (open) and site B (closed), the second visit on site B
    inherits A's state because both iframes share `wefixtrades.com`
    localStorage. Edge case but surprising.

18. **Lead submit `body.referrer` uses `document.referrer`** — inside an
    iframe this is the parent page's URL only if the parent doesn't set
    `Referrer-Policy: no-referrer`. Many hosts strip it. Pair with
    `landing_page` (already collected) for attribution fallback.

19. **`AdvancedCalculator.tsx` ContactStep uses `<FloatingLabelInput>`
    correctly; `LeadCaptureStep.tsx` (the simpler path used by
    classic_single template) still uses the old block-`<label>` above
    `<input>` pattern.** Violates the title-in-field design-system rule
    locked 2026-05-21 (`feedback_input_field_rules.md`). Should adopt
    the same floating-label helper.

20. **No serverside check that `pricing_config.tiers` is finite.** Owner
    can save a calc with NaN/`Infinity` in a tier price; `calculateEstimate`
    returns `Infinity`, the lead body sends `null` (correctly, via
    `Number.isFinite` guard at `LeadCaptureStep.tsx:145`), but the
    owner-facing dashboard shows broken totals.

## Top 10 polish recommendations (prioritized)

1. **Code-split `App.tsx`** so the iframe loads `/Calculator` route only.
   Estimated 60–80 % first-paint win for embeds. (P0 #1)
2. **Add `noindex` to `?embed=true`** responses to protect customer SEO.
   (P1 #8) Header from server is cheapest.
3. **Origin-check the `message` listener** in `embed-widget.js`.
   (P0 #3, quick win — shipping inline this PR)
4. **Target the resize `postMessage` to the parent origin** instead of
   `'*'`. (P0 #2)
5. **Rate-limit `POST /api/leads`** per-IP + per-calculator. (P1 #6)
6. **Move lead dedup to Redis/DB** for multi-pod safety. (P1 #5)
7. **Cache-control headers on `/embed-widget.js`**. (P2 #13)
8. **Throttle the ResizeObserver postMessage** to ≤10/sec. (P2 #14)
9. **AbortController on `/api/calculators/lookup`**. (P1 #10)
10. **Honeypot field on `LeadCaptureStep`** + server-side rejection.
    Minimum viable spam defense. (P1 #9)

## Quick wins shipped inline this PR

- **`embed-widget.js`** — `message` listeners now ignore events whose
  `event.source !== iframe.contentWindow`. Blocks the spoofed-resize-DoS
  vector for both inline and popup modes. ~6 added lines, no
  dependencies.

## Out of scope / follow-ups

- Live Lighthouse / WebPageTest run (needs deployable build → separate
  PR).
- Full SPA route-split refactor (large; track as its own wave).
- Replace in-memory lead dedup with Redis (pairs with portal-rate-limit
  wave).
- AdvancedCalculator decomposition (already in
  `large-files-refactor-plan-2026-05-24.md`).
