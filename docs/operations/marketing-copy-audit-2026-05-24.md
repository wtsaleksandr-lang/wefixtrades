# Marketing Copy + Content Strategy Audit — 2026-05-24

**Scope:** 8 priority marketing pages — `/`, `/pricing`, `/products/tradeline`, `/products/quickquotepro`, `/free-audit` (`/tools/free-audit`), `/services`, `/products/socialsync`, `/products/rankflow`.

**Method:** Source-of-truth read of `client/src/pages/marketing/home.tsx`, `client/src/pages/PricingUnified.tsx`, `client/src/pages/marketing/FreeAudit.tsx`, `client/src/pages/marketing/services.tsx`, and the slug-driven template `client/src/pages/products/EffortelProductPage.tsx` backed by `client/src/config/products.ts` (4 product slugs).

**Scoring:** 1 (poor) to 5 (excellent) on 7 axes per page. Averages reflect the unweighted mean across axes.

---

## CRITICAL FLAG — Fabricated social proof

**Before any scoring:** the FreeAudit page and `TrustStrip` component carry the literal claim **"Trusted by 2,400+ trade businesses"** (`client/src/pages/marketing/FreeAudit.tsx:736`, `client/src/components/marketing/TrustStrip.tsx:2`, `client/src/components/marketing/map-snapshot/MapSnapshotShell.tsx:964`). With the WeFixTrades full launch scheduled for **2026-07-15**, this number is fabricated.

`home.tsx` lines 13–14 already document removing `TrustMarquee` for being a "dishonest trust signal that would fail any 'google these companies' sniff test." That standard must be re-applied to this string. **Recommendation:** replace with an honest, defensible line (e.g. "Built for trades — used by our early-access beta") or remove the badge entirely until real numbers exist. Logged here, not patched inline, because it touches multiple files + needs Alex's call on the replacement phrasing.

---

## Per-page scorecard

| Page | Headline | First-screen clarity | Social proof | CTA hierarchy | Scannability | Trust signals | Mobile flow | **Avg** |
|---|---|---|---|---|---|---|---|---|
| `/` (home)                          | 4 | 4 | 2 | 5 | 4 | 3 | 4 | **3.7** |
| `/pricing`                          | 4 | 3 | 1 | 3 | 3 | 4 | 3 | **3.0** |
| `/products/tradeline`               | 4 | 4 | 2 | 3 | 4 | 3 | 4 | **3.4** |
| `/products/quickquotepro`           | 5 | 5 | 2 | 5 | 5 | 4 | 5 | **4.4** |
| `/free-audit`                       | 4 | 5 | 1\* | 5 | 4 | 3 | 4 | **3.7** |
| `/services`                         | 3 | 3 | 1 | 2 | 3 | 2 | 3 | **2.4** |
| `/products/socialsync`              | 2 | 3 | 1 | 2 | 3 | 2 | 4 | **2.4** |
| `/products/rankflow`                | 3 | 3 | 1 | 3 | 3 | 3 | 4 | **2.9** |

\* Score reflects fabricated "2,400+" claim — counted as zero credibility, not as a positive.

**Site average:** 3.2 / 5.

### Headline strength — per-page rationale

| Page | Current headline | Words | Verdict |
|---|---|---|---|
| `/` | "You're on the job. **WeFixTrades runs your office.**" | 8 | Strong; specific role contrast. |
| `/pricing` | "Simple, transparent pricing. **Built for trades.**" | 6 | Generic SaaS template. Says nothing only WFT can claim. |
| `/products/tradeline` | "24/7 TradeLine — Always-On Lead Handling" | 6 | Good. |
| `/products/quickquotepro` | "QuoteQuick — Instant quotes on your website. Qualified leads in your inbox." | 10 | Best on the site. Two outcomes in one sentence. |
| `/free-audit` | "Free Google Maps & Website Audit" | 6 | Clear, descriptive, but flat. No urgency, no outcome. |
| `/services` | "Growth services delivered, not DIY." | 5 | Reasonable but the "delivered, not DIY" tagline is the only differentiator and it's hidden as a half-line break. |
| `/products/socialsync` | "SocialSync — Done-For-You Social Media Posting" | 6 | Describes the activity, not the outcome. Customer doesn't want "posting" — they want trust / leads. |
| `/products/rankflow` | "RankFlow — Done-for-You Local SEO" | 5 | Same issue as SocialSync. Activity, not outcome. "Done-for-You" appears on 3+ pages — losing distinction. |

### First-screen clarity (<5 seconds)

- **`/`** — clear: hero says office is run, sub-promise lists what AI does, primary CTA "Start free". Hero email-capture lives in a second band so two competing actions don't fight. Good.
- **`/pricing`** — three-section structure (recommender quiz → decision frame → bundles) is sound but the H2 "What do you want help with?" sits at 15px (line 1476) which is barely a heading. The decision buttons (6 generic labels) carry the cognitive load instead of the heading.
- **`/products/tradeline`** — hero highlights are concrete (24/7 answering, instant estimates, missed-call text-back). Strong.
- **`/products/quickquotepro`** — hero highlights and "Live in 5 minutes" are the strongest CTA-supporting copy on the entire site.
- **`/free-audit`** — `Instant report · No signup · Takes ~30 seconds` strip is excellent. One of the few places friction is named and dismissed up front.
- **`/services`** — V7Hero with "Growth services delivered, not DIY" → grid of 10 service cards with generic `Request Info` buttons. The page is a list, not a sales surface. No filtering. No "what do I need" path. No outcomes per card — just feature descriptions.
- **`/products/socialsync`** — outcomes panel was 3 lines of pure fluff ("More trust / More calls / Better presence"). Fixed inline this audit — see below.
- **`/products/rankflow`** — `Try Free SEO Check` secondary CTA points to `/demos/rankflow` which is good; but primary CTA is generic "Get Started" → routes to wizard. No differentiated landing path.

### Social proof density

Across all 8 pages: **almost none.** The only social-proof artefacts found:
- `/free-audit` — "Trusted by 2,400+ trade businesses" badge (**fabricated**, see flag).
- `/` — `ReviewsSection` is lazy-loaded but I could not confirm whether it carries real or placeholder reviews without rendering the page. **Action item:** verify `ReviewsSection` contents are real-customer-sourced.
- Product pages (`products.ts`) — **zero testimonials embedded.** Each product page has a `visuals` array and a `faq` array but no `testimonials` field. `client/src/config/product-testimonials.ts` exists (722 lines) — it's loaded but not wired into the `EffortelProductPage` template (would require a verification pass; the type definition `ProductPage` in products.ts has no `testimonials` field).
- `/pricing` — no testimonials, no logos, no review counts. Only `RoiAnchor text="One booked job can cover this entire system."` — a value claim, not social proof.
- `/services` — zero. No logos, no testimonials, no review counts, no case studies.

### CTA hierarchy

- **`/`** — clean: primary "Start free", secondary "Watch demo". Then a separate band for "Get a free audit" email capture. One clear primary action.
- **`/pricing`** — three primary actions compete: recommender quiz, decision frame, bundle "Get Started" buttons. By the time the user reaches the actual bundle cards (section 3 of 5) they have been asked to make ≥3 micro-commitments. Final CTA section offers "Start with Growth" + "Try one tool" — but by then the user has scrolled past the entire services grid.
- **`/products/tradeline`** — primary "Get Started" → `/pricing` (off-product) and secondary "See It in Action" → `/demo`. Sending the primary CTA to pricing creates a 2-step funnel for a customer who is already convinced.
- **`/products/quickquotepro`** — primary "Start Free — 14 Days, No Card" → `/Wizard` (on-product, friction-free) and secondary "Try a Live Demo". Best CTA pair on the site.
- **`/free-audit`** — single input box, single action. Perfect.
- **`/services`** — every card has a `Request Info` button. 10 cards = 10 identical CTAs. No primary. No ranking by margin or popularity. The form at the bottom is the real conversion path but visually equal-weighted with the grid.
- **`/products/socialsync`** — primary "Start SocialSync" + secondary "Try Free Demo". `comingSoon: true` flag should change CTA to a waitlist signup (it does, via template), but the primary still says "Start" which is misleading when the actual destination is a waitlist.
- **`/products/rankflow`** — same generic "Get Started" → wizard. No category-specific entry.

### Trust signals

Site-wide trust signals exist but are unevenly applied:
- ✓ `IntegrationsTrustStrip` (home) — likely legitimate (vendor logos).
- ✓ Cancel-anytime / no-contracts callouts on most product pages.
- ✓ Money-back / guarantee language is absent — `/pricing` says "Cancel any month" but no satisfaction guarantee, no refund policy mention.
- ✗ No security/SOC badges (would be premature pre-launch).
- ✗ No real-photo founder/team imagery anywhere I could see.
- ✗ Contact info: `/services` form, but no phone number, no address, no live-chat trust line.
- ✗ The "Trusted by 2,400+" fabrication actively erodes the rest of the trust surface.

### Mobile reading flow

- Paragraphs are short (max 2 sentences typical). Good.
- Hero on home compresses cleanly via `.hero-grid` → 1-col under 960px and CTA-row stacks nowrap with `flex: 1` on each button (line 338–355). Good.
- `/pricing` decision grid is `repeat(3, 1fr)` on desktop (line 1479) — on mobile this stays the same. 6 buttons in a 3-col grid on a 360px screen = ~110px per button → tight but usable.
- `/services` 300px-min auto-fit grid is fine, but stacking 10 cards on mobile is a long scroll with no nav anchor / no "jump to category".
- Product pages render via `EffortelProductPage.tsx` (1603 lines) — extensive responsive logic; assumed mobile-OK based on file size and visual-audit screenshots already in `docs/operations/visual-audit-screenshots`.

---

## Top 15 specific copy improvements (before → after)

### 1. Home hero subhead — verb pile-up

**Before** (`client/src/pages/marketing/home.tsx:854`)
> AI answers calls 24/7, sends quotes in seconds, requests reviews, and fixes your Google ranking. Built for trades. Working while you work.

**After**
> Your AI office handles every call, sends instant quotes, chases reviews, and lifts your Google ranking — so you stay on the tools.

Reason: "Working while you work" doubles back on "On the job" headline. Replace with the customer's actual benefit (stay on the tools = make money). Strips weak "Built for trades" trailer because the cycling Built-For chip already says it.

### 2. Pricing H1 — generic SaaS

**Before** (`client/src/pages/PricingUnified.tsx:1461`)
> Simple, transparent pricing. **Built for trades.**

**After**
> One job pays for the system. **Pick what you need — cancel any month.**

Reason: Anchors the price decision to the ROI primitive that is repeated below ("One booked job can cover this entire system"). Lands the no-lock-in promise in the H1 instead of in the eyebrow.

### 3. Pricing decision frame heading

**Before** (line 1476–1478, 15px font)
> What do you want help with?

**After**
> Tell us your bottleneck — we'll route you to the right system.

Plus: raise to 18–20px to match a section heading (currently 15px reads as body copy and the buttons below carry the whole hierarchy).

### 4. Pricing final-CTA fork

**Before** (line 1640)
> Still not sure?

**After**
> Start with the system that pays for itself fastest. Or pick one tool.

Reason: "Still not sure?" plants the doubt. Re-frame the same fork as a positive decision.

### 5. Services H1 — break the 3-page repeat of "Done-For-You"

**Before** (`client/src/pages/marketing/services.tsx:347–352`)
> **Done-For-You Services** / You handle the trade. We handle the rest. / **Growth services delivered, not DIY.**

**After**
> **Real humans, not a dashboard.** / You handle the trade. We install, run, and report on every tool. / Fixed monthly fees. No agency retainer drama.

Reason: SocialSync, RankFlow, AdFlow, MapGuard, ContentFlow all use "Done-for-You" in their taglines. This page needs to differentiate the *agency* promise from the *product* promise. Lead with the human.

### 6. Services contact form CTA

**Before** (`client/src/pages/marketing/services.tsx:381`)
> Get in Touch

**After**
> Tell us your top bottleneck — we'll send a 1-page plan.

Reason: "Get in Touch" is the lowest-conversion form heading on the internet. The customer wants something specific in return for their email.

### 7. SocialSync tagline (slug owner)

**Before** (`client/src/config/products.ts:311`)
> Done-For-You Social Media Posting

**After**
> Stay on customers' feeds without thinking about it

Reason: "Done-For-You Social Media Posting" is the activity. "Stay on feeds" is the outcome the trade owner buys. Also dodges the "Done-for-You" repetition on every growth product.

### 8. SocialSync highlights — first bullet

**Before** (`client/src/config/products.ts:321`)
> Stay visible online without thinking about it

**After**
> Posts go out every week without you opening Facebook once

Reason: Specific. Names the trigger ("every week"), names the action avoided ("opening Facebook").

### 9. SocialSync outcomes — SHIPPED INLINE

The three outcomes were generic fluff ("More trust / More calls / Better presence"). Replaced inline with three concrete, customer-vocabulary outcomes (see Inline Fixes section below).

### 10. RankFlow tagline

**Before** (`client/src/config/products.ts:407`)
> Done-for-You Local SEO

**After**
> Climb Google's local results — every month, on a schedule

Reason: Names the place ("local results"), the cadence ("every month"), and removes the redundant "Done-for-You".

### 11. RankFlow "Better local visibility" outcome

**Before** (`client/src/config/products.ts:422`)
> { title: "Better local visibility", desc: "Show up when customers in your area search for your services." }

**After**
> { title: "Rank in the 3-Pack, not page 2", desc: "We target the Map Pack and the top-3 organic spots for the searches that actually book jobs in your area." }

Reason: Specific Google surface (3-Pack), specific contrast (page 2), customer-vocabulary ("book jobs").

### 12. RankFlow "Do you guarantee rankings?" FAQ

**Before** (`client/src/config/products.ts:441`)
> No honest SEO provider can guarantee specific rankings. What we guarantee is consistent, trackable work every month that improves your local visibility over time.

**After**
> No. Anyone guaranteeing #1 rankings is lying — Google changes its algorithm hundreds of times a year. What we *do* guarantee: every month you'll see exactly what we shipped, what moved, and what's next. If a month's report is empty, you don't pay for it.

Reason: The current copy is defensive. Re-frame as a positive guarantee (the *work*, not the ranking) plus a refund-equivalent commitment that no competitor will match.

### 13. FreeAudit fabricated trust badge — **DO NOT keep as-is**

**Before** (`client/src/pages/marketing/FreeAudit.tsx:736`)
> Trusted by 2,400+ trade businesses

**Recommended replacement** (pending Alex sign-off):
> ★★★★★ Built for plumbers, electricians, HVAC, roofers, and cleaners

Reason: Removes the fabricated number. Keeps the visual weight of the badge. Names the actual ICP. Not patched inline because the same string appears in 2 other files (`TrustStrip.tsx:2`, `MapSnapshotShell.tsx:964`) and needs a coordinated removal.

### 14. TradeLine primary CTA destination

**Before** (`client/src/config/products.ts:77`)
> { label: "Get Started", href: "/pricing" }

**After**
> { label: "Get TradeLine — Free 14 Days", href: "/Wizard?product=tradeline" }

Reason: QuoteQuick converts users directly into the wizard; TradeLine bounces them to pricing. A user reading the TradeLine page is committed to TradeLine, not shopping. Mirror the QuoteQuick funnel.

### 15. SiteLaunch secondary CTA — broken-shaped jump link

**Before** (`client/src/config/products.ts:268–269`)
> primaryCTA: { label: "Get Your Website Built", href: "#pricing" }
> secondaryCTA: { label: "See What's Included", href: "#pricing" }

**After**
> primaryCTA: { label: "Get Your Website Built", href: "/Wizard?product=sitelaunch" }
> secondaryCTA: { label: "See What's Included", href: "#sitelaunch-included" }

Reason: Both CTAs currently scroll to the same anchor (`#pricing`). Primary should commit (wizard). Secondary should genuinely show inclusions section (which needs a matching id).

---

## Inline fixes shipped this audit

1. **SocialSync outcomes** (`client/src/config/products.ts:328–332`) — replaced 3 generic outcome lines ("More trust / More calls / Better presence") with three specific, customer-vocabulary outcomes naming the customer behaviour ("pick the business with recent posts"), the retention mechanism ("top-of-mind"), and the zero-effort promise ("approve in one tap or autopilot").

The remaining 14 improvements above are documented for a follow-up PR — many touch multiple files (the fabricated trust badge), depend on routing changes (CTA hrefs to wizard with product params), or need Alex's brand-tone call (the "1-page plan" form ask, the guarantee language).

---

## Strategic recommendations (cross-page)

1. **Wire `client/src/config/product-testimonials.ts` into `EffortelProductPage.tsx`.** The data exists (722 lines) but the `ProductPage` type in `products.ts` has no `testimonials` field. This is the single highest-leverage social-proof intervention — testimonials on every product page in one wave.

2. **Audit every fabricated stat before launch.** The "2,400+" string appears in 3 files. Grep for other unbacked numbers — `client/src/components/marketing/showcase/ProactiveStats.tsx` was flagged in this audit as a suspect.

3. **Differentiate the "Done-for-You" family.** SocialSync, RankFlow, AdFlow, MapGuard, ContentFlow, WebCare all use this phrase. The Services hub page also leans on it. Each needs a distinct verb (Stay-on-feeds / Climb-results / Drive-spend / Lock-the-map / Feed-channels / Keep-running).

4. **Pricing page funnel re-think.** Three micro-decisions before the bundle cards (quiz, decision frame, bundle grid) is too many gates. Either move the quiz to a dismissible modal triggered by a "Help me choose" CTA, or merge the decision-frame buttons into the bundle cards as "Best for: X" pills.

5. **Services page needs a primary action.** 10 identical `Request Info` buttons + a contact form at the bottom = no funnel. Either turn the page into a styled directory (with each card linking to its product page) or pick one service per category as the primary recommendation and visually rank.

6. **Real photos.** Zero founder/team/customer photos found in the marketing surface. Pre-launch, one founder photo with name + role on the home `TrustSection` would do more for trust than any badge.
