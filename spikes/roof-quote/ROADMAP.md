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
- [x] **14. Mobile price while browsing materials** — DONE (Alex-approved). The render bar (#aiBar, visible during material browse) now shows the live material + price; updates per selection. Fixes the mobile gap where the quote card is hidden behind the catalogue. Verified 390px: "Architectural · Charcoal $7,250-$11,250", 0 errors.

- [x] **16. Material comparison picker** — the roofing "choose a material" empty-state is now a compact comparison of all 9 materials with est. price FOR THIS ROOF + lifespan; tap a row to select it. A real buying-decision aid (vs a bare prompt).

- [ ] **17. Flat/commercial roof handling** (logic correctness) — rooffeatures returns roofType; when "flat", the sloped-shingle catalog + asphalt $/sq are wrong (flat roofs use TPO/EPDM membrane, priced differently). Detect via PITCH (predominantPitchX12<=1 from geometry), NOT Gemini roofType (returns "unknown" for flat — probed downtown+residential, unreliable + commercial addresses time out capture/lack Solar data). Add membrane catalog (TPO/EPDM/PVC/mod-bit) + note. Still needs a CONFIRMED flat-roof test address (Solar coverage + near-flat pitch) to verify it triggers.

- [x] **18. Shareable/restorable quote link** — Share/Email now copy a URL that encodes the quote (?a=address +optional &m/&c material), and the widget restores the address (auto-runs that property) on load. A shared link reopens the recipient on the same property's quote instead of a blank widget. (Material auto-select from &m/&c captured for a follow-up.)

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
- 2026-06-21 · Mobile final check: roofing card reachable + fits + scrolls when catalogue closed (top397/bot754). Flow functional. Logged #14 (simultaneous price-while-browsing) for next session.
- 2026-06-21 · #15 report enrichment · verified (New roof — Standing-Seam Metal $14.3k-25.4k, spec+measured takeoff, region-correct Canada savings), 0 errors
- 2026-06-21 · #16 material comparison picker · verified (9 materials priced for this roof + lifespan; tap Slate -> selected $23.9-47.8k), 0 errors
- 2026-06-21 · #18 shareable/restorable quote link · verified (?a=address restores property + auto-runs), 0 errors
- 2026-06-21 · #18 follow-up: material restore from &m/&c · verified (?a+&m=metal&c=Matte Black lands on that exact quote $14.3-25.4k), 0 errors. Share round-trip complete.
- 2026-06-21 · #14 mobile price-while-browsing · verified 390px (price in render bar, updates per selection), 0 errors
- [x] **19. Gutters + downspouts add-on** (new feature, approved) — "New gutters" roofing option priced off the measured eave LF (~$9-15/lf + downspouts), adds a takeoff line. A real upsell using existing geometry.
- 2026-06-21 · #19 gutters add-on · verified (107 lf eave → +$1.15-1.8k, takeoff line), 0 errors
- [x] **20. Size-to-your-bill solar (Sunroof-class)** (new feature, approved) — pick your monthly power bill ($100-$400+) → the system auto-sizes to the tier that offsets it + shows "covers ~X% of a $Y/mo bill" (uses the region rate). A core best-in-class solar feature.
- 2026-06-21 · #20 size-to-bill · verified ($100->Good 130%, $400->Best 60%, region-rate based), 0 errors
- [x] **21. Solar card Customize collapse** — solar default surface is now clean (price, savings, financing, 3 tiers, stats, CTA); bill-sizing + battery tucked behind a Customize expander, consistent with the roofing card and the <=3-decisions simplicity rule.
- 2026-06-21 · #21 solar Customize collapse · verified (collapsed: tiers only; expanded: bill+battery), 0 errors
- [x] **22. Ultra-realistic material swatch textures** (Alex ask) — rewrote makeShingleCanvas to render each material type realistically: granular dimensional asphalt courses, metal standing-seam ribs + sheen, mottled overlapping slate, barrel/S clay-tile, cedar grain, + per-element shade variation, granular noise, lighting. Fixed a color bug (the shade helper assumed hex but the catalog uses rgb() — greys/browns were rendering red/purple). Metal previously fell back to the asphalt grid; now correct.
- 2026-06-21 · #22 realistic swatch textures · verified asphalt/metal/slate/tile at 2-3x (realistic patterns, correct colors), 0 errors

## New requests (Alex, 2026-06-21) — help cues + add-on thumbnails
- [ ] **23. Info-modal infrastructure** — reusable light modal (matches wizard), openInfoModal(html)+close, shared by the below.
- [ ] **24. Material help-cue modal** — a little help cue on each material selection → modal with explanation, features, photo example of placement on the house (the AI render), and benefits.
- [ ] **25. Address-data accuracy help-cues** — help cues on the displayed data (dimensions, sun exposure, measurements, etc.) → modal explaining accuracy (
## New requests (Alex, 2026-06-21) — help cues + add-on thumbnails
- [ ] 23. Info-modal infrastructure — reusable light modal (matches wizard), openInfoModal(html)+close.
- [ ] 24. Material help-cue modal — help cue on each material selection -> modal: explanation, features, photo example of placement on the house (AI render), benefits.
- [ ] 25. Address-data accuracy help-cues — help cues on displayed data (dimensions, sun exposure, measurements) -> modal: accuracy percent + on-site measurement required to lock the final rate.
- [ ] 26. Add-on thumbnails — each add-on (battery, gutters, ridge vent, layers, steep) gets a thumbnail/icon.
- [x] 23/24. Info-modal + material help-cue modal — DONE. Reusable light modal (openInfoModal/close, backdrop-click). A help cue (i) on the selected material opens a modal with: explanation, Features + Benefits bullets, warranty/lifespan, and a hero = the AI render on the user's house (texture fallback). Verified, 0 errors.
- [x] 25. Address-data accuracy help-cues — DONE. Help cue (i) on the solar estimate, sun-hours, roof measurements, and roofing price -> modal "How accurate is this?" with the accuracy band (e.g. +/-5-10%) + that an on-site measurement is required to lock the final guaranteed rate (instant estimate, not a locked price). Verified, 0 errors.
- [x] 26. Add-on thumbnails/icons — DONE. Each feature add-on has an icon: Ridge vent (vented ridge), New gutters (gutter trough), Steep/2-story (angle), Battery storage (battery). Numeric Layers 1/2 stay clean. Verified desktop, 0 errors.
- [x] 27. Add-on explainer modals — help cue on the roofing options + battery -> modal explaining what each add-on is and why it matters (layers/ridge vent/gutters/steep; battery what-it-does/cost/incentives). Completes the "every component has a help cue" rule. Verified, 0 errors.

## Pricing validation (research 2026-06-21) — corrected to real-world 2024-25
- [x] 28. Rate corrections — 2nd-layer tear-off $90/sq -> $28/sq (was 3-4x too high, the one a roofer spots instantly); steep/2-story +12% -> +20-45%; clay 800-1500 -> 1000-2000; concrete 600-1000 -> 700-1500; arch top 700 -> 750; synthetic top 1500 -> 1600; gutters hi 15 -> 18/lf. Validated vs EnergySage/HomeGuide/HomeAdvisor/Angi 2024-25. Solar $/W, $0.165/kWh, battery $11,500, 3-tab/metal/slate/cedar/ridge-vent confirmed accurate.

## Research findings — panel/battery TYPES + per-panel (to build, Alex-requested)
- Panel TIERS (3, brand-mapped): Good = Silfab/JA/Canadian (~$ lowest, 25yr); Better/default = Q CELLS or REC (~21.5%, 25yr, market sweet spot); Best = Maxeon/SunPower/Panasonic (22%+, 40yr warranty). Differentiate by WARRANTY + efficiency, show $/W delta.
- Battery TYPES (model+qty picker): Tesla Powerwall 3 (13.5kWh, default), FranklinWH aPower 2 (15kWh), Enphase IQ 5P (5kWh modular), SolarEdge (9.7kWh). Label our $11,500 as Powerwall 3 DC-w/-solar.
- Per-panel: TRUE per-panel add/remove is PRO-tool only (Aurora/OpenSolar). Consumer best-practice = Tesla's roof-AREA toggle (tap an area to add/remove a block). RECOMMEND building area-toggle, not per-module drag, for v1.
- More homeowner inputs worth adding: utility/rate + net-metering, offset% target, future-load toggles (EV/heat pump/pool), financing choice, shading level. (Monthly bill already done via #20.)
- FLAG for Alex: the 30% federal residential ITC (25D) reportedly EXPIRED Dec 31 2025 — our US quotes still apply it. Needs Alex's call (gate by install date / keep / replace with state incentives).
- [x] 29. Solar PANEL quality tiers (Alex ask) — Standard / Premium / Premium+ selector (in solar Customize), brand-mapped (Q CELLS/REC -> REC Alpha/Panasonic -> SunPower/Maxeon), adjusts price (x1.0/1.18/1.25) and shows efficiency + warranty (25 -> 30 -> 40yr). Help-cue modal explains tiers. Verified, 0 errors.
- [x] 30. Battery TYPES picker (Alex ask) — toggle battery on -> Model row: Powerwall 3 (13.5kWh/$11.5k, default), FranklinWH aPower (15kWh/$14.5k), Enphase 5P (5kWh/$8.5k). Price + backup note update per model. Flows to the report. Verified, 0 errors.

## Paradise Solar Energy competitive teardown (2026-06-21)
Drove all 4 of paradisesolarenergy.com's calculators live (cost, ROI, battery, EV) with Playwright. Screenshots + full teardowns in `audits/paradise/{cost,roi,battery,ev}/`.

**Key strategic reads:**
- Paradise's tools are single-installer LEAD-GEN funnels: cost & ROI HARD-GATE every number behind name/email (ROI even computes client-side then blurs behind a padlock). We win by showing the answer first (ungated) + optional "get full quote" CTA — keep ungated.
- Their whole architecture is config-as-data (device watts, price matrix, sizing ladders as editable props). That's the multi-tenant model we MUST have for Phase 4 (each installer tunes pricing/equipment, no code change).
- They disclose almost no assumptions (mislabeled EV field → 156-panel nonsense; unexplained $0 tax line). Our help-cue/accuracy modals already lead here — our credibility edge.

**SHIPPED from this teardown:**
- #32 Appliance-based battery sizing (commit 18b66f56) — pick what to keep running → daily kWh → auto-size battery model×count. The battery tool's killer feature; resolves the #1 battery confusion. Verified live desktop+375px.

**Recommended next (from teardown):**
- EV-load add-on — done right: EV efficiency presets + validated miles slider (NOT their raw two-box model).
- Lead-qualification fields (timeline + priorities multi-select → scored CRM lead) — Phase 4; what makes installers PAY.
- Config-as-data multi-tenant layer — Phase 4 architecture.
- SREC income line — SREC states (PA/NJ/MD/OH/DC/IL) only.
- SKIP: hard lead-gate, tax-bracket input (post-ITC federal benefit gone), inverter-type selector (installer's call), service-area gating (per-tenant config).

## EV + premium UX + research (2026-06-21, cont.)
SHIPPED (PR #1935, all verified live desktop+375px):
- #33 EV charging: solar-size add-on (Sedan/SUV/Truck efficiency presets + bounded miles chips → extra panels/kW; fixes Paradise's mislabeled raw-input bug) + optional Level-2 charger install (~$1,600). + category icons (CAT_ICON: panels/battery/inverter/EV/charger/sun) for premium feel.
- #34 KPI strip: research-backed (Tesla/Palmetto/Sunrun study). On bill entry → new bill before→after, monthly+annual savings, energy-offset conic gauge ("run on sun"). Hidden until bill set (keeps ≤3 default decisions).

RESEARCH DELIVERED (2 agents, cited):
- Homeowner KPIs: lead with new-bill before→after + monthly savings + offset% gauge + payback + 25-yr net; sliders = bill-offset / miles / backup-days; show self-consumption only in battery view as plain English; AVOID ROI%/NPV/IRR/LCOE/$W, gross savings, whole-home backup framing. Footnote net-of-incentive + 3%/yr inflation + degradation.
- Free APIs (US+CA): #1 real electricity rate — US: EIA Open Data API (instant free key, eia.gov/opendata/register.php); Canada: NO API, hardcode provincial ¢/kWh table. #2 production/sun-hours — PVWatts v8 (DEMO_KEY works; note NREL domain moved to developer.nlr.gov 2026-05-29; NSRDB covers <60°N so all southern Canada) + NASA POWER (NO key, public-domain, covers Canadian north). Sunny-days: Open-Meteo (no key, but COMMERCIAL use needs paid). CO2: Electricity Maps (free tier non-commercial). DSIRE incentives = US-only, API by email request.

NEXT (needs Alex nod on keys/commercial-terms): wire EIA US rates + Canada provincial table (biggest accuracy win) + NASA POWER sun-hours (zero-key, commercial-safe). Server-side: new routes in serve.mjs + roofQuoteRoutes.ts, cached per-location.

## UI cleanup + catalogue + open questions (2026-06-21, cont.)
SHIPPED (PR #1935, verified desktop+375px):
- Customize sheet reorg (8b9d2dd9): "Your system" + "Add-ons" sections; add-ons are an ACCORDION (toggle → one-line summary + Customize expander, one open at a time). 730px → 393px collapsed.
- Size slider → 3D map reflection (8b9d2dd9): buildPhotoPanels draws round(baseN×size%) panels + rebuilds on change.
- Roofing material catalogue (ab05183c): horizontal-scroll cards w/ realistic makeShingleCanvas texture thumbnails + tier badges + tight price band.

OPEN (Alex flagged):
- TODO semi-detached/townhouse SOLAR roof-sectioning: detect attached/multi-unit building (large area / elongated bbox / many segments) → ask "your section?" → spatial-filter panels by proximity to the geocoded unit point → recompute size/production for that section. Solar = high value/clean. Roofing = same split tech but lead with "shared roof, confirmed on-site" caveat (party-wall boundary ambiguous; coordination needed). Not auto-quote for true shared/condo roofs.
- DECISION: UI/design polish pass before QuickQuote integration — recommend a focused consistency pass vs DESIGN-SYSTEM.md (tokens/spacing/type/help-cue/mobile) with a visual-review gate; not a redesign. Pending Alex's direction (match QuickQuote exactly vs keep widget identity).

## Map graphics + UX backlog (Alex 2026-06-21)
CONFIRMED map features ("definitely yes, make it glitch-free desktop+mobile"):
- [DONE] Per-panel production coloring — card toggle "Colour panels by yearly output" → energyColor ramp on the 3D panels + legend gradient. (CTA "Get full quote" → "Lock in my rate" also done.)
- [NEXT — dedicated build] Animated shadow / sun-path play: time-of-day + season already exist (#sunbar sTime/sMonth). Use Google hourlyShadeUrls (12mo×24hr, in datalayers response, not yet decoded) draped on the roof clipped to mask (includes TREE shade = the high-value bit), OR Three.js shadow-casting in schematic (roof self-shadow only, no trees). Renders on Map3D → verify on tunnel (headless can't load 3D map). Make smooth, no glitches, desktop+mobile.

QUESTIONS answered: Glare/orientation views = SKIP (niche/subsumed by heatmap). AR phone-camera = SKIP (impractical — homeowner can't see/fly over their own roof; defer indefinitely).

UX TO-DO (Alex's punch list):
1. DESKTOP rotate-view control — mobile has 2-finger rotate; desktop has no way to orbit the house. Add a rotate button/control.
2. MEASUREMENT lines + numbers: lines too thick; number labels float hectic/overlapping. Make subtle, placed next to their line, or hover-only.
3. MEASUREMENT diagram image: poor quality (unacceptable). Also top-view shows different left vs right dimensions — Alex doubts accuracy (house should be roughly symmetric). Investigate measurement symmetry + raise image quality.
4. "Choose materials" BEFORE/AFTER slider: left side renders BLANK WHITE even though the default design has a green "rendered" badge (bug). Also the image is static + Google imagery is low-res → zoom OUT a bit so low quality is less obvious.
5. ROOFING quote card:
   a. Show the price BREAKDOWN / how it was calculated (currently only the final sum).
   b. The (i) material modal: house photo is cropped from the top — can barely see the roof. Fix the crop/framing.
   c. Material features/benefits should cover weatherproof, heat/cold resistance, waterproof, load-bearing, etc.
   d. Add VISUAL graphic explanations for components (ridge vent, gutters, drip edge, starter strip, shingles) — homeowners don't know what a "starter strip" is.
   e. [DONE] CTA "Get full quote" → "Lock in my rate".

## Deep audit fixes — 2026-06-22 00:52
Report+lead agent (af747104) findings fixed in roof3d.html:
- P0 waste-table squares: applied waste% to t.squares (measured) not footprint sqs — was 3.8x off on multi-facet roofs
- P0 lead-loss: sendLead() localStorage retry-queue + flushLeads() on load; checks res.ok
- P1 card-vs-report monthly: report now midpoint*(1-credit) matching card teaser (was hi, no credit)
- P1 email regex: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/ — rejects spaces/junk, 11/11 in isolation
- P2 print CSS: color-adjust:exact + break-inside:avoid on sec/tier/rp-card/mr-waste/hero

## Deep Playwright audit — 6 parallel agents (solar/addons/roofing/report/map/mobile) — fixes shipped
ALL verified live unless noted. roof3d.html:
- [P0] Squares unification: reconcileTotals() anchors facet-model area/squares to Google wholeRoofStats (was 2.9sq vs 11sq); edge lengths scaled by sqrt(ratio). Card stat=report stat=takeoff=waste=price now ONE number. VERIFIED Angus 14.4/15.9.
- [P0] Report waste table used flat footprint not measured squares — now t.squares. VERIFIED.
- [P0] Lead-loss: sendLead() localStorage retry-queue + flushLeads() on load + res.ok check.
- [P1] EV-added panels now reach the system summary (Panels/kW/kWh + SREC + CO2) — was price-only. VERIFIED 18->26 (+8 EV).
- [HIGH] Whole-building trap: commercial card now shows '⌂ My section' back toggle for attached homes + correct note. VERIFIED back works.
- [P1] Card vs report monthly: report uses midpoint*(1-credit) matching card teaser. VERIFIED $142 everywhere.
- [P1] Email regex tightened (rejects spaces/junk). VERIFIED 11/11.
- [MED] Card/3D decouple: QUOTE + renderQuoteCard() BEFORE buildScene() (try/catch) — WebGL/3D failure no longer suppresses the price card.
- [MED] Region misdetection: setRegion scans address tail-first (Mt Vernon CA -> CA not MT). VERIFIED 8/8.
- [design] Tab selected-state = outline not fill. VERIFIED white bg.
- [UX] Empty-address guard (red border, no run). VERIFIED.
- [UX] Escape closes topmost overlay (report over lead).
- [UI rule] Lead-modal inputs now have persistent top-left labels (was placeholder-only).
- [UI rule] Tap targets: .opt-row button min-height 32px; size slider 4px->22px hit area.
- [P2] Print/PDF CSS: color-adjust:exact + break-inside:avoid.
NOTED not-fixed (rationale in synthesis): branding placeholders (intentional per Alex), savings-frozen-on-EV (EV=gas not power-bill), szval collision (unreproducible), data-bill=0 empty state, size>100% roof, help-cue right-vs-topleft, serve.mjs solar/datalayers disk-cache (launch infra).

## Sun lens fix #2 — measurement labels leaking into Sun lens (Alex screenshot 2026-06-22)
Root cause: buildScene bakes per-facet 'ft²·pitch' sprites into worldGroup permanently; default view is photoreal so the schematic scene only shows in the Sun lens -> labels appeared ONLY there, cluttering shadows/heatmap.
Fix: collect sprites in schemLabels[], setSchemLabels(false) on Sun enter (applySunView), restore on exit. VERIFIED vis 2->0 in sun, ->2 on exit.
Earlier same session: sun-map showed solar panels over the heatmap (clearPanels in map branch).
OPEN: schematic sun-shadows view framing (dark sky void above house) — can't verify headless (Three.js canvas doesn't paint); needs Alex eyes-on after this fix.

## Sun lens fix #3 — schematic 'toy house' (Alex: minecraft, flat grey walls, crooked roof)
Root: the shadows sub-view used a hand-built schematic (extruded walls + DSM roof planes) = crude toy vs Google photoreal.
Fix: SUN_SHADOWS=false flag — Sun lens now defaults to the photoreal sun-EXPOSURE heatmap on the REAL Google 3D building; schematic shadow-play (sPlay/sliders/sMap toggle) hidden. VERIFIED both addrs: mode=photoreal, heatCells>0, panels=0, sunbar hidden, 0 errors.
Animated sun-path shadows parked until doable on realistic geometry (set SUN_SHADOWS=true to restore).

## Sun shadows on REALISTIC geometry — spike (Alex: cast shadows on realistic geometry)
Approach: render Google Photorealistic 3D Tiles in three.js (3d-tiles-renderer) + DirectionalLight shadow map driven by SunCalc, vs the old toy schematic.
Standalone test page: spikes/roof-quote/shadows-test.html, served at /shadows-test (read fresh per request).
KEY: three@0.160 forced 3d-tiles-renderer@0.3.46 whose ReorientationPlugin mis-recentered (groundY -1287m, tiles stuck at 51km, sky-only). Upgraded the TEST PAGE to three@0.170 + 3d-tiles-renderer@0.4.28 (core/plugins+three/plugins split) -> recenter CORRECT (groundY 112.9m = Hamilton elevation), tiles render, camera auto-frames via downward raycast. No import errors.
Headless renders only COARSE (no GPU refine) — full detail + shadow visual need Alex's real browser. Sun-direction Z-sign + shadow look TBD on tunnel.
Widget stays on three@0.160; integration plan TBD after Alex confirms the look (likely a separate renderer/iframe for the shadow view, or bump widget three).

## ALEX TO-DOS 2026-06-22 (screenshots + trade-utility pivot)
[T1] HEATMAP QUALITY: solar-exposure overlay still pixelated/blocky corners. Wants Aurora-grade SMOOTH gradient (ref: Aurora ANNUAL roof heatmap) — and noted Google Sunroof's heatmap looks better than ours. Our annualFluxUrl raster IS the same data Sunroof renders smoothly; current buildPhotoHeatmap draws discrete 0.55m polygon cells -> blocky. FIX = render flux as a smooth continuous overlay/texture, not discrete cells.
[T2] GRAB-DRAG scroll for catalogue/material/design/style (desktop cursor drag + mobile swipe) + card minimize/fold-down. NOTE: Alex says lower priority since it's wrapped in the QuoteQuick wizard which already handles this.
[T3] TRADE-UTILITY: research+decide whether to add trade-facing calculators (measurement->material takeoff cost, panel/battery fit by roof dims, optimal placement by sun exposure, shade analysis). Is the tool just lead-gen or a real trade tool? Ref SolarPlus (7 links). Positioning: affordable+simple alternative, genuinely in-demand among solar installers AND roofers, must NOT look shady/unfamiliar to trades, NOT competing with major SaaS. RESEARCH AGENT DISPATCHED.
[SHADOWS] 3d-tiles shadow spike: broken for Alex on tunnel (twice 'unusable'). Server/tunnel were up on recheck (likely flaky-server-down when he clicked). RECOMMENDATION: PARK — fragile, high-effort, lower priority than T1/T3.
[INTEGRATION ANSWER] Widget IS integrated in QuoteQuick: template 'roof_solar_visualizer' (Roof & Solar Visualizer) -> roof_visualizer step iframes /api/roofquote/widget. Known TODO: bridge widget CTA->wizard lead_capture via postMessage + suppress widget's own lead form in embed (single lead surface).

## HEATMAP FIXED (T1) — smooth Sunroof/Aurora-style
Root: Sun lens used 3D buildPhotoHeatmap (chunky 0.55m Polygon3D cells). FIX: Sun lens now calls showAnalysis('sun') -> renderSunPreview() which was ALREADY coded but never invoked: per-pixel fluxColorSmooth ramp composited on the top-down aerial photo, clipped to roof mask = smooth gradient, no chunky corners. 2D top-down (matches Aurora/Sunroof which ARE 2D). VERIFIED headlessly (2D canvas) on NJ/CA/Angus — smooth gradient renders. Tradeoff: loses 3D building context in Sun lens (acceptable; Aurora/Sunroof are 2D).

## ALEX TO-DOS 2026-06-22 (batch 2)
[T4] SCANIFLY grey-massing model: Alex likes Scanifly's CLEAN grey 'minecraft-style' house model done PROPERLY (genuinely follows house structure) — our schematic was crude/crooked, theirs is clean. OK to use grey massing for SOLAR view ONLY (roofing needs photoreal facade match). Also likes their UI: offset KPI ring + unfolding tabs (Utility Bill/System/Details) + minimalistic icon nav. Review demo https://scanifly.com/product/pv-design/. TEARDOWN AGENT DISPATCHED.
[T5] BUILD TRADES MODE (reaffirmed) — see research: exportable measurement/takeoff PDF, panel-layout w/ configurable setbacks, simple battery helper. Paid add-on, $10-20/report or $49-99/mo.
[T6] TSRF SCORE (reaffirmed) — Solar Access % + TSRF per roof face (>=75% good) from Google flux we already pull. The installer-trust metric.
