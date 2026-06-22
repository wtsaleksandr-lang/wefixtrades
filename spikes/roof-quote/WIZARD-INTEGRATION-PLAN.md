# Adaptive Wizard for the Roof & Solar Visualizer template — implementation plan

**Diagnosis:** the render-swap is already wired (`widgetKind==='roof_visualizer'` → iframe in `AdvancedCalculator.tsx:1948-1956`, `RoofVisualizerEmbed` :1880-1938). Three real gaps:
1. Left config panel is the generic form-builder (irrelevant) — never keyed on `widgetKind`.
2. The iframe receives NO config — `TENANT` (roof3d.html ~679-696) is hardcoded; no postMessage/params.
3. "Clicking controls does nothing" — the builder's form-oriented preview overlay (`PreviewPane` onPreviewSpotEdit) intercepts pointer events over the iframe; must be suppressed for roof_visualizer.

## Adaptive menu (when widgetKind==='roof_visualizer')
Swap `BuildTab` → new `RoofWidgetBuildPanel`. HIDE: Fields, Calculations, Layout/pricing-tiers, StepContent, Titles, Generate-AI. KEEP: TemplateStrip, Business. NEW sections (reuse AdvancedSection/FloatField/InfoCue):
- **Branding & trust** → TENANT.trade.{company,logo,license,phone,email,web,tagline,about,promises[],certifications[],rating,reviews} (reuse `businessProfile` rating/reviews/license, types.ts:402 / BusinessProfile templatePresets.ts:10331)
- **Financing** → TENANT.financing.{solarApr,solarYears,roofApr,roofYears,leaseEnabled,leasePerKwMo}
- **Features & lenses** (toggles) → TENANT.features.{battery,ev,srec,leasePPA,leadQual,sizeSlider,report}
- **Lead capture** (repurpose Action tab) → settings.leadEmail + header title/subtitle (RoofVisualizerEmbed reads header.title/subtitle AdvancedCalculator.tsx:1889-1891)
- **Theme** (trim Style tab) → accent only

## Mechanism (lowest risk — NO shell fork)
- Hoist `const isRoofWidget = getTemplatePreset(state.activeTemplateId)?.widgetKind==='roof_visualizer'` in WizardShell (widgetKind already derived :2439-2443).
- Branch Build render at desktop :2237 + mobile :2518: isRoofWidget ? RoofWidgetBuildPanel : BuildTab.
- Prop-gate the other tabs (Style/Settings/Action) to trim sections via an `isRoofWidget` bool.
- State: add `ShellSettings.roofWidget?: RoofWidgetConfig` (types.ts ~294), persist via buildAdvancedConfig passthrough (mirror businessProfile :290-292; widgetKind already :287-288).

## Config → widget data flow
- **Preview + runtime bridge: postMessage** (same-origin iframe). Host posts `{type:'qq:tenant-config', tenant}` on load + on change. Widget adds a `message` listener + makes `TENANT` mutable + `applyTenant()` re-runs feature gates (leadQual/srec/lease) and re-renders. Edit BOTH roof3d.html copies (spike + server/roofQuote/assets), in sync.
- **Published widget: server-side `window.__TENANT__` injection** next to `__TILES__` (roofQuoteRoutes.ts:41-60), keyed by ?token=/?slug= → lookup advanced.roofWidget; bust the `_widgetHtml` memo. First-paint branding, no flash.
- **Lead bridge** (resolves templateLibrary.ts:164-166 TODO): widget posts `{type:'qq:lead'}` up → host → real lead pipeline via settings.leadEmail; wire the no-op /api/roofquote/lead (:266-268).

## Phases
- **P0 (ship first, tiny):** hoist isRoofWidget; render minimal RoofWidgetBuildPanel stub (TemplateStrip+Business+placeholder); hide irrelevant BuildTab sections; SUPPRESS the preview click-overlay so the iframe is interactive. Guard: copilot-forms (new surface needs useCopilotForm or exempt).
- **P1:** Branding/Financing/Features sections + ShellSettings.roofWidget + buildAdvancedConfig passthrough. Verify save→reopen round-trip.
- **P2:** postMessage config injection into the iframe (mutable TENANT + listener + applyTenant in both roof3d.html copies). Playwright: posting config visibly changes the widget.
- **P3:** published-widget __TENANT__ injection (?token) + lead bridge + real /api/roofquote/lead.
- **P4:** rail relabel Action→Lead capture, trim Style/Settings, mobile 375 visual gate.

## Separate prod bug (not part of this): no_solar
ROOFQUOTE_SOLAR_KEY unset in all envs → solar falls back to Solar-blocked GOOGLE_MAPS_API_KEY. Fix = set ROOFQUOTE_SOLAR_KEY to a Solar-enabled key (prod secret — needs Alex OK on key/cost).
