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
- [ ] **6. Localized incentives + utility rate** (TS) — federal ITC 30% (have) + state/utility
  rebate + local $/kWh; net-metering note. Needs a data source (DSIRE/OpenEI) — stub w/ regional table first.
- [ ] **7. Roof-condition / penetration line items** (DIFF) — surface rooffeatures detection
  (chimneys/vents/skylights/overhang) as estimate line items + counts.
- [ ] **8. Battery/storage toggle** (DIFF) — backup vs self-consumption; payback delta.
- [ ] **9. Shareable/downloadable PDF proposal + book-a-call CTA** (TS) — close the loop.
- [ ] **10. Real-SKU material/color library** (DIFF) — branded shingles (GAF Timberline etc.)
  with real color names, so the AI render & catalog feel authentic vs generic textures.
- [ ] **11. Sub-60s flow polish + no hard gate before estimate** (TS) — address autocomplete,
  progress, value-first.
- [ ] **12. AI render quality** — gpt-image-1 (blocked on OpenAI billing — Alex). Browse tier meanwhile.

- [ ] **13. "Customize" collapsible** — the roofing quote card is getting dense (price, finance, waste, options, takeoff, notes, stats); group the configurators/takeoff behind an expander for a cleaner default surface.

## Log
(append per cycle: date · feature · commit · verification)
- 2026-06-21 · #1 materials takeoff + waste factor · verified desktop (6 line items, 3 waste btns, 0 errors)
- 2026-06-21 · #2 inline financing (solar $282/mo, roof $109/mo) · verified, 0 errors
- 2026-06-21 · #3 before/after slider · verified desktop drag 55%->25% + mobile 375px (36px knob), 0 errors
- 2026-06-21 · #4 confidence band (±5-7%) + trust framing · verified, 0 errors
- 2026-06-21 · #5 tear-off/layers/ventilation configurator · verified (2-layer +$1.3k, ridge vent +$200), 0 errors
