# Product demo simulations — agent task spec

> **Status:** Spec only. Not implemented yet.
> **Owner:** any agent with frontend context.
> **Master template:** `client/src/pages/products/tradeline-variants/v6-ultimate.tsx`

## Why this exists

Every product page must have an **animated demo simulation in the hero section** so a visitor understands what the product does in under 5 seconds — without reading a word.

The master template (V6) reserves a `<DemoSlot>` component as the swap point. Each product gets its own animated simulation component that drops into that slot. The TradeLine page already has a static placeholder (`ChatMockup`) — that becomes the reference for how complex/polished each animation should be.

## Conventions

- **Location:** `client/src/components/product-demos/<slug>/HeroDemo.tsx`
- **Wrapper:** every demo lives inside the product's `<DemoSlot>`, which keeps spacing and gradient glow consistent
- **Tech:** use `framer-motion` (already a dependency). No new packages.
- **Loop:** the animation should loop every 8–14 seconds. Never use a stop state — always restart from the top.
- **Pause on hover:** so users can read it
- **Reduced motion:** respect `prefers-reduced-motion` — if set, render the static end state (the most "wow" frame)
- **Performance:** target < 5% CPU on a mid-tier laptop. No 60fps particle systems.
- **Mobile:** must scale; on < 640px, render the static end state (no animation) for performance
- **Accessibility:** wrap in `<div role="img" aria-label="...">` describing the demo

## The 12 product demos

For each product the **hero demo** is the primary animated visual. A **secondary visual** (used in the "dashboard" / mid-page slot of V6) is also listed where it strengthens the story.

### 1. TradeLine — `/products/tradeline`
- **Hero demo:** chat bubbles type in one at a time. Customer asks → AI replies → AI quotes → "✓ Booked — Tech ETA 41 min" appears at the end. ~9s loop.
- **Secondary:** dashboard mockup with new lead row sliding in from the top of the sidebar every cycle.
- **Reference (static):** `client/src/pages/products/tradeline-variants/v6-ultimate.tsx` `ChatMockup`/`DashboardMockup`

### 2. QuoteQuick Pro — `/products/quickquotepro`
- **Hero demo:** animated quote calculator. Trade type cycles (Plumbing → HVAC → Electrical), then sliders move on their own (square footage, rooms, urgency), price ticks up: `$0` → `$340` → `$420 ✓ Quote ready`. End state: "Lead captured" toast. ~10s loop.
- **Secondary:** lead inbox with new rows appearing as quotes are submitted.

### 3. MapGuard — `/products/mapguard`
- **Hero demo:** animated Google-Maps-style map of a city. Three pins drop in. Each pin animates from a "?" status to a green check as the AI fixes profile issues. Counter at the corner: "12 issues found → 8 fixed → 4 escalated". ~12s loop.
- **Secondary:** before/after profile health score climbing 62 → 89.
- **Note:** there's already a static `MapMockup.tsx` in `pages/products/mapguard/` — extend it.

### 4. ReputationShield — `/products/reputationshield`
- **Hero demo:** review feed scrolling up. New 5-star review appears → AI types a reply ("Thank you, Sarah! ...") → reply posts. Occasionally a 1-star comes in and gets escalated to "needs human review" badge. ~11s loop.
- **Secondary:** rating average meter: 4.2 → 4.7 over 30 days.

### 5. SocialSync — `/products/socialsync`
- **Hero demo:** content calendar grid. Posts appear in slots ("Mon 9am: tip post ✓ scheduled", "Wed 12pm: case study ✓ posted", etc.). One post simultaneously publishes to Facebook + Instagram + Google with platform icons fading in. ~10s loop.
- **Secondary:** post performance dashboard — engagement bar growing.

### 6. RankFlow — `/products/rankflow`
- **Hero demo:** an SEO rank chart climbing. Three keywords ("emergency plumber austin", "drain cleaning 78704", "water heater repair") rise from page 4 → page 1 over the loop. Position numbers tick down (47 → 12 → 3 → 1). ~12s loop.
- **Secondary:** organic traffic chart climbing month-over-month.

### 7. ContentFlow — `/products/contentflow`
- **Hero demo:** a blog post drafts itself — title types out, then paragraph 1 streams in (ChatGPT-style typing), then "✓ Published to your site" appears. Distribution badges follow ("→ shared on Facebook · LinkedIn · email"). ~12s loop.
- **Secondary:** content calendar with weekly drumbeat of posts.

### 8. AdFlow — `/products/adflow`
- **Hero demo:** Google Ads dashboard. Daily spend goes up, conversions go up faster (so cost-per-lead drops). Numbers tick: "$42/lead → $28/lead → $19/lead". A campaign card flashes "✓ optimized by AI". ~10s loop.
- **Secondary:** before/after monthly results.

### 9. BookFlow — `/products/bookflow`
- **Hero demo:** calendar view. Customer picks a date → time slot fills → "✓ Booked — confirmation sent". Then a second booking. Then an "auto-rescheduled" event when a conflict is detected. ~11s loop.
- **Secondary:** dispatch view — today's jobs on a mobile-style timeline.

### 10. WebCare — `/products/webcare`
- **Hero demo:** uptime monitor with dots filling in green every check. Plugin update notification appears → "✓ Auto-updated". Backup runs in the background (progress bar). ~10s loop.
- **Secondary:** monthly health report card.

### 11. WebFix — `/products/webfix`
- **Hero demo:** Lighthouse-style score gauge. Performance score climbs 42 → 89. Below it, "Issues found: 23 → 4". ~9s loop.
- **Secondary:** before/after PageSpeed mobile result side by side.

### 12. SiteLaunch — `/products/sitelaunch`
- **Hero demo:** a wireframe morphs into a styled page. Hero block fills with imagery, text appears, button styles apply. Final frame: live URL with "✓ Launched" badge. ~12s loop.
- **Secondary:** template gallery — three cards swapping styles.

## Wiring it in

When an agent implements a demo:

1. Create `client/src/components/product-demos/<slug>/HeroDemo.tsx`
2. In the product's page (currently `ProductPage.tsx`, eventually each product gets its own page based on V6), import the demo and replace the static placeholder
3. Verify it loops, pauses on hover, respects reduced motion, scales to mobile
4. Add a screenshot to `docs/product-demos/<slug>.png` (still frame from the most "wow" point)
5. Run `npm run check` — zero new TS errors

## Why animated, not video

- File size: a 12-second MP4 at decent quality is 2–6 MB; a CSS/JS animation is < 30 KB
- LCP/CLS friendly: no video decode, no layout shift
- A/B testable: easy to swap a single piece of copy without re-rendering a video
- No CDN dependency: works on Replit without hitting external hosting

## Out of scope

- Voice playback (use Vapi sample only on `/demo`)
- 3D / WebGL (Lottie or Rive could be considered later)
- Per-tier customization — these are marketing pages, one demo per product
