# Deep Playwright audit — roof & solar quote widget (2026-06-22)

Six parallel agents drove the live widget (desktop + 375px mobile) across: solar flow, battery/EV/customize, roofing flow, the Roofr-style report + lead capture, map lens controls + edge cases, and mobile/cross-cutting. Screenshots in `claude-orchestrator/audits/deep/{solar,addons,roofing,report,map,mobile}/`.

## Verdict
The tool is in strong shape — clean mobile layout (zero horizontal overflow), sound core math, honest copy, and several genuine differentiators (per-unit rowhome sectioning, SREC inline, sun-path shadow play, free Roofr-class measurement report). The audit found one cluster of trust-eroding correctness bugs (now fixed) and a backlog of polish + launch-infra items.

## FIXED & verified this pass (15)
See ROADMAP.md for the itemized list with verification evidence. Highlights:
- **Measurement consistency (P0):** the widget showed two different roof-size numbers on the same screen (Google area vs the facet-model reconstruction — 2.9 vs 11 squares on one roof). `reconcileTotals()` now anchors the model to Google's authoritative area; card stat = report = takeoff = waste = price, one number everywhere.
- **EV panels never reached the system summary (P1):** adding an EV raised the *price* but Panels/kW/kWh stayed flat — customer paid for panels the summary never showed. Now the headline system grows (18 → 26, "+8 EV") with SREC/CO₂ following.
- **"Whole building" dead-end (HIGH):** attached homes that toggled to whole-building landed in a commercial card with no way back to their unit. Now has a "⌂ My section" return + correct CTA ("Request commercial quote").
- **Card↔report price mismatch (P1):** report monthly was higher than the teaser the homeowner just saw ($446 vs $403). Now matched.
- **Region misdetection (MED):** "Mt Vernon, CA" resolved to Montana (wrong SREC/incentives); fixed (tail-first scan, 8/8).
- **Lead loss on POST failure (P0):** leads silently dropped on a failed network call; now queued to localStorage + retried.
- **Card coupled to 3D/WebGL (MED):** a WebGL failure suppressed the whole price card; decoupled — card renders first, 3D is enhancement.
- Plus: email validation, tab selected-state outline, empty-address guard, Escape-to-close, lead-modal labels, tap-target heights, print/PDF CSS.

## OPEN — launch-infra (not widget logic)
1. **Solar API quota / caching (HIGH for launch).** `/solar` + `/datalayers` aren't cached — every page load is a billable Google call, and 6 concurrent audit agents exhausted the daily quota (everyone then got a 403 + no card). Before public traffic: cache buildingInsights/dataLayers to disk (captures already are), and/or put the public widget on its own Solar key with quota monitoring. The prod `GOOGLE_MAPS_API_KEY` is also *blocked* for the Solar API — the widget must use a Solar-enabled key.
2. **serve.mjs stability.** The spike dev server is single-threaded and died repeatedly under load (the SwiftShader capture path). Fine for a spike; for production embedding it needs request queuing / a worker pool for `/capture`.
3. **Corrupt local Satoshi woff2** throws an OTS parse error on every load (cosmetic; falls back to system font).

## OPEN — polish backlog (LOW/MED, not yet done)
- `$0`/no-bill state leaves KPIs undefined (add an empty-state prompt).
- Size slider can exceed the physical roof (cap at 100% or label "with roof expansion").
- Help-cue placement is right-of-label, not top-left per DESIGN-SYSTEM (systemic across option rows — a pattern decision).
- Material modal hero image is top-biased and can crop the roofline.
- Roofing breakdown is one opaque line by default — itemize material/labor/tear-off as derived sub-lines ("show me the math" is the #1 trust lever).
- Performance: #go → card ≈ 9–10s when healthy; acceptable, covered by the spinner.

## Intentionally NOT changed
- **Report branding placeholders** ("[Your Company Name]" etc.) — these are by design per Alex (show trades where their info goes, Roofr-style); a configured tenant shows real branding. Left as-is.
- **"Saves $/mo" flat when EV added** — EV is gas-avoidance, not power-bill savings; defensible. (Could add an EV gas-savings line — see features.)

## Needs a real-browser / tunnel re-verify (headless can't render)
The 3D Google map + Three.js scene don't render in headless, so these were logic/DOM-verified only and need an eyes-on pass on the live tunnel: per-panel production coloring, animated sun-path shadows, desktop rotate, the before/after material "see it on your house" render, and the report measurement diagram raster.

## Feature ideas to beat Aurora / Google Sunroof / Roofr / Hover (synthesized)
Ranked by differentiation × effort:
1. **Instant address → installed price + $/mo financing on first paint.** Sunroof shows savings but no price/monthly; Aurora needs a rep. We already show price + loan + lease in one card — lead the marketing on it.
2. **Per-unit rowhome/townhouse solar** ("solar for your unit, not the whole block"). None of the three do this well. Now that the dead-end is fixed, make it a headline.
3. **EV → real money.** "Charging on sunshine saves ~$X/yr vs gas / replaces ~Y gal" using the miles→kWh already computed. Ties the EV add-on to a dollar story competitors hide.
4. **Make the system visibly grow** (now wired: 18→26 +EV) + a live "solar offset %" that dips when EV load is added then climbs as panels are added — the exact narrative Aurora/Tesla bury.
5. **Stacked 25-yr value chart** with SREC + bill savings as separate bands (DC SREC ≈ $5k/yr is far more compelling than "incentives may apply").
6. **Sun-lens upgrades:** per-facet "worst-month shade %" badge, solstice compare, and per-panel kWh/yr on hover (data already in roofSegmentStats — Aurora paywalls this).
7. **Roofr-beating report:** pipe the already-collected lead-quality score (hot/warm/cold + priorities) to the installer's CRM; add a measurement-confidence badge on the diagram; "measured, not guessed" provenance line.
8. **Mobile conversion:** sticky bottom price+CTA bar; one-tap "Text me this quote" (phone already optional).
9. **Insurance/storm-claim mode** (ACV/RCV + deductible, recent hail/wind for the address) — a homeowner-facing claims helper none of the contractor-tools offer.
