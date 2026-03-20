# Interactive Globe Section — Design & Implementation Plan

## A. Selected Concept + Reasoning

### Concept: **"Live Results Map" — Real business outcomes pinned to real locations**

**Why this wins over the alternatives:**

| Concept considered | Verdict |
|---|---|
| Local visibility map | Too abstract — "visibility" doesn't trigger action |
| Missed calls recovery map | Too negative — leads with pain, not aspiration |
| AI assistant activity map | Too technical — customers don't care about AI, they care about results |
| Ranking improvement map | Too narrow — only covers one service |
| **Hybrid: Live Results Map** | **Winner — shows diverse, tangible outcomes across multiple services** |

**The "Live Results Map" works because:**

1. **Social proof at scale** — Shows results happening across many businesses, not just one testimonial
2. **Covers all services naturally** — A plumber in Denver got more calls, a cleaner in Austin got better rankings, a roofer in Tampa got leads recovered. Each card can showcase a different service outcome
3. **Creates urgency** — "Results are happening right now for businesses like yours. You're not in yet."
4. **Simple to understand** — No technical explanation needed. A dot on a map + a result = instant comprehension
5. **Conversion-ready** — Naturally leads to "Want results like these? Get started"

**Emotional arc:** Visitor sees the globe → notices results popping up in real cities → recognizes their own industry → thinks "I want that too" → clicks CTA.

---

## B. What Appears on the Globe

### Marker Strategy

**8 markers** — enough to feel active, few enough to stay readable.

Each marker represents a **real-seeming business result in a specific city**. Not actual client data (for MVP), but realistic outcome snapshots that rotate through.

### Marker Definitions

| # | City | Trade | Card Text | Service Showcased |
|---|------|-------|-----------|-------------------|
| 1 | Denver, CO | Plumber | **+42% more calls this month** | Google Maps optimization |
| 2 | Austin, TX | Cleaner | **#8 → #2 on Google Maps** | Local SEO / MapGuard |
| 3 | Tampa, FL | Roofer | **AI handled 19 missed calls** | AI Voice Assistant |
| 4 | Chicago, IL | Electrician | **67 instant quotes this week** | QuoteQuick Pro |
| 5 | Phoenix, AZ | HVAC | **3x more leads in 30 days** | Lead capture automation |
| 6 | Atlanta, GA | Plumber | **$4,200 in deposits collected** | Booking + deposits |
| 7 | Seattle, WA | Painter | **14 new 5-star reviews** | Reputation management |
| 8 | Miami, FL | Cleaner | **Booked 31 jobs on autopilot** | Full automation suite |

### Card Design Rules

- **Max 6 words** in the primary stat line
- **City + trade** shown as subtle label below
- Cards appear one at a time with staggered timing
- Each card is visible for ~4 seconds, then fades and another appears
- Max **3 cards visible simultaneously** to avoid clutter
- Cards are DOM elements (not canvas-rendered) for easy styling and accessibility

### Marker Coordinates (lat/lng)

```
Denver:    [39.74, -104.99]
Austin:    [30.27, -97.74]
Tampa:     [27.95, -82.46]
Chicago:   [41.88, -87.63]
Phoenix:   [33.45, -112.07]
Atlanta:   [33.75, -84.39]
Seattle:   [47.61, -122.33]
Miami:     [25.76, -80.19]
```

---

## C. Section Layout

### Desktop (≥1024px)

```
┌─────────────────────────────────────────────────┐
│  [dark background, full-width section]          │
│                                                 │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │              │  │                        │   │
│  │  HEADLINE    │  │     ◉ +42% calls       │   │
│  │  subheadline │  │        ╱               │   │
│  │              │  │   🌐 GLOBE             │   │
│  │  • stat 1    │  │        ╲               │   │
│  │  • stat 2    │  │     ◉ #8→#2 Maps       │   │
│  │  • stat 3    │  │                        │   │
│  │              │  │                        │   │
│  │  [CTA BTN]   │  └────────────────────────┘   │
│  └──────────────┘                               │
│                                                 │
└─────────────────────────────────────────────────┘
```

- **Left column (40%):** Headline, subheadline, 3 quick stats, CTA button
- **Right column (60%):** Globe with floating card overlays
- **Globe size:** ~480px diameter on desktop
- **Section min-height:** 640px
- **Max-width container:** 1200px, centered

### Tablet (768px–1023px)

- Same two-column layout but tighter
- Globe shrinks to ~360px
- Cards reduce to 2 visible max
- Text column narrows

### Mobile (<768px)

```
┌───────────────────────┐
│  HEADLINE             │
│  subheadline          │
│                       │
│  ┌─────────────────┐  │
│  │                 │  │
│  │   🌐 GLOBE     │  │
│  │   (centered)    │  │
│  │                 │  │
│  └─────────────────┘  │
│                       │
│  • stat 1             │
│  • stat 2             │
│  • stat 3             │
│                       │
│  [CTA BUTTON]         │
└───────────────────────┘
```

- Stacked: headline → globe → stats → CTA
- Globe: 300px max, centered
- Cards: 1 visible at a time, simpler layout
- Globe auto-rotates but drag is disabled on mobile (MVP)

---

## D. Copy

### Headline

> **Results happening right now**

### Subheadline

> Trades businesses across the country are getting more calls, more bookings, and better rankings — automatically.

### Quick Stats (left column, desktop)

- **2,400+** quotes generated this month
- **96%** of calls answered by AI
- **4.8★** average review score

### CTA Button

> **See what we can do for you →**

### Globe Cards (8 total, cycling)

| Card | Primary Line | Label |
|------|-------------|-------|
| 1 | **+42% more calls this month** | Denver, CO · Plumber |
| 2 | **#8 → #2 on Google Maps** | Austin, TX · Cleaner |
| 3 | **AI handled 19 missed calls** | Tampa, FL · Roofer |
| 4 | **67 instant quotes this week** | Chicago, IL · Electrician |
| 5 | **3x more leads in 30 days** | Phoenix, AZ · HVAC |
| 6 | **$4,200 in deposits collected** | Atlanta, GA · Plumber |
| 7 | **14 new 5-star reviews** | Seattle, WA · Painter |
| 8 | **31 jobs booked on autopilot** | Miami, FL · Cleaner |

---

## E. MVP / V2 / V3 Plan

### MVP — Ship in 1 session

| Feature | Details |
|---------|---------|
| COBE globe | Dark theme, dotted landmass, auto-rotation |
| 8 static markers | Hardcoded lat/lng + card data |
| Card cycling | 3 visible at once, fade in/out on timer (4s intervals) |
| Left/right layout | Text left, globe right on desktop |
| Mobile stack | Globe centered, cards below |
| CTA button | Links to /Wizard or /plans |
| IntersectionObserver | Pause rendering when off-screen |
| No drag interaction | Auto-rotation only |
| No WebSocket | All data is static/hardcoded |

**What MVP skips:** drag, real data, personalization, arcs, mobile cards on globe, complex animations.

### V2 — Polish pass

| Feature | Details |
|---------|---------|
| Drag interaction | Pointer events + spring physics for desktop |
| Arcs | Animated lines connecting markers (shows "network" feel) |
| Smarter card positioning | CSS anchor positioning (COBE v2) so cards track globe rotation |
| Scroll-triggered entrance | Section fades in with globe spin-up animation |
| Better mobile cards | Horizontal scroll strip of result cards below globe |
| Performance tuning | Adaptive DPR, reduced mapSamples on mobile |

### V3 — Advanced

| Feature | Details |
|---------|---------|
| Geo-personalized | Detect visitor's approximate location, start globe rotation there |
| Dynamic markers | Pull from real anonymized client metrics |
| Industry filter | "Show results for: Plumbers / HVAC / Cleaners" toggle |
| Micro-interactions | Hover on marker expands card, click opens case study |
| A/B tested CTAs | Different CTA per visitor segment |

---

## F. Tech Stack

### Core

```
cobe              — globe rendering (5kB, zero deps)
react             — already in project
DOM overlays      — cards as positioned HTML elements
IntersectionObserver — native browser API for pause/resume
```

### Component Structure

```
src/components/marketing/
  GlobeSection.tsx        — main section (layout, copy, CTA)
  GlobeCanvas.tsx         — COBE globe wrapper (canvas + rendering)
  GlobeCard.tsx           — individual floating result card
  globeData.ts            — marker definitions (static array)
```

### How Markers Are Stored

```ts
// globeData.ts
export const GLOBE_MARKERS = [
  {
    id: "denver-plumber",
    location: [39.74, -104.99] as [number, number],
    stat: "+42% more calls this month",
    label: "Denver, CO · Plumber",
    size: 0.06,
  },
  // ... 7 more
];
```

### How Cards Are Rendered

Cards are **absolutely positioned DOM elements** outside the canvas. In MVP, they use fixed positions relative to the globe container (not CSS anchor positioning — that's V2).

```
<div style={{ position: "relative" }}>
  <canvas />                    ← COBE renders here
  <GlobeCard position="top-right" />    ← DOM overlay
  <GlobeCard position="bottom-left" />  ← DOM overlay
  <GlobeCard position="right" />        ← DOM overlay
</div>
```

Cards cycle on a `setInterval` (4 seconds), with CSS opacity transitions for fade in/out.

### How Auto-Rotation Works

```ts
// Inside useEffect
let phi = 3.5; // Start facing North America
const globe = createGlobe(canvas, {
  // ...options
  onRender: (state) => {
    state.phi = phi;
    phi += 0.003; // Slow, elegant rotation
    state.markers = markers;
  },
});
```

- `phi` starts at ~3.5 radians to face North America on load (where our markers are)
- Increment `0.003` per frame = one full rotation every ~35 seconds
- `theta: -0.15` gives slight downward tilt (shows US geography well)

### Drag: Not in MVP

Drag adds ~40 lines of pointer event handling + spring physics. Deferred to V2.

---

## G. Performance & UX Rules

### Rendering

| Rule | Implementation |
|------|---------------|
| **Pause when off-screen** | `IntersectionObserver` calls `globe.toggle()` |
| **Adaptive DPR** | `Math.min(window.devicePixelRatio, 2)` on desktop, cap at `1` on mobile |
| **Reduced mobile quality** | `mapSamples: 10000` on mobile vs `16000` on desktop |
| **Canvas sizing** | Desktop: 480×480, Tablet: 360×360, Mobile: 300×300 |
| **No resize listener spam** | Debounce resize handler, or use fixed breakpoint sizes |

### Card Limits

| Rule | Value |
|------|-------|
| Max visible cards | 3 on desktop, 1 on mobile |
| Card cycle interval | 4 seconds |
| Fade transition | 0.5s CSS opacity |
| Max total markers | 8 (MVP), 12 (V2 max) |
| Card text max | 6 words primary line |

### UX Rules

| Rule | Why |
|------|-----|
| Globe must NOT be the first thing that renders | It should appear after hero — not compete with it |
| Globe section should lazy-load | Don't initialize COBE until section is near viewport |
| Cards must be readable without interacting | Auto-cycling means passive visitors still see value |
| CTA must be visible without scrolling past the globe | On desktop, CTA is in the left column alongside the globe |
| Mobile: globe is decorative, cards carry the message | On small screens, reduce globe prominence, emphasize results |

---

## H. Implementation Plan

### Phase 1 — Basic Globe (estimated: 30 min)

1. Install `cobe` dependency
2. Create `GlobeCanvas.tsx`:
   - Set up canvas ref
   - Initialize `createGlobe` with dark theme config
   - Auto-rotation starting at North America
   - `IntersectionObserver` to pause/resume
   - Cleanup on unmount (`globe.destroy()`)
3. Create `GlobeSection.tsx`:
   - Two-column layout (text left, globe right)
   - Headline + subheadline + CTA
   - Mobile stacked layout
4. Add section to homepage after existing sections
5. Verify no horizontal overflow, no layout shifts

### Phase 2 — Markers + Cards (estimated: 45 min)

1. Create `globeData.ts` with 8 marker definitions
2. Pass markers to COBE via `onRender` callback
3. Create `GlobeCard.tsx`:
   - Glassmorphism card (dark, blurred background, subtle border)
   - Stat line (bold, white) + label line (muted, small)
   - Fade in/out via CSS opacity transition
4. Implement card cycling logic:
   - `setInterval` every 4 seconds
   - Rotate through markers, show 3 at a time (desktop), 1 (mobile)
   - Cards positioned at fixed offsets: top-right, right, bottom-right
5. Add the 3 quick stats to the left column
6. Test mobile layout

### Phase 3 — Polish (estimated: 30 min)

1. Entrance animation: section fades in when scrolled to
2. Globe spin-up: starts slow, accelerates to cruise speed
3. Card micro-polish: subtle scale on appear, smooth fade
4. Verify performance:
   - Check FPS on mobile device
   - Confirm IntersectionObserver pauses correctly
   - Verify no memory leaks on navigation
5. Dark section background blending with surrounding sections
6. Final responsive QA across breakpoints

---

## Summary

This globe section transforms a decorative visual into a **conversion tool**. Every element serves the sales narrative:

- **Globe** = "We operate everywhere"
- **Markers** = "Real businesses, real results"
- **Cards** = "Here's proof — look at these numbers"
- **CTA** = "Your turn"

The MVP is achievable in a single session using COBE (5kB), hardcoded marker data, and simple DOM overlay cards. No WebSockets, no Three.js, no overengineering.
