# Roof & Solar tool — overnight improvement roadmap

Goal (Alex, 2026-06-21): make this the **best roof/solar instant-quote tool on the market**
(vs Aurora, OpenSolar, Sunroof, EnergySage, Roofr, Hover, EagleView, Owens Corning).
Work autonomously: build → gate (Playwright desktop+mobile on serve.mjs:5300) → commit on
branch `roof-quote-wizard-integration`. Keep `roof3d.html` (spike) ↔
`server/roofQuote/assets/roof3d.html` (served) in sync. Never deploy.

Grounded in competitive research (2026-06-21). TS = table-stakes, DIFF = differentiator.

## Backlog (ranked impact × feasibility)

- [x] **1. Materials line-item estimate + waste factors** (TS) — DONE. Takeoff (field shingles,
  starter, hip/ridge cap, drip edge, underlayment, valley flashing, nails) + 0/10/15% waste
  toggle (auto-recommends 15% for cut-up roofs) that adjusts quantities + price. Derived from
  the roof-geometry totals (hoisted via getRoofTotals/facetsToRoofModel).
- [x] **2. Inline financing comparison** (TS) — DONE. Monthly loan payment on solar (25-yr 6.99%, after 30% ITC) + roofing (12-yr 9.99%) shown inline under each price; pairs with the "saves $X/mo" line for a net-cashflow story.
  BOTH roof and solar price. Biggest conversion lever.
- [x] **3. Before/after comparison slider** (DIFF) — DONE. Drag the divider to wipe between the new material (left) and the original roof (right); circular knob, After/Before tags, clip-path wipe, pointer events (mouse + touch). Replaces the old before toggle.
- [x] **4. Measurement confidence band** (DIFF/trust) — DONE. ±5-7% band (wider on complex roofs) chip on the measured area + "confirm on site before ordering" framing on the measure view and the takeoff. Honest re aerial precision; no inch-level overclaim.
- [x] **5. Tear-off / layers / ventilation configurator** (TS) — DONE. Roofing options row: 1/2 layers (2nd-layer tear-off ~$90/sq), Ridge vent (~$11/lf ridge), Steep/2-story (+12%, auto-flagged for pitch>=9/12). Each rescales the price live.
- [x] **6. Localized incentives + utility rate** (TS) — DONE. Region table (US states + CA provinces) → local $/kWh + incentive note + federal-credit rule, resolved from the address. Fixes a real bug: Ontario no longer claims the US 30%% ITC; rates/savings/financing now region-correct.
- [x] **7. Roof-condition / penetration line items** (DIFF) — DONE. Roof-feature detection (chimneys/vents/skylights/dormers + roof type) now runs on load (was Measure-only) and surfaces as a "Detected: hip roof — 2 vents" credibility line, a "Pipe boots + flashing" takeoff item, and per-penetration flashing cost in the price.
- [x] **8. Battery/storage toggle** (DIFF) — DONE. "+ Battery storage · 13.5 kWh backup" toggle on the solar quote adds ~$11.5k (ITC-eligible in the US), updates the financed monthly, and shows the backup value note.
- [x] **10. Material specs (warranty + lifespan)** (DIFF) — DONE. Per-material spec line (warranty · lifespan) under the chosen material + a one-line description in the expander, for all 9 materials. Trademark-safe (no specific brand SKUs — the colour names are already realistic + a white-label tool should not hardcode brands). Helps the buying decision like a real product page.
- [x] **11. Address autocomplete (Google Places)** (TS) — DONE. Places Autocomplete on the address bar (reuses the loaded Maps JS), styled to the wizard (Satoshi, rounded, blue focus, hover-tint); selecting a suggestion fills + auto-runs the quote. Graceful plain-text fallback.
- [ ] **12. AI render quality** — gpt-image-1 (blocked on OpenAI billing — Alex). Browse tier meanwhile.

- [x] **13. "Customize" collapsible** — DONE. Default roofing surface is clean (price, financing, stats, CTA); waste/options/takeoff live behind a "Customize & see materials" expander. Apple/Tesla-simple default, full detail one tap away.
## Log
(append per cycle: date · feature · commit · verification)
- 2026-06-21 · #1 materials takeoff + waste factor · verified desktop (6 line items, 3 waste btns, 0 errors)
- 2026-06-21 · #2 inline financing (solar $282/mo, roof $109/mo) · verified, 0 errors
- 2026-06-21 · #3 before/after slider · verified desktop drag 55%->25% + mobile 375px (36px knob), 0 errors
- 2026-06-21 · #4 confidence band (±5-7%) + trust framing · verified, 0 errors
- 2026-06-21 · #5 tear-off/layers/ventilation configurator · verified (2-layer +$1.3k, ridge vent +$200), 0 errors
- 2026-06-21 · #6 localized incentives+rate · verified ON (no US ITC, $0.13/kWh) vs TX (30% ITC, $0.15/kWh), 0 errors · FIXED false-ITC bug for Canada
- 2026-06-21 · #13 Customize collapsible · verified collapsed(clean)/expanded states, 0 errors
- 2026-06-21 · #7 penetration line items + detected summary · verified (hip roof, 2 vents detected → line+cost), 0 errors · FIXED: detection only ran in Measure mode
- 2026-06-21 · #8 battery storage toggle · verified (+$11.5k, $338->$397/mo, backup note), 0 errors
- 2026-06-21 · #11 address autocomplete · verified (5 Places suggestions, styled, auto-run on select), 0 errors
- NOTE: verify integration .ts with NODE_OPTIONS=--max-old-space-size=8192 tsc (default heap OOMs + under-reports on this repo)
- 2026-06-21 · CI fix: duplicate roofing key in TRADE_TEMPLATE_MAP (TS1117) — raised-heap tsc clean · #9 PDF/share/book already in report
- 2026-06-21 · #10 material specs (warranty/lifespan/desc) · verified (metal: 30-50yr warranty, 40-70yr life), 0 errors
- NOTE: integration server/asset changes need a full `NODE_OPTIONS=--max-old-space-size=8192 npm run build` to verify (tsc alone misses esbuild CJS issues like top-level await). Widget HTML features are fine with the serve.mjs visual gate.
- 2026-06-21 · CI fix 2: rooffeatures.mjs top-level await broke esbuild CJS server bundle → static assert import; full local build clean
- 2026-06-21 · REGRESSION SWEEP clean — 0 console/page errors across full flow desktop+mobile (all 12 features exercised together). CI green. Overnight feature mandate COMPLETE.
