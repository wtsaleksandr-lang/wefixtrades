# Roof & Solar tool — overnight improvement roadmap

Goal (Alex, 2026-06-21): make this the **best roof/solar instant-quote tool on the market**
(vs Aurora, OpenSolar, Sunroof, EnergySage, Roofr, Hover, EagleView, Owens Corning).
Work autonomously: build → gate (Playwright desktop+mobile on serve.mjs:5300) → commit on
branch `roof-quote-wizard-integration`. Keep `roof3d.html` (spike) ↔
`server/roofQuote/assets/roof3d.html` (served) in sync. Never deploy.

Grounded in competitive research (2026-06-21). TS = table-stakes, DIFF = differentiator.

## Backlog (ranked impact × feasibility)

- [ ] **1. Materials line-item estimate + waste factors** (TS) — squares, underlayment, drip
  edge, ridge cap, starter, flashing, nails, penetration count; waste 0/10/recommended/15%.
  Derive from existing area + ridge/hip/valley/eave/rake LF. *Makes the roofing quote credible.*
- [ ] **2. Inline financing comparison** (TS) — cash vs loan (monthly @ APR/term) vs lease, on
  BOTH roof and solar price. Biggest conversion lever.
- [ ] **3. Before/after comparison slider** (DIFF) — drag divider over the AI render: original
  roof ↔ new material. Hover/Owens-Corning-class visualizer moment.
- [ ] **4. Measurement confidence band** (DIFF/trust) — show ±accuracy + "verify before
  purchase" + imagery note. Honest re: Google tile precision; builds trust.
- [ ] **5. Tear-off / layers / ventilation configurator** (TS) — 1 vs 2 layers, ridge-vent LF,
  steep/2-story access multiplier → adjusts price.
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

## Log
(append per cycle: date · feature · commit · verification)
