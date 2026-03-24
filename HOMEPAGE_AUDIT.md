# Homepage UI Consistency Audit

**File:** `client/src/pages/marketing/home.tsx`
**Date:** 2026-03-24
**Auditor:** Automated UI Consistency Audit

---

## STEP 1 — Homepage Location

**File:** `client/src/pages/marketing/home.tsx`
**Route:** `/` (root path)

---

## STEP 2 — Section Components

| # | Component | File Path | Purpose |
|---|-----------|-----------|---------|
| 1 | MarketingLayout | `client/src/components/marketing/MarketingLayout.tsx` | Page wrapper (nav + footer) |
| 2 | HeroGridGlow | `client/src/components/marketing/HeroGridGlow.tsx` | Animated grid background overlay |
| 3 | BuiltForRotator | `client/src/components/marketing/BuiltForRotator.tsx` | Trade-type text rotator (hero badge) |
| 4 | Hero Section | Inline in `home.tsx` (lines 343–571) | Hero headline, subtext, CTAs |
| 5 | TrustMarquee | `client/src/components/marketing/TrustMarquee.tsx` | Logo marquee strip |
| 6 | HeroTradeDivider | `client/src/components/marketing/HeroTradeDivider.tsx` | Scrolling trade-name divider |
| 7 | CapabilitiesShowcase | `client/src/components/marketing/CapabilitiesShowcase.tsx` | Tabbed BSS/OSS showcase |
| 8 | StickyStackCards | `client/src/components/marketing/StickyStackCards.tsx` | Scroll-triggered stacking cards |
| 9 | PillarAnimation | `client/src/components/sections/PillarAnimation.tsx` | Tabbed product pillars |
| 10 | FeatureCards | `client/src/components/marketing/FeatureCards.tsx` | Alternating feature card pairs |
| 11 | GlobeSection | `client/src/components/marketing/globe/GlobeSection.tsx` | Interactive 3D globe |
| 12 | SurfaceSection + ReviewsSection | `client/src/components/marketing/SurfaceSection.tsx` + `client/src/components/home/ReviewsSection.tsx` | Customer reviews grid (wrapped) |
| 13 | Workflow Section | Inline in `home.tsx` (lines 588–602) | Workflow demo with WorkflowDemo component |
| 14 | AutomationDiagram | `client/src/components/marketing/AutomationDiagram.tsx` | ReactFlow automation diagram |
| 15 | TrustSection | `client/src/components/marketing/TrustSection.tsx` | Trust stats (light background) |
| 16 | CTASection | `client/src/components/marketing/CTASection.tsx` | Final call-to-action |

---

## STEP 3 — Detailed Section Audit

### 1. Hero Shell Backdrop (outer wrapper)
| Property | Value |
|----------|-------|
| **Background** | `mkt.bg` → `#181D1F` (token) |
| **Padding** | `16px 16px 0` (desktop), `10px 8px 0` (≤768px), `8px 6px 0` (≤430px) |
| **Border Radius** | None (outer wrapper) |
| **Max Width** | None (full width) |

### 2. Hero First-Screen Zone (inner shell)
| Property | Value |
|----------|-------|
| **Background** | `mkt.surface` → `colors.effortel.n700` → `#394247` (token) |
| **Border Radius** | `24px` (desktop), `20px` (≤768px), `18px` (≤430px) |
| **Border** | `1px solid rgba(255,255,255,0.06)` (hardcoded) |
| **Box Shadow** | `0 20px 60px rgba(0,0,0,0.25), 0 4px 20px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04)` (hardcoded) |
| **Min Height** | `640px` → `720px` (≥768px) → `calc(100svh - 150px)` (≤1024px) → `calc(100svh - 130px)` (≤640px) → `calc(100svh - 72px)` (≤430px) |
| **Responsive** | Yes — multiple breakpoints |

### 3. Hero Section (content)
| Property | Value |
|----------|-------|
| **Background** | `transparent` |
| **Padding** | `132px 28px 56px` (desktop), `110px 20px 40px` (≤768px), `105px 18px 32px` (≤640px) |
| **Max Width** | Content: `720px` (inner div, centered) |
| **Gap** | CTA row: `12px` gap |
| **Responsive** | Yes — font sizes use `clamp()`, pills use grid reflow at 640px |

### 4. TrustMarquee
| Property | Value |
|----------|-------|
| **Background** | None (inherits from hero zone) |
| **Padding** | `paddingTop: 8px`, `paddingBottom: 10px` |
| **Border Radius** | None |
| **Max Width** | Full width |
| **Responsive** | Mask-image for edge fade, no explicit breakpoints |

### 5. HeroTradeDivider
| Property | Value |
|----------|-------|
| **Background** | `linear-gradient(to bottom, #181D1F 0%, #2B3840 35%, #56656E 65%, #A7B6BF 100%)` (hardcoded gradient) |
| **Height** | `72px` fixed |
| **Padding** | `6px` top/bottom |
| **Border Radius** | None |
| **Max Width** | Full width |
| **Responsive** | Font size uses `clamp(11px, 1.4vw, 15px)` |

### 6. CapabilitiesShowcase
| Property | Value |
|----------|-------|
| **Background** | `#A7B6BF` (**hardcoded**) |
| **Padding** | Desktop: `112px 28px 88px`, Mobile: `60px 16px 72px` |
| **Border Radius** | `28px 28px 0 0` (top corners only) |
| **Margin Top** | `-28px` (overlap pattern) |
| **Max Width** | Inner: `960px` (centered) |
| **z-index** | `1` |
| **Responsive** | Yes — accordion on mobile (<768px), horizontal on desktop |

### 7. StickyStackCards
| Property | Value |
|----------|-------|
| **Background** | `#e4edf1` (**hardcoded** as `BG` constant, matches `colors.effortel.n200`) |
| **Padding** | Desktop: `128px 28px 160px`, Mobile: `72px 16px 80px` |
| **Border Radius** | `28px 28px 0 0` (top corners only) |
| **Margin Top** | `-28px` (overlap pattern) |
| **Max Width** | Inner: `1120px` (centered) |
| **z-index** | `2` |
| **Card Radius** | `24px` (outer), `22px` (inner visual) |
| **Card Gap** | Desktop: `192px`, Mobile: `32px` |
| **Responsive** | Yes — sticky disabled on mobile, column layout |

### 8. PillarAnimation
| Property | Value |
|----------|-------|
| **Background** | `#0d1514` (**hardcoded**) |
| **Padding** | `80px 24px` (all screens) |
| **Border Radius** | None (section level) |
| **Margin Top** | None (no overlap) |
| **Max Width** | Inner: `900px` (centered) |
| **Card Background** | `#92a6b0` (**hardcoded**, close to `colors.effortel.n500`) |
| **Inner Card Bg** | `#b1c5ce` (**hardcoded**, matches `colors.effortel.n400`) |
| **Card Radius** | Top: `20px 20px 0 0`, Bottom: `0 0 20px 20px`, Inner: `14px` |
| **Responsive** | Tabs: 4 cols → 2 cols at ≤768px |

### 9. FeatureCards
| Property | Value |
|----------|-------|
| **Background** | `#22282A` (**hardcoded**, matches `colors.effortel.n800`) |
| **Padding** | Desktop: `120px 28px 200px`, Tablet: `90px 20px 140px`, Mobile: `72px 16px 100px` |
| **Border Radius** | `28px 28px 0 0` (top corners only) |
| **Margin Top** | `-28px` (overlap pattern) |
| **Max Width** | Inner: `1100px` (centered) |
| **z-index** | `7` |
| **Card Radius** | `24px` (pair), `18px` (columns) |
| **Card Gap** | `80px` between pairs, `5px` between columns |
| **Responsive** | Yes — cards stack vertically on mobile |

### 10. GlobeSection
| Property | Value |
|----------|-------|
| **Background** | `mkt.bg` → `#181D1F` (token) |
| **Padding** | Header: `clamp(48px, 8vw, 100px) clamp(16px, 4vw, 28px) 0`, Bottom: `32px clamp(16px, 4vw, 28px) clamp(48px, 8vw, 80px)` |
| **Border Radius** | None |
| **Margin Top** | None (no overlap) |
| **Max Width** | Globe: `1200px`, Header: `800px` (centered) |
| **Responsive** | Yes — globe height responsive, stats callout hidden on mobile |

### 11. SurfaceSection (Reviews wrapper)
| Property | Value |
|----------|-------|
| **Background** | `mkt.surface` → `#394247` (token) |
| **Border** | `1px solid mkt.cardBorder` → `rgba(255,255,255,0.08)` (token) |
| **Padding** | Outer: `px-5 sm:px-6 lg:px-8` (Tailwind), Inner: `p-6 sm:p-10` (Tailwind) |
| **Border Radius** | `rounded-[20px] sm:rounded-[24px]` (Tailwind) |
| **Max Width** | `max-w-[1200px]` (Tailwind) |
| **Margin Top** | `-mt-5 sm:-mt-6` (overlap=true) |
| **Box Shadow** | `0 10px 20px #33314833` (hardcoded) |

### 12. ReviewsSection (inner)
| Property | Value |
|----------|-------|
| **Background** | Inherited from SurfaceSection |
| **Padding** | `clamp(20px, 4vw, 32px) clamp(12px, 3vw, 20px) clamp(20px, 4vw, 28px)` |
| **Max Width** | `1100px` (centered) |
| **Card Grid Gap** | `clamp(10px, 2vw, 16px)` |
| **Card Radius** | `clamp(14px, 2vw, 20px)` |
| **Responsive** | Grid → single column at ≤640px |

### 13. Workflow Section (inline)
| Property | Value |
|----------|-------|
| **Background** | `mkt.surfaceAlt` → `#2E3638` (token) |
| **Padding** | `72px 28px 80px` |
| **Border Radius** | `28px 28px 0 0` (top corners only) |
| **Margin Top** | `-28px` (overlap pattern) |
| **Max Width** | Inner: `900px` (centered) |
| **z-index** | `4` |
| **Responsive** | WorkflowDemo grid collapses at ≤700px |

### 14. AutomationDiagram
| Property | Value |
|----------|-------|
| **Background** | `#0e1214` (**hardcoded** as `C.bg`) |
| **Padding** | Desktop: `80px 0`, Mobile: `48px 0` |
| **Border Radius** | None |
| **Margin Top** | None (no overlap) |
| **Max Width** | Canvas: `1200px` (centered) |
| **z-index** | `5` |
| **Responsive** | Yes — mobile/tablet/desktop layout switching |

### 15. TrustSection
| Property | Value |
|----------|-------|
| **Background** | `#dfe8e6` (**hardcoded**) |
| **Padding** | `clamp(60px, 8vw, 80px) clamp(20px, 5vw, 80px) clamp(80px, 10vw, 120px)` |
| **Border Radius** | `28px 28px 0 0` (top corners only) |
| **Margin Top** | `-28px` (overlap pattern) |
| **Max Width** | Inner: `900px` (centered) |
| **z-index** | `9` |
| **Card Radius** | `14px` |
| **Responsive** | Grid auto-fit, clamp padding |

### 16. CTASection
| Property | Value |
|----------|-------|
| **Background** | `#0d1514` (**hardcoded** as `DARK`) |
| **Padding** | `clamp(48px, 8vw, 80px) clamp(16px, 5vw, 40px)` |
| **Border Radius** | `28px 28px 0 0` (top corners only) |
| **Margin Top** | `-28px` (overlap pattern) |
| **Max Width** | Inner card: `700px` (centered) |
| **z-index** | `10` |
| **Inner Card Radius** | `20px` |
| **Responsive** | Clamp-based padding |

---

## STEP 4 — Consistency Report

### Master Comparison Table

| Section | BG Color | Border Radius | Padding (V) | Max Width | Overlap (-28px) | z-index | Consistent? |
|---------|----------|---------------|-------------|-----------|-----------------|---------|-------------|
| Hero Backdrop | `#181D1F` (token) | none | `16px 0` | full | N/A | 1 | ✓ |
| Hero Zone | `#394247` (token) | `24px` | n/a | full | N/A | n/a | ✓ |
| Hero Content | transparent | none | `132px / 56px` | `720px` | N/A | n/a | ✓ |
| TrustMarquee | inherit | none | `8px / 10px` | full | N/A | n/a | ✓ |
| HeroTradeDivider | gradient (hardcoded) | none | `6px / 6px` | full | No | 1 | ⚠ |
| CapabilitiesShowcase | `#A7B6BF` (hardcoded) | `28px 28px 0 0` | `112px / 88px` | `960px` | Yes | 1 | ⚠ |
| StickyStackCards | `#e4edf1` (hardcoded) | `28px 28px 0 0` | `128px / 160px` | `1120px` | Yes | 2 | ⚠ |
| PillarAnimation | `#0d1514` (hardcoded) | none | `80px / 80px` | `900px` | **No** | none | ❌ |
| FeatureCards | `#22282A` (hardcoded) | `28px 28px 0 0` | `120px / 200px` | `1100px` | Yes | 7 | ⚠ |
| GlobeSection | `#181D1F` (token) | none | clamp | `1200px` | **No** | none | ❌ |
| SurfaceSection (Reviews) | `#394247` (token) | `20px/24px` | Tailwind | `1200px` | `-mt-5/6` | none | ⚠ |
| Workflow Section | `#2E3638` (token) | `28px 28px 0 0` | `72px / 80px` | `900px` | Yes | 4 | ✓ |
| AutomationDiagram | `#0e1214` (hardcoded) | none | `80px / 80px` | `1200px` | **No** | 5 | ❌ |
| TrustSection | `#dfe8e6` (hardcoded) | `28px 28px 0 0` | clamp | `900px` | Yes | 9 | ⚠ |
| CTASection | `#0d1514` (hardcoded) | `28px 28px 0 0` | clamp | `700px` | Yes | 10 | ✓ |

---

### INCONSISTENCIES FOUND

#### Background Colors
- [x] **6 hardcoded background colors** not using `mkt` tokens:
  - `#A7B6BF` — CapabilitiesShowcase (close to `colors.effortel.n400` but not exact)
  - `#e4edf1` — StickyStackCards (matches `colors.effortel.n200` but uses local const `BG`)
  - `#0d1514` — PillarAnimation (not in any token)
  - `#22282A` — FeatureCards (close to `colors.effortel.n800`/`#22282a` but hardcoded)
  - `#0e1214` — AutomationDiagram (not in any token)
  - `#dfe8e6` — TrustSection (not in any token)
- [x] `#92a6b0` and `#b1c5ce` hardcoded in PillarAnimation cards (close to effortel tokens but not using them)

#### Border Radius
- [x] **PillarAnimation** has NO section-level border radius and NO overlap pattern — breaks the stacking card visual flow
- [x] **GlobeSection** has NO border radius and NO overlap — breaks the flow
- [x] **AutomationDiagram** has NO border radius and NO overlap — breaks the flow
- [x] SurfaceSection uses **Tailwind** (`rounded-[20px] sm:rounded-[24px]`) while all other sections use **inline styles** (`borderRadius: "28px 28px 0 0"`)
- [x] Inner card radii vary: `24px`, `20px`, `18px`, `14px`, `12px` across sections

#### Padding
- [x] **Vertical padding is highly inconsistent** across sections:
  - `80px` top/bottom — PillarAnimation, AutomationDiagram
  - `112px / 88px` — CapabilitiesShowcase
  - `120px / 200px` — FeatureCards (200px bottom is uniquely large)
  - `128px / 160px` — StickyStackCards (160px bottom is very large)
  - `72px / 80px` — Workflow Section
  - `clamp()` — GlobeSection, TrustSection, CTASection
- [x] **Horizontal padding varies**: `28px`, `24px`, `16px`, `20px`, `0` (AutomationDiagram uses 0 horizontal)

#### Max Width
- [x] **7 different max-width values** used across sections:
  - `700px` — CTASection
  - `720px` — Hero content
  - `900px` — Workflow, PillarAnimation, TrustSection
  - `960px` — CapabilitiesShowcase
  - `1100px` — FeatureCards, ReviewsSection
  - `1120px` — StickyStackCards
  - `1200px` — GlobeSection, SurfaceSection, AutomationDiagram

#### Overlap/Stacking Pattern
- [x] **3 sections break the overlap pattern** (no `-28px` marginTop, no top border-radius):
  - PillarAnimation — sits flat after FeatureCards(? no — after StickyStackCards)
  - GlobeSection — sits flat
  - AutomationDiagram — sits flat
- [x] SurfaceSection uses a **different overlap**: `-mt-5 sm:-mt-6` (Tailwind) instead of `marginTop: -28`

#### z-index
- [x] **z-index values are inconsistent and non-sequential**: 1, 2, 4, 5, 7, 9, 10
  - Gaps at 3, 6, 8
  - This works but is fragile and hard to maintain

#### Styling Methodology Mix
- [x] **SurfaceSection and ReviewsSection** use Tailwind classes while ALL other sections use inline styles
- [x] Some sections use `mkt` tokens, others use hardcoded hex values for the same conceptual colors

#### Responsive Behavior
- [x] **PillarAnimation** — No mobile padding override (stays at `80px 24px`)
- [x] **AutomationDiagram** — Uses `padding: "80px 0"` with 0 horizontal padding (content handles its own)
- [x] **HeroTradeDivider** — Fixed `72px` height with no responsive breakpoints

---

### CURRENT COLOR USAGE

| Background Color | Hex | Source | Used By |
|-----------------|-----|--------|---------|
| Dark page bg | `#181D1F` | `mkt.bg` (token) | Hero Backdrop, GlobeSection |
| Dark surface | `#394247` | `mkt.surface` (token) | Hero Zone, SurfaceSection (Reviews) |
| Dark surface alt | `#2E3638` | `mkt.surfaceAlt` (token) | Workflow Section |
| Near-black | `#0d1514` | hardcoded | PillarAnimation, CTASection |
| Near-black v2 | `#0e1214` | hardcoded | AutomationDiagram |
| Dark charcoal | `#22282A` | hardcoded | FeatureCards |
| Medium gray-blue | `#A7B6BF` | hardcoded | CapabilitiesShowcase |
| Light gray-blue | `#e4edf1` | hardcoded | StickyStackCards |
| Light sage | `#dfe8e6` | hardcoded | TrustSection |
| Gradient | `#181D1F → #2B3840 → #56656E → #A7B6BF` | hardcoded | HeroTradeDivider |
| Card gray | `#92a6b0` | hardcoded | PillarAnimation cards |
| Card inner | `#b1c5ce` | hardcoded | PillarAnimation inner cards |

**Unique background colors: 12**
**Using tokens: 3** (25%)
**Hardcoded: 9** (75%)

---

## Summary

| Metric | Count |
|--------|-------|
| **Total sections found** | 16 |
| **Inconsistencies detected** | 23 |
| **Unique background colors** | 12 |
| **Hardcoded colors (should be tokens)** | 9 |
| **Sections missing overlap pattern** | 3 |
| **Different max-width values** | 7 |
| **Mixed styling methodologies** | 2 (inline styles + Tailwind) |

### Key Recommendations (for reference only — no changes made)

1. **Consolidate background colors** into `mkt` tokens — especially `#0d1514`, `#0e1214`, `#A7B6BF`, `#e4edf1`, `#dfe8e6`
2. **Standardize the overlap pattern** — PillarAnimation, GlobeSection, and AutomationDiagram should use `borderRadius: "28px 28px 0 0"` + `marginTop: -28` to maintain the stacking card flow
3. **Standardize max-width** to 2-3 values (e.g., `900px` for narrow, `1100px` for standard, `1200px` for wide)
4. **Standardize vertical padding** — pick 2-3 consistent values (e.g., `80px`, `100px`, `120px`)
5. **Resolve the Tailwind/inline style split** — SurfaceSection uses Tailwind while everything else uses inline styles
6. **Normalize z-index** values to a sequential scale
